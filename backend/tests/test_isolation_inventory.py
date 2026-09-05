"""Story 11.3 — the second-user proof extended to spaces, items and the quantity log.

Same shape as the ledger and savings proofs: run as the runtime role with B's tenancy,
assert zero rows of A's on read and refusal on write, then the same through the API where
another user's id is a 404 and never a 403 (AD-8). The composite foreign key case is the
one that matters: Postgres FK checks bypass RLS, so without user_id in the key B could put
an item in A's fridge (AD-18).
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, ProgrammingError


def _seed(client, user):
    space = client.post(
        "/api/inventory/spaces", json={"name": "Fridge"}, headers=user["headers"]
    ).json()
    item = client.post(
        "/api/inventory/items",
        json={"name": "Milk", "quantity": 0, "restock_below": 1, "space_id": space["id"]},
        headers=user["headers"],
    ).json()
    return space, item


def test_b_sees_none_of_a_rows(client, user_a, user_b, runtime_connection):
    space, item = _seed(client, user_a)

    conn = runtime_connection(user_b["id"])
    try:
        for table, row_id in (
            ("spaces", space["id"]),
            ("inventory_items", item["id"]),
        ):
            assert (
                conn.execute(
                    text(f"SELECT count(*) FROM {table} WHERE id = :id"),
                    {"id": row_id},  # noqa: S608
                ).scalar_one()
                == 0
            )
        assert (
            conn.execute(
                text("SELECT count(*) FROM inventory_item_changes WHERE item_id = :id"),
                {"id": item["id"]},
            ).scalar_one()
            == 0
        )
    finally:
        conn.close()

    headers = user_b["headers"]
    assert client.get("/api/inventory/spaces", headers=headers).json()["items"] == []
    assert client.get("/api/inventory/items", headers=headers).json()["items"] == []
    assert (
        client.get("/api/inventory/items?needs_restock=true", headers=headers).json()["items"] == []
    )
    assert client.get("/api/inventory/restocks", headers=headers).json()["series"] == []


def test_b_cannot_write_a_row_owned_by_a(client, user_a, user_b, runtime_connection):
    space, item = _seed(client, user_a)

    conn = runtime_connection(user_b["id"])
    try:
        assert (
            conn.execute(
                text("UPDATE inventory_items SET quantity = 99 WHERE id = :id"), {"id": item["id"]}
            ).rowcount
            == 0
        )
        assert (
            conn.execute(
                text("DELETE FROM inventory_items WHERE id = :id"), {"id": item["id"]}
            ).rowcount
            == 0
        )
        assert (
            conn.execute(text("DELETE FROM spaces WHERE id = :id"), {"id": space["id"]}).rowcount
            == 0
        )
        with pytest.raises(ProgrammingError):
            # A row carrying A's user_id fails the WITH CHECK.
            conn.execute(
                text("INSERT INTO spaces (user_id, name) VALUES (:uid, 'Intruder')"),
                {"uid": str(user_a["id"])},
            )
    finally:
        conn.close()


def test_b_cannot_put_an_item_in_a_space_of_a(client, user_a, user_b):
    space, _ = _seed(client, user_a)
    response = client.post(
        "/api/inventory/items",
        json={"name": "Cuckoo", "quantity": 1, "space_id": space["id"]},
        headers=user_b["headers"],
    )
    assert response.status_code == 404, response.text
    # And A can still delete the space afterwards — nothing of B's is hanging off it.
    client.delete(
        f"/api/inventory/items/{_seed_item_id(client, user_a)}", headers=user_a["headers"]
    )
    assert (
        client.delete(f"/api/inventory/spaces/{space['id']}", headers=user_a["headers"]).status_code
        == 204
    )


def _seed_item_id(client, user):
    return client.get("/api/inventory/items", headers=user["headers"]).json()["items"][0]["id"]


def test_the_foreign_key_itself_refuses_a_cross_user_reference(
    client, user_a, user_b, runtime_connection
):
    """Bypass the service and hit the constraint directly, as the runtime role."""
    space, _ = _seed(client, user_a)
    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO inventory_items (user_id, space_id, name, quantity) "
                    "VALUES (:uid, :sid, 'Cuckoo', 1)"
                ),
                {"uid": str(user_b["id"]), "sid": space["id"]},
            )
    finally:
        conn.close()


def test_the_api_answers_404_not_403_for_another_users_ids(client, user_a, user_b):
    space, item = _seed(client, user_a)
    headers = user_b["headers"]
    assert (
        client.patch(
            f"/api/inventory/spaces/{space['id']}", json={"name": "x"}, headers=headers
        ).status_code
        == 404
    )
    assert client.delete(f"/api/inventory/spaces/{space['id']}", headers=headers).status_code == 404
    assert (
        client.patch(
            f"/api/inventory/items/{item['id']}", json={"quantity": 9}, headers=headers
        ).status_code
        == 404
    )
    assert client.delete(f"/api/inventory/items/{item['id']}", headers=headers).status_code == 404
    assert (
        client.get(f"/api/inventory/items/{item['id']}/history", headers=headers).status_code == 404
    )
    # Moving B's own item into A's space is refused the same way.
    own = client.post(
        "/api/inventory/items",
        json={"name": "Own", "quantity": 1, "space_name": "Own space"},
        headers=headers,
    ).json()
    assert (
        client.patch(
            f"/api/inventory/items/{own['id']}", json={"space_id": space["id"]}, headers=headers
        ).status_code
        == 404
    )


def test_the_test_would_fail_if_the_tenant_were_unset(client, user_a, runtime_connection):
    _seed(client, user_a)
    conn = runtime_connection(None)
    try:
        assert conn.execute(text("SELECT count(*) FROM inventory_items")).scalar_one() == 0
    finally:
        conn.close()
    conn = runtime_connection(user_a["id"])
    try:
        assert conn.execute(text("SELECT count(*) FROM inventory_items")).scalar_one() == 1
    finally:
        conn.close()
