"""Story 2.4 — the second-user proof extended to categories and entries.

The interesting case is the last one. Postgres foreign-key checks bypass row-level
security, so RLS on its own does *not* stop user B referencing user A's category: B would
learn the id exists, and A could never delete that category again. AD-18 closes it by
putting user_id inside the foreign key.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, ProgrammingError


def _seed(client, user):
    category = client.post(
        "/api/categories", json={"name": "Rent", "kind": "expense"}, headers=user["headers"]
    ).json()
    entry = client.post(
        "/api/entries",
        json={
            "kind": "expense",
            "amount": "100.00",
            "occurred_on": "2026-08-01",
            "category_id": category["id"],
        },
        headers=user["headers"],
    ).json()
    return category, entry


def test_b_cannot_read_as_rows_or_through_the_api(client, user_a, user_b, runtime_connection):
    category, entry = _seed(client, user_a)

    conn = runtime_connection(user_b["id"])
    try:
        assert conn.execute(
            text("SELECT count(*) FROM categories WHERE id = :id"), {"id": category["id"]}
        ).scalar_one() == 0
        assert conn.execute(
            text("SELECT count(*) FROM entries WHERE id = :id"), {"id": entry["id"]}
        ).scalar_one() == 0
    finally:
        conn.close()

    assert client.get("/api/categories", headers=user_b["headers"]).json()["items"] == []
    assert client.get("/api/entries", headers=user_b["headers"]).json()["items"] == []


def test_b_cannot_write_a_row_owned_by_a(client, user_a, user_b, runtime_connection):
    category, entry = _seed(client, user_a)

    conn = runtime_connection(user_b["id"])
    try:
        assert conn.execute(
            text("UPDATE entries SET amount = 1 WHERE id = :id"), {"id": entry["id"]}
        ).rowcount == 0
        assert conn.execute(
            text("DELETE FROM entries WHERE id = :id"), {"id": entry["id"]}
        ).rowcount == 0
        with pytest.raises(ProgrammingError) as exc:
            conn.execute(
                text("INSERT INTO categories (user_id, kind, name) "
                     "VALUES (:uid, CAST('expense' AS entry_kind), 'planted')"),
                {"uid": str(user_a["id"])},
            )
        assert "row-level security" in str(exc.value).lower()
    finally:
        conn.close()

    still_there = client.get("/api/entries", headers=user_a["headers"]).json()["items"]
    assert still_there[0]["amount"] == "100.00"
    assert category["name"] == "Rent"


def test_b_cannot_reference_a_category_of_a_through_the_api(client, user_a, user_b):
    category, _ = _seed(client, user_a)
    response = client.post(
        "/api/entries",
        json={
            "kind": "expense",
            "amount": "1.00",
            "occurred_on": "2026-08-02",
            "category_id": category["id"],
        },
        headers=user_b["headers"],
    )
    assert response.status_code == 404
    assert client.get("/api/entries", headers=user_b["headers"]).json()["items"] == []


def test_the_foreign_key_itself_refuses_a_cross_user_reference(
    client, user_a, user_b, runtime_connection
):
    """AD-18, at the level the API cannot reach around.

    Even bypassing the service layer entirely — raw SQL, as the runtime role, with B's own
    user_id on the row so RLS is satisfied — the composite foreign key still refuses,
    because A's category is not a (user_id, id, kind) that exists for B.
    """
    category, _ = _seed(client, user_a)

    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises(IntegrityError) as exc:
            conn.execute(
                text(
                    "INSERT INTO entries (user_id, kind, category_id, amount, occurred_on) "
                    "VALUES (:uid, CAST('expense' AS entry_kind), :cid, 1, DATE '2026-08-02')"
                ),
                {"uid": str(user_b["id"]), "cid": category["id"]},
            )
        assert "entries_category_fkey" in str(exc.value)
    finally:
        conn.close()


def test_a_can_still_delete_a_category_b_tried_to_reference(client, user_a, user_b):
    """The covert-channel consequence: without AD-18, B's reference would pin A's row forever."""
    category = client.post(
        "/api/categories", json={"name": "Disposable", "kind": "expense"}, headers=user_a["headers"]
    ).json()
    client.post(
        "/api/entries",
        json={
            "kind": "expense",
            "amount": "1.00",
            "occurred_on": "2026-08-02",
            "category_id": category["id"],
        },
        headers=user_b["headers"],
    )
    assert (
        client.delete(f"/api/categories/{category['id']}", headers=user_a["headers"]).status_code
        == 204
    )


def test_the_positive_case_still_holds(client, user_a):
    """Guards the guard: 'zero rows' above must mean RLS, not an empty database."""
    _seed(client, user_a)
    assert len(client.get("/api/categories", headers=user_a["headers"]).json()["items"]) == 1
    assert len(client.get("/api/entries", headers=user_a["headers"]).json()["items"]) == 1
