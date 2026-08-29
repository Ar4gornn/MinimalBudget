"""Story 3.3 — the second-user proof for savings, budgets and targets."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError


def _first_type(client, user):
    return client.get("/api/savings/types", headers=user["headers"]).json()["items"][0]


def _seed(client, user):
    savings_type = _first_type(client, user)
    contribution = client.post(
        "/api/savings/contributions",
        json={
            "savings_type_id": savings_type["id"],
            "amount": "100.00",
            "occurred_on": "2026-08-01",
        },
        headers=user["headers"],
    ).json()
    client.put(
        f"/api/savings/targets/{savings_type['id']}",
        json={"monthly_amount": "500.00"},
        headers=user["headers"],
    )
    return savings_type, contribution


def test_b_sees_none_of_a_rows(client, user_a, user_b, runtime_connection):
    savings_type, contribution = _seed(client, user_a)

    conn = runtime_connection(user_b["id"])
    try:
        assert conn.execute(
            text("SELECT count(*) FROM savings_contributions WHERE id = :id"),
            {"id": contribution["id"]},
        ).scalar_one() == 0
        assert conn.execute(
            text("SELECT count(*) FROM savings_targets WHERE savings_type_id = :id"),
            {"id": savings_type["id"]},
        ).scalar_one() == 0
    finally:
        conn.close()

    assert client.get("/api/savings/contributions", headers=user_b["headers"]).json()["items"] == []
    assert client.get("/api/savings/targets", headers=user_b["headers"]).json()["items"] == []


def test_b_cannot_contribute_to_or_target_a_savings_type_of_a(client, user_a, user_b):
    savings_type, _ = _seed(client, user_a)

    contribution = client.post(
        "/api/savings/contributions",
        json={
            "savings_type_id": savings_type["id"],
            "amount": "1.00",
            "occurred_on": "2026-08-02",
        },
        headers=user_b["headers"],
    )
    target = client.put(
        f"/api/savings/targets/{savings_type['id']}",
        json={"monthly_amount": "1.00"},
        headers=user_b["headers"],
    )
    # AD-8: 404, never 403 — a 403 would confirm the id exists.
    assert contribution.status_code == 404
    assert target.status_code == 404


def test_b_cannot_budget_a_category_of_a(client, user_a, user_b):
    category = client.post(
        "/api/categories", json={"name": "Rent", "kind": "expense"}, headers=user_a["headers"]
    ).json()
    response = client.put(
        f"/api/budgets/{category['id']}",
        json={"monthly_amount": "1200.00"},
        headers=user_b["headers"],
    )
    assert response.status_code == 404
    assert client.get("/api/budgets", headers=user_b["headers"]).json()["items"] == []


def test_the_foreign_keys_refuse_a_cross_user_reference(
    client, user_a, user_b, runtime_connection
):
    """AD-18, below the service layer.

    Raw SQL as the runtime role, with B's own user_id on the row so row-level security is
    satisfied — the composite foreign keys still refuse, because A's savings type is not a
    (user_id, id) that exists for B.
    """
    savings_type, _ = _seed(client, user_a)

    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises(IntegrityError) as contribution_error:
            conn.execute(
                text(
                    "INSERT INTO savings_contributions "
                    "(user_id, savings_type_id, amount, occurred_on) "
                    "VALUES (:uid, :sid, 1, DATE '2026-08-02')"
                ),
                {"uid": str(user_b["id"]), "sid": savings_type["id"]},
            )
        assert "savings_contributions_type_fkey" in str(contribution_error.value)
    finally:
        conn.close()

    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises(IntegrityError) as target_error:
            conn.execute(
                text(
                    "INSERT INTO savings_targets (user_id, savings_type_id, monthly_amount) "
                    "VALUES (:uid, :sid, 1)"
                ),
                {"uid": str(user_b["id"]), "sid": savings_type["id"]},
            )
        assert "savings_targets_type_fkey" in str(target_error.value)
    finally:
        conn.close()


def test_the_database_refuses_a_negative_budget(client, user_a, runtime_connection):
    category = client.post(
        "/api/categories", json={"name": "Rent", "kind": "expense"}, headers=user_a["headers"]
    ).json()
    conn = runtime_connection(user_a["id"])
    try:
        with pytest.raises(IntegrityError) as exc:
            conn.execute(
                text(
                    "INSERT INTO budgets (user_id, category_id, kind, monthly_amount) "
                    "VALUES (:uid, :cid, CAST('expense' AS entry_kind), -1)"
                ),
                {"uid": str(user_a["id"]), "cid": category["id"]},
            )
        assert "budgets_amount_non_negative" in str(exc.value)
    finally:
        conn.close()


def test_the_database_refuses_a_budget_on_an_income_category(client, user_a, runtime_connection):
    """The CHECK plus the composite key, not the service layer, is what forbids this."""
    salary = client.post(
        "/api/categories", json={"name": "Salary", "kind": "income"}, headers=user_a["headers"]
    ).json()
    conn = runtime_connection(user_a["id"])
    try:
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO budgets (user_id, category_id, kind, monthly_amount) "
                    "VALUES (:uid, :cid, CAST('income' AS entry_kind), 100)"
                ),
                {"uid": str(user_a["id"]), "cid": salary["id"]},
            )
    finally:
        conn.close()


def test_the_positive_case_still_holds(client, user_a):
    _seed(client, user_a)
    contributions = client.get("/api/savings/contributions", headers=user_a["headers"])
    targets = client.get("/api/savings/targets", headers=user_a["headers"])
    assert len(contributions.json()["items"]) == 1
    assert len(targets.json()["items"]) == 1
