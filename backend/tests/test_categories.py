"""Story 2.1 and 2.3 — categories, and the create-by-name path."""

import uuid

from sqlalchemy import text


def _create(client, user, name, kind="expense"):
    return client.post(
        "/api/categories", json={"name": name, "kind": kind}, headers=user["headers"]
    )


def test_create_and_list(client, user_a):
    assert _create(client, user_a, "Rent").status_code == 201
    assert _create(client, user_a, "Food").status_code == 201

    listed = client.get("/api/categories", headers=user_a["headers"])
    assert listed.status_code == 200
    body = listed.json()
    # AD-20: enveloped, never a bare array.
    assert set(body) == {"items"}
    assert [c["name"] for c in body["items"]] == ["Food", "Rent"], "ordered by lower(name)"


def test_creating_the_same_name_twice_returns_the_same_category(client, user_a):
    first = _create(client, user_a, "Groceries")
    second = _create(client, user_a, "groceries")
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert first.json()["name"] == "Groceries", "the original casing is kept"

    listed = client.get("/api/categories", headers=user_a["headers"]).json()
    assert len(listed["items"]) == 1


def test_the_same_name_can_exist_for_both_kinds(client, user_a):
    expense = _create(client, user_a, "Freelance", kind="expense")
    income = _create(client, user_a, "Freelance", kind="income")
    assert expense.json()["id"] != income.json()["id"]


def test_kind_filter(client, user_a):
    _create(client, user_a, "Salary", kind="income")
    _create(client, user_a, "Rent", kind="expense")
    incomes = client.get("/api/categories?kind=income", headers=user_a["headers"]).json()
    assert [c["name"] for c in incomes["items"]] == ["Salary"]


def test_delete_an_unused_category(client, user_a):
    created = _create(client, user_a, "Temporary")
    response = client.delete(
        f"/api/categories/{created.json()['id']}", headers=user_a["headers"]
    )
    assert response.status_code == 204
    assert client.get("/api/categories", headers=user_a["headers"]).json()["items"] == []


def test_deleting_a_category_with_entries_is_refused(client, user_a):
    category = _create(client, user_a, "Rent").json()
    client.post(
        "/api/entries",
        json={
            "kind": "expense",
            "amount": "1200.00",
            "occurred_on": "2026-08-01",
            "category_id": category["id"],
        },
        headers=user_a["headers"],
    )
    response = client.delete(f"/api/categories/{category['id']}", headers=user_a["headers"])
    # AD-21: RESTRICT. Tidying a label must not destroy the records under it.
    assert response.status_code == 409
    assert len(client.get("/api/categories", headers=user_a["headers"]).json()["items"]) == 1


def test_another_users_category_is_404(client, user_a, user_b):
    theirs = _create(client, user_a, "Private").json()
    response = client.delete(f"/api/categories/{theirs['id']}", headers=user_b["headers"])
    # AD-8: a 403 here would confirm the id exists.
    assert response.status_code == 404


def test_unknown_category_id_is_404(client, user_a):
    response = client.delete(f"/api/categories/{uuid.uuid4()}", headers=user_a["headers"])
    assert response.status_code == 404


def test_blank_name_is_rejected(client, user_a):
    assert _create(client, user_a, "   ").status_code == 422


def test_concurrent_creates_of_the_same_name_produce_one_category(
    client, user_a, runtime_connection
):
    """AD-12: check-then-act would produce two rows here; ON CONFLICT produces one."""
    first = runtime_connection(user_a["id"])
    second = runtime_connection(user_a["id"])
    insert = text(
        """
        INSERT INTO categories (user_id, kind, name)
        VALUES (:uid, CAST('expense' AS entry_kind), :name)
        ON CONFLICT (user_id, kind, lower(name)) DO NOTHING
        RETURNING id
        """
    )
    try:
        a = first.execute(
            insert, {"uid": str(user_a["id"]), "name": "Utilities"}
        ).scalar_one_or_none()
        first.commit()
        b = second.execute(
            insert, {"uid": str(user_a["id"]), "name": "utilities"}
        ).scalar_one_or_none()
        second.commit()
    finally:
        first.close()
        second.close()

    assert a is not None
    assert b is None, "the second insert must be absorbed, not duplicated"
    assert len(client.get("/api/categories", headers=user_a["headers"]).json()["items"]) == 1
