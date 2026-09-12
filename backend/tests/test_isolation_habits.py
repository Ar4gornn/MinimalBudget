"""Story 23.1 — the second-user proof extended to habits and check-ins (AD-24, AR-5).

Same shape as the ledger, savings, inventory and gym proofs: run as the **runtime role**
with B's tenancy and assert zero rows of A's on read and refusal on write, then the same
through the API where another user's id is a 404 and never a 403 (AD-8).

The composite foreign key case is the one that matters. Postgres foreign-key checks always
bypass row security, so with a bare `habit_id` on `habit_checkins`, user B could record a
check-in against user A's habit — learning that the id exists, and leaving A unable to
delete it. Proven here by executing the insert, not by reading the constraint (AD-18).
"""

import datetime as dt

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, ProgrammingError


def _seed(client, user):
    habit = client.post(
        "/api/habits",
        json={"name": "Run", "schedule_kind": "daily", "target_count": 1},
        headers=user["headers"],
    ).json()
    checkin = client.post(
        f"/api/habits/{habit['id']}/checkins", json={}, headers=user["headers"]
    ).json()
    return habit, checkin


def test_b_sees_none_of_a_rows(client, user_a, user_b, runtime_connection):
    habit, checkin = _seed(client, user_a)

    conn = runtime_connection(user_b["id"])
    try:
        for table, row_id in (("habits", habit["id"]), ("habit_checkins", checkin["id"])):
            assert (
                conn.execute(
                    text(f"SELECT count(*) FROM {table} WHERE id = :id"),  # noqa: S608
                    {"id": row_id},
                ).scalar_one()
                == 0
            )
    finally:
        conn.close()

    headers = user_b["headers"]
    assert client.get("/api/habits", headers=headers).json()["items"] == []
    assert client.get("/api/habits?archived=true", headers=headers).json()["items"] == []
    assert client.get("/api/habits/progress", headers=headers).json()["items"] == []
    assert client.get("/api/habits/checkins", headers=headers).json()["items"] == []


def test_b_cannot_write_a_row_owned_by_a(client, user_a, user_b, runtime_connection):
    habit, checkin = _seed(client, user_a)

    conn = runtime_connection(user_b["id"])
    try:
        assert (
            conn.execute(
                text("UPDATE habits SET target_count = 99 WHERE id = :id"), {"id": habit["id"]}
            ).rowcount
            == 0
        )
        assert (
            conn.execute(
                text("UPDATE habit_checkins SET done_at = TIME '09:00' WHERE id = :id"),
                {"id": checkin["id"]},
            ).rowcount
            == 0
        )
        assert (
            conn.execute(
                text("DELETE FROM habit_checkins WHERE id = :id"), {"id": checkin["id"]}
            ).rowcount
            == 0
        )
        assert (
            conn.execute(text("DELETE FROM habits WHERE id = :id"), {"id": habit["id"]}).rowcount
            == 0
        )
    finally:
        conn.close()


def test_b_cannot_reference_a_habit_of_a(client, user_a, user_b, runtime_connection):
    """AD-18. The foreign key check bypasses RLS, so only `user_id` in the key stops this.

    Made to fail on purpose by reducing `habit_checkins_habit_fkey` to `(habit_id)`: the
    insert below succeeded, and A's habit could no longer be deleted.
    """
    habit, _ = _seed(client, user_a)

    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO habit_checkins (user_id, habit_id, done_on) "
                    "VALUES (:uid, :hid, CAST(:d AS date))"
                ),
                {"uid": str(user_b["id"]), "hid": habit["id"], "d": dt.date.today()},
            )
    finally:
        conn.rollback()
        conn.close()


def test_b_cannot_smuggle_a_row_in_under_as_row_id(client, user_a, user_b, runtime_connection):
    """The WITH CHECK half of the policy: B may not insert a row stamped with A's user_id."""
    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises((ProgrammingError, IntegrityError)):
            conn.execute(
                text(
                    "INSERT INTO habits (user_id, name, schedule_kind, target_count, started_on) "
                    "VALUES (:uid, 'Smuggled', 'daily', 1, CAST(:d AS date))"
                ),
                {"uid": str(user_a["id"]), "d": dt.date.today()},
            )
    finally:
        conn.rollback()
        conn.close()


def test_a_habit_of_a_is_404_for_b_not_403(client, user_a, user_b):
    habit, checkin = _seed(client, user_a)
    headers = user_b["headers"]

    assert client.patch(
        f"/api/habits/{habit['id']}", json={"target_count": 5}, headers=headers
    ).status_code == 404
    assert client.delete(f"/api/habits/{habit['id']}", headers=headers).status_code == 404
    assert client.post(
        f"/api/habits/{habit['id']}/checkins", json={}, headers=headers
    ).status_code == 404
    assert client.delete(
        f"/api/habits/{habit['id']}/checkins/{checkin['id']}", headers=headers
    ).status_code == 404
    assert client.get(
        f"/api/habits/{habit['id']}/heatmap", headers=headers
    ).status_code == 404
    assert client.get(
        f"/api/habits/checkins?habit_id={habit['id']}", headers=headers
    ).status_code == 404


def test_one_accounts_habits_never_reach_anothers_digest(client, user_a, user_b):
    """AD-34: the notifier runs one tenant at a time, so a habit must not leak into a
    neighbour's notification any more than into their screen."""
    from app.core.db import tenant_session
    from app.services import push

    client.post(
        "/api/habits",
        json={"name": "Run", "schedule_kind": "daily", "target_count": 1, "remind": True},
        headers=user_a["headers"],
    )

    with tenant_session(user_b["id"]) as session:
        assert push.digest(session, user_b["id"]).habit_names == []
    with tenant_session(user_a["id"]) as session:
        assert push.digest(session, user_a["id"]).habit_names == ["Run"]
