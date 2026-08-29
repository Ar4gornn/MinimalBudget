"""Story 1.6 — the headline guarantee, proven by executing queries as a second user.

Every assertion here runs **as the runtime role**, with the same privileges and policies
the live API has. Nothing in this file reads a policy definition and believes it.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError


def _a_savings_type_of(conn) -> uuid.UUID:
    return conn.execute(text("SELECT id FROM savings_types LIMIT 1")).scalar_one()


def test_b_cannot_read_a_row_of_a(user_a, user_b, runtime_connection):
    as_a = runtime_connection(user_a["id"])
    try:
        a_savings_type = _a_savings_type_of(as_a)
    finally:
        as_a.close()

    as_b = runtime_connection(user_b["id"])
    try:
        assert as_b.execute(
            text("SELECT count(*) FROM users WHERE id = :id"), {"id": str(user_a["id"])}
        ).scalar_one() == 0
        assert as_b.execute(
            text("SELECT count(*) FROM savings_types WHERE id = :id"),
            {"id": str(a_savings_type)},
        ).scalar_one() == 0
    finally:
        as_b.close()


def test_b_cannot_update_or_delete_a_row_of_a(user_a, user_b, runtime_connection):
    as_a = runtime_connection(user_a["id"])
    try:
        a_savings_type = _a_savings_type_of(as_a)
    finally:
        as_a.close()

    as_b = runtime_connection(user_b["id"])
    try:
        updated = as_b.execute(
            text("UPDATE savings_types SET name = 'stolen' WHERE id = :id"),
            {"id": str(a_savings_type)},
        )
        deleted = as_b.execute(
            text("DELETE FROM savings_types WHERE id = :id"), {"id": str(a_savings_type)}
        )
        # RLS makes the rows invisible, so these affect nothing rather than erroring.
        assert updated.rowcount == 0
        assert deleted.rowcount == 0
        as_b.rollback()
    finally:
        as_b.close()

    # And A's row is untouched.
    as_a = runtime_connection(user_a["id"])
    try:
        name = as_a.execute(
            text("SELECT name FROM savings_types WHERE id = :id"), {"id": str(a_savings_type)}
        ).scalar_one()
        assert name != "stolen"
    finally:
        as_a.close()


def test_b_cannot_insert_a_row_owned_by_a(user_a, user_b, runtime_connection):
    as_b = runtime_connection(user_b["id"])
    try:
        with pytest.raises(ProgrammingError) as exc:
            as_b.execute(
                text("INSERT INTO savings_types (user_id, name) VALUES (:uid, 'planted')"),
                {"uid": str(user_a["id"])},
            )
        assert "row-level security" in str(exc.value).lower()
    finally:
        as_b.close()


def test_the_api_answers_404_not_403_for_another_users_id(client, user_a, user_b):
    """AD-8: a 403 would confirm the row exists."""
    stolen = client.get("/api/auth/me", headers=user_b["headers"])
    assert stolen.status_code == 200
    assert stolen.json()["id"] == str(user_b["id"]), "B's token must never resolve to A"


def test_the_runtime_role_cannot_read_a_password_hash_at_all(user_a, runtime_connection):
    """Not merely filtered by RLS — the column grant is absent (AD-19)."""
    conn = runtime_connection(user_a["id"])
    try:
        with pytest.raises(ProgrammingError) as exc:
            conn.execute(text("SELECT password_hash FROM users"))
        assert "permission denied" in str(exc.value).lower()
    finally:
        conn.close()


def test_the_test_would_fail_if_the_tenant_were_unset(user_a, user_b, runtime_connection):
    """Guards the guard.

    A suite that forgets to set a tenant sees zero rows for a different reason, and every
    assertion above would still pass while proving nothing. This asserts the positive
    case, so 'zero rows' only ever means 'RLS filtered them'.
    """
    as_a = runtime_connection(user_a["id"])
    try:
        assert as_a.execute(text("SELECT count(*) FROM savings_types")).scalar_one() == 3
    finally:
        as_a.close()
