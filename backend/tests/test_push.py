"""Epic 18 — push subscriptions and the digest.

Nothing here sends a push: sending needs the network and lives in `notify.py`. What is
tested is what the API stores, what the digest says, and the two rules that are easy to get
wrong — a device that changes hands, and a person who must not be told about someone else's
fridge.
"""

import datetime as dt

import pytest
from sqlalchemy import text

from app.core.config import get_settings
from app.services.push import Digest

ENDPOINT = "https://push.example.com/subscription/abc"


@pytest.fixture
def push_on():
    """Push is off unless the instance has VAPID keys; these tests need it on."""
    settings = get_settings()
    before = (settings.vapid_public_key, settings.vapid_private_key, settings.vapid_subject)
    settings.vapid_public_key = "BLtestpublickey"
    settings.vapid_private_key = "testprivatekey"
    settings.vapid_subject = "mailto:ops@example.com"
    yield
    (
        settings.vapid_public_key,
        settings.vapid_private_key,
        settings.vapid_subject,
    ) = before


def _subscribe(client, user, endpoint=ENDPOINT, p256dh="p256", auth="auth"):
    return client.post(
        "/api/push/subscribe",
        json={"endpoint": endpoint, "p256dh": p256dh, "auth": auth},
        headers=user["headers"],
    )


def _status(client, user):
    response = client.get("/api/push/status", headers=user["headers"])
    assert response.status_code == 200, response.text
    return response.json()


# ------------------------------------------------------- off by default


def test_push_is_off_until_the_instance_is_given_keys(client, user_a):
    """AD-15: no secret has a working default, so there is no fallback key to fall back to."""
    assert _status(client, user_a) == {"enabled": False, "devices": 0}
    assert client.get("/api/push/key", headers=user_a["headers"]).status_code == 503
    assert _subscribe(client, user_a).status_code == 503


def test_turning_it_off_works_even_when_push_is_disabled(client, user_a):
    """Whatever else is broken, a person must always be able to stop being notified."""
    response = client.post(
        "/api/push/unsubscribe", json={"endpoint": ENDPOINT}, headers=user_a["headers"]
    )
    assert response.status_code == 204


# ------------------------------------------------------- subscriptions


def test_a_device_subscribes_and_is_counted(client, user_a, push_on):
    assert client.get("/api/push/key", headers=user_a["headers"]).json()["public_key"]
    assert _subscribe(client, user_a).status_code == 204
    assert _status(client, user_a) == {"enabled": True, "devices": 1}


def test_subscribing_twice_from_one_device_is_one_row(client, user_a, push_on):
    _subscribe(client, user_a)
    _subscribe(client, user_a, p256dh="rotated", auth="rotated")
    assert _status(client, user_a)["devices"] == 1


def test_two_devices_are_two_rows(client, user_a, push_on):
    _subscribe(client, user_a, endpoint=ENDPOINT + "/phone")
    _subscribe(client, user_a, endpoint=ENDPOINT + "/laptop")
    assert _status(client, user_a)["devices"] == 2


def test_a_device_handed_to_another_person_stops_notifying_the_first(
    client, user_a, user_b, push_on
):
    """The endpoint identifies a browser install, not a person.

    If B signs in on A's old phone, the subscription must move. Leaving it with A means A
    keeps being told what is in B's fridge — from a device A no longer holds.
    """
    _subscribe(client, user_a)
    assert _status(client, user_a)["devices"] == 1

    _subscribe(client, user_b)
    assert _status(client, user_b)["devices"] == 1
    assert _status(client, user_a)["devices"] == 0


def test_the_release_function_can_only_delete_and_tells_the_caller_nothing(
    client, user_a, user_b, push_on, runtime_connection
):
    """The narrow hole of migration 0013, checked for what it must *not* be able to do.

    It exists so a handed-on device can be re-subscribed. It returns void, so it cannot
    report whether an endpoint existed, and it cannot read, move or reveal a row.
    """
    _subscribe(client, user_a)

    conn = runtime_connection(user_b["id"])
    try:
        # No return value to learn anything from, present or absent.
        assert (
            conn.execute(
                text("SELECT push_release_endpoint(:e)"), {"e": "https://push.example.com/nope"}
            ).scalar_one()
            is None
        )
        # Still cannot read a single row of A's, before or after.
        assert conn.execute(text("SELECT count(*) FROM push_subscriptions")).scalar_one() == 0
        # And a direct delete — without the function — is refused by RLS as always.
        assert (
            conn.execute(
                text("DELETE FROM push_subscriptions WHERE endpoint = :e"), {"e": ENDPOINT}
            ).rowcount
            == 0
        )
        conn.commit()
    finally:
        conn.close()

    assert _status(client, user_a)["devices"] == 1


