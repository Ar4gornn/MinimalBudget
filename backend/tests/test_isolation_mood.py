"""Story 24.1 — the second-user proof extended to the mood table (AD-24, AR-5).

Same shape as the ledger, savings, inventory, gym and habits proofs: run as the **runtime
role** with B's tenancy and assert zero rows of A's on read and refusal on write.

There is one thing to be careful about here that the other proofs did not have. A mood day
is addressed by its **date**, not by an id — so the usual "another user's id is a 404" check
does not apply, and there is no id to enumerate. What must hold instead is that B asking for
the same *date* sees B's own answer or none at all, never A's; and that B writing that date
writes B's own row rather than overwriting A's. Both are executed below.
"""

import datetime as dt

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, ProgrammingError

TODAY = dt.date.today().isoformat()


def _seed(client, user, **body):
    response = client.put(
        f"/api/mood/days/{TODAY}", json=body or {"mood": 4, "day_ok": True}, headers=user["headers"]
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_b_sees_none_of_a_rows(client, user_a, user_b, runtime_connection):
    _seed(client, user_a, mood=5, day_ok=True, note="A had a good day")

    conn = runtime_connection(user_b["id"])
    try:
        assert (
            conn.execute(text("SELECT count(*) FROM mood_days")).scalar_one() == 0
        )
    finally:
        conn.close()

    headers = user_b["headers"]
    assert client.get("/api/mood/days", headers=headers).json()["items"] == []
    assert client.get("/api/mood/history", headers=headers).json()["days_answered"] == 0
    # The same date, asked for by the neighbour: nulls, never A's answer.
    assert client.get(f"/api/mood/days/{TODAY}", headers=headers).json() == {
        "on": TODAY,
        "mood": None,
        "day_ok": None,
        "note": None,
    }


def test_b_writing_the_same_date_writes_their_own_row(client, user_a, user_b):
    """The unique key is ``(user_id, on_day)``, not ``(on_day)``.

    Made to fail on purpose by reducing it to ``UNIQUE (on_day)``: B's write was refused
    with a 500 for a row B could not see — which is both a broken feature and an oracle
    telling B that somebody else answered today.
    """
    _seed(client, user_a, mood=5)
    _seed(client, user_b, mood=1)

    assert client.get(f"/api/mood/days/{TODAY}", headers=user_a["headers"]).json()["mood"] == 5
    assert client.get(f"/api/mood/days/{TODAY}", headers=user_b["headers"]).json()["mood"] == 1


def test_b_cannot_write_a_row_owned_by_a(client, user_a, user_b, runtime_connection):
    row = _seed(client, user_a)
    assert row["mood"] == 4

    conn = runtime_connection(user_b["id"])
    try:
        assert (
            conn.execute(text("UPDATE mood_days SET mood = 1")).rowcount == 0
        )
        assert conn.execute(text("DELETE FROM mood_days")).rowcount == 0
    finally:
        conn.close()

    assert client.get(f"/api/mood/days/{TODAY}", headers=user_a["headers"]).json()["mood"] == 4


def test_b_cannot_smuggle_a_row_in_under_as_row_id(client, user_a, user_b, runtime_connection):
    """The WITH CHECK half of the policy: B may not insert a row stamped with A's user_id."""
    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises((ProgrammingError, IntegrityError)):
            conn.execute(
                text(
                    "INSERT INTO mood_days (user_id, on_day, mood) "
                    "VALUES (:uid, CAST(:d AS date), 1)"
                ),
                {"uid": str(user_a["id"]), "d": TODAY},
            )
    finally:
        conn.rollback()
        conn.close()


def test_an_unset_tenant_sees_nothing(client, user_a, runtime_connection):
    """AD-3: a connection with no ``app.user_id`` matches no row rather than every row."""
    _seed(client, user_a)
    conn = runtime_connection(None)
    try:
        assert conn.execute(text("SELECT count(*) FROM mood_days")).scalar_one() == 0
    finally:
        conn.close()


def test_one_accounts_answers_never_reach_anothers_export(client, user_a, user_b):
    _seed(client, user_a, mood=5, note="A had a good day")
    body = client.get("/api/export/mood.csv", headers=user_b["headers"]).text
    assert "A had a good day" not in body
    assert body.strip().splitlines() == ["date,mood_1_to_5,day_was_good,note"]
