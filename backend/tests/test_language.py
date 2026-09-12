"""The language the account reads in, and the codes that let a client say things itself.

Epic 25, stories 25.1 and 25.2.

Two things are under test here and they are two halves of one decision. The **language** is
a column on the account (0019) rather than a browser preference, so that a phone and a
laptop agree and so that a push notification composed by cron hours later can be French.
The **error code** (AD-44) is what lets the client own every displayed word: the API keeps
answering in English, and the client keys its own wording off a stable fact instead.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.conftest import register_user


def register(client, email, language=None):
    body = {"email": email, "password": "correct-horse-battery"}
    if language is not None:
        body["language"] = language
    return client.post("/api/auth/register", json=body)


# ---------------------------------------------------------------- the column


def test_the_default_is_english(client):
    response = register(client, "default@example.com")
    assert response.status_code == 201
    assert response.json()["language"] == "en"


@pytest.mark.parametrize("language", ["en", "fr"])
def test_a_language_can_be_chosen_at_sign_up(client, language):
    """Not because it is hard to change later — it is the easiest setting in the app — but
    so the first screen after registering is already in the right language."""
    response = register(client, f"{language}@example.com", language)
    assert response.status_code == 201
    assert response.json()["language"] == language


@pytest.mark.parametrize("bad", ["de", "EN", "", "french", "fr-CA"])
def test_an_unsupported_language_is_refused(client, bad):
    assert register(client, "nope@example.com", bad).status_code == 422


def test_the_database_refuses_an_unsupported_language_too(user_a, runtime_connection):
    """AD-24: validation is not the only guard, and the app is not the only writer."""
    conn = runtime_connection(user_a["id"])
    try:
        with pytest.raises(IntegrityError):
            conn.execute(
                text("UPDATE users SET language = 'de' WHERE id = :id"), {"id": user_a["id"]}
            )
    finally:
        conn.rollback()
        conn.close()


def test_the_language_changes_freely_and_is_never_locked(client, user_a):
    """The currency locks once the ledger has entries because changing it *relabels* stored
    numbers (AD-36). This changes the words drawn around numbers that do not move, so there
    is nothing for a lock to protect — and a lock here would be the app refusing to be
    read in French because somebody had once recorded a bus fare.
    """
    category = client.post(
        "/api/categories", json={"name": "Transport", "kind": "expense"},
        headers=user_a["headers"],
    ).json()
    created = client.post(
        "/api/entries",
        json={
            "kind": "expense",
            "category_id": category["id"],
            "amount": "12.50",
            "occurred_on": "2026-09-01",
        },
        headers=user_a["headers"],
    )
    assert created.status_code == 201, created.text

    changed = client.patch(
        "/api/auth/me/language", json={"language": "fr"}, headers=user_a["headers"]
    )
    assert changed.status_code == 200
    assert changed.json()["language"] == "fr"
    # And back again, as often as anyone likes.
    assert client.patch(
        "/api/auth/me/language", json={"language": "en"}, headers=user_a["headers"]
    ).json()["language"] == "en"


def test_the_language_follows_the_account_not_the_device(client):
    """The whole reason it is a column. Signing in again — a different device, as far as
    the server can tell — reads back the same choice."""
    user = register_user(client, "roaming@example.com")
    client.patch("/api/auth/me/language", json={"language": "fr"}, headers=user["headers"])

    again = client.post(
        "/api/auth/login",
        json={"email": "roaming@example.com", "password": user["password"]},
    ).json()
    profile = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {again['access_token']}"}
    ).json()
    assert profile["language"] == "fr"


def test_one_accounts_language_is_not_anothers(client, user_a, user_b):
    client.patch("/api/auth/me/language", json={"language": "fr"}, headers=user_a["headers"])
    assert client.get("/api/auth/me", headers=user_b["headers"]).json()["language"] == "en"


# ----------------------------------------------------------------- the codes


def test_every_refusal_carries_a_code_beside_its_sentence(client, user_a):
    """AD-44. The sentence stays English and is the fallback; the code is what a French
    screen keys its own wording off.

    Made to fail by leaving the handlers as they were: every body had `detail` and nothing
    else, so the client's only options were to show English or to show nothing.
    """
    client.post(
        "/api/habits", json={"name": "Run", "schedule_kind": "daily"},
        headers=user_a["headers"],
    )
    clash = client.post("/api/habits", json={"name": "run"}, headers=user_a["headers"])
    assert clash.status_code == 409
    assert clash.json()["code"] == "habit_name_taken"
    assert isinstance(clash.json()["detail"], str), "detail stays a sentence, not an object"


@pytest.mark.parametrize(
    ("method", "path", "body", "status", "code"),
    [
        ("post", "/api/auth/login", {"email": "nobody@example.com", "password": "wrong-enough"},
         401, "credentials_invalid"),
        ("post", "/api/auth/refresh", {"refresh_token": "nonsense"}, 401, "session_expired"),
    ],
)
def test_the_unauthenticated_refusals_carry_codes_too(client, method, path, body, status, code):
    """These are the ones a sign-in screen actually renders, and the ones that used to be
    indistinguishable: a wrong password and an expired session are both 401, and only the
    code tells them apart. Guessing from the status is what produced "Your session has
    expired" on a mistyped password.
    """
    response = getattr(client, method)(path, json=body)
    assert response.status_code == status
    assert response.json()["code"] == code


def test_a_route_that_does_not_exist_still_answers_the_old_shape(client):
    """The catch-all handler must not change what FastAPI's own 404 looks like — `detail`
    stays a string, and `code` is added rather than substituted."""
    response = client.get("/api/nothing-here")
    assert response.status_code == 404
    assert isinstance(response.json()["detail"], str)
    assert response.json()["code"] == "error"


def test_a_validation_failure_carries_a_code_too(client, user_a):
    """FastAPI's own 422 was the one family of errors without a code — and the one a typo
    produces most often, so the client had nothing to key off and fell back to rendering
    pydantic's English.

    `detail` keeps exactly the shape FastAPI would have sent, so nothing that reads it
    breaks; `code` is added beside it, not substituted.
    """
    refused = client.post(
        "/api/habits",
        json={"name": "Probe", "schedule_kind": "every_n_days", "interval_days": 1},
        headers=user_a["headers"],
    )
    assert refused.status_code == 422
    body = refused.json()
    assert body["code"] == "validation"
    assert isinstance(body["detail"], list), "the field errors are still there"
    assert body["detail"][0]["loc"][-1] == "interval_days"


def test_an_emptied_time_is_not_a_time_at_all(client, user_a):
    """The client sends null for "did it, did not say when". The empty string it used to
    send was a 422; null is a check-in with no time, which is a state this model has."""
    habit = client.post(
        "/api/habits", json={"name": "Water", "schedule_kind": "daily"},
        headers=user_a["headers"],
    ).json()
    recorded = client.post(
        f"/api/habits/{habit['id']}/checkins",
        json={"done_at": None},
        headers=user_a["headers"],
    )
    assert recorded.status_code == 201
    assert recorded.json()["done_at"] is None


def test_a_bad_month_says_which_kind_of_bad_it_is(client, user_a):
    response = client.get("/api/entries?month=nonsense", headers=user_a["headers"])
    assert response.status_code == 422
    assert response.json()["code"] == "month_invalid"


# ---------------------------------------------------------------- the digest


def _digest_body(client, user, language):
    from app.core.db import tenant_session
    from app.services import push

    client.patch("/api/auth/me/language", json={"language": language}, headers=user["headers"])
    with tenant_session(user["id"]) as session:
        return push.digest(session, user["id"]).body


def test_the_digest_is_written_in_the_accounts_language(client, user_a):
    """The one place the server writes prose, because a push notification has no client to
    translate it (AD-44's exception, stated in `services/push.py`)."""
    client.post(
        "/api/habits",
        json={"name": "Courir", "schedule_kind": "daily", "remind": True},
        headers=user_a["headers"],
    )

    assert _digest_body(client, user_a, "en") == "1 habit still to do (Courir)."
    assert _digest_body(client, user_a, "fr") == "1 habitude à faire (Courir)."


def test_french_takes_the_singular_for_one_and_the_plural_for_two(client, user_a):
    """Made to fail with an English `!= 1` plural rule: French agrees for 1 and 2 and
    disagrees at 0, which is why the rule is written down rather than assumed."""
    from app.services.push import Digest

    assert Digest(0, 1, [], language="fr").body == "1 opération récurrente en attente."
    assert Digest(0, 2, [], language="fr").body == "2 opérations récurrentes en attente."
    assert Digest(0, 1, [], language="en").body == "1 recurring entry is waiting."
    assert Digest(0, 2, [], language="en").body == "2 recurring entries are waiting."


def test_an_unknown_language_falls_back_to_english_rather_than_crashing(client):
    """A row written before a catalogue existed, or by a newer build that was rolled back.
    A notification in the wrong language is a smaller failure than a cron job that dies."""
    from app.services.push import Digest

    assert Digest(1, 0, ["Rice"], language="de").body == "1 item needs restocking (Rice)."


def test_the_digest_names_at_most_three_and_says_there_are_more(client, user_a):
    from app.services.push import Digest

    names = ["A", "B", "C", "D"]
    assert Digest(4, 0, names, language="en").body == "4 items need restocking (A, B, C, …)."
    assert Digest(4, 0, names, language="fr").body == "4 articles à racheter (A, B, C, …)."