def test_unsubscribing_is_idempotent_and_scoped_to_the_caller(client, user_a, user_b, push_on):
    _subscribe(client, user_a)

    # B cannot unsubscribe A's device by naming its endpoint.
    assert (
        client.post(
            "/api/push/unsubscribe", json={"endpoint": ENDPOINT}, headers=user_b["headers"]
        ).status_code
        == 204
    )
    assert _status(client, user_a)["devices"] == 1

    for _ in range(2):
        assert (
            client.post(
                "/api/push/unsubscribe", json={"endpoint": ENDPOINT}, headers=user_a["headers"]
            ).status_code
            == 204
        )
    assert _status(client, user_a)["devices"] == 0


def test_subscriptions_need_a_token_and_b_sees_none_of_as(
    client, user_a, user_b, push_on, runtime_connection
):
    _subscribe(client, user_a)
    assert client.get("/api/push/status").status_code == 401
    assert _status(client, user_b)["devices"] == 0

    conn = runtime_connection(user_b["id"])
    try:
        assert conn.execute(text("SELECT count(*) FROM push_subscriptions")).scalar_one() == 0
    finally:
        conn.close()


# -------------------------------------------------------------- digest


def test_the_digest_is_empty_when_there_is_nothing_to_say(client, user_a):
    from app.core.db import tenant_session
    from app.services import push

    with tenant_session(user_a["id"]) as session:
        assert push.digest(session, user_a["id"]).empty


def test_the_digest_counts_low_stock_and_waiting_entries(client, user_a):
    from app.core.db import tenant_session
    from app.services import push

    client.post("/api/inventory/spaces", json={"name": "Fridge"}, headers=user_a["headers"])
    for name in ("Milk", "Eggs"):
        client.post(
            "/api/inventory/items",
            json={"name": name, "quantity": 0, "restock_below": 1, "space_name": "Fridge"},
            headers=user_a["headers"],
        )
    client.post(
        "/api/recurring/templates",
        json={
            "kind": "expense",
            "amount": "1200.00",
            "cadence": "monthly",
            "start_on": "2026-07-01",
            "category_name": "Rent",
        },
        headers=user_a["headers"],
    )
    client.get("/api/recurring/pending", headers=user_a["headers"])

    with tenant_session(user_a["id"]) as session:
        found = push.digest(session, user_a["id"])

    assert not found.empty
    assert found.low_items == 2
    assert found.pending >= 1
    assert "2 items need restocking" in found.body
    assert "Eggs, Milk" in found.body
    assert "recurring" in found.body


def test_the_digest_reads_nothing_of_another_users(client, user_a, user_b):
    from app.core.db import tenant_session
    from app.services import push

    client.post("/api/inventory/spaces", json={"name": "Fridge"}, headers=user_a["headers"])
    client.post(
        "/api/inventory/items",
        json={"name": "Milk", "quantity": 0, "restock_below": 1, "space_name": "Fridge"},
        headers=user_a["headers"],
    )

    with tenant_session(user_b["id"]) as session:
        assert push.digest(session, user_b["id"]).empty


@pytest.mark.parametrize(
    ("low", "pending", "names", "expected"),
    [
        (1, 0, ["Milk"], "1 item needs restocking (Milk)."),
        (0, 1, [], "1 recurring entry is waiting."),
        (0, 3, [], "3 recurring entries are waiting."),
        (
            4,
            2,
            ["Eggs", "Milk", "Rice", "Salt"],
            "4 items need restocking (Eggs, Milk, Rice, …). 2 recurring entries are waiting.",
        ),
    ],
)
def test_the_body_reads_as_a_sentence(low, pending, names, expected):
    assert Digest(low, pending, names).body == expected


def test_a_digest_is_marked_sent_for_one_day(client, user_a, push_on):
    """The rule that keeps it bearable: at most one notification per device per day."""
    from app.core.db import tenant_session
    from app.services import push

    _subscribe(client, user_a)
    today = dt.date(2026, 9, 5)

    with tenant_session(user_a["id"]) as session:
        [subscription] = push.list_subscriptions(session, user_a["id"])
        assert subscription.notified_on is None
        push.mark_notified(session, subscription.id, today)

    with tenant_session(user_a["id"]) as session:
        [subscription] = push.list_subscriptions(session, user_a["id"])
        assert subscription.notified_on == today

    # Re-subscribing clears it, so turning notifications off and on again works today.
    _subscribe(client, user_a)
    with tenant_session(user_a["id"]) as session:
        [subscription] = push.list_subscriptions(session, user_a["id"])
        assert subscription.notified_on is None


def test_a_dead_subscription_is_forgotten(client, user_a, push_on):
    from app.core.db import tenant_session
    from app.services import push

    _subscribe(client, user_a)
    with tenant_session(user_a["id"]) as session:
        push.forget(session, ENDPOINT)
    assert _status(client, user_a)["devices"] == 0
