"""A malformed amount must be a 422, never a 500.

Found in the pre-publish review. `Decimal("abc")` raises `decimal.InvalidOperation`, which
is an `ArithmeticError` and not a `ValueError`, so pydantic did not convert it into a
validation error and FastAPI returned a server error instead. `"NaN"` and `"Infinity"` got
further and raised `TypeError` when their exponent — a string on a non-finite Decimal — was
compared to an int. And `"1_0"` was *accepted*, silently becoming 10.00, because Python's
Decimal honours PEP 515 underscores.

Every money-bearing endpoint is covered here rather than just one, because they all share
the same annotated type and the bug was in the type.
"""

import pytest

# Each of these reached the database layer as a 500, or in the last case as a wrong number.
MALFORMED = [
    "abc",
    "NaN",
    "Infinity",
    "-Infinity",
    "1E+30",
    "",
    "   ",
    "1_0",
    "1,0",
    "0x10",
    "1.2.3",
    "--5",
]


@pytest.fixture
def expense_category(client, user_a):
    return client.post(
        "/api/categories", json={"name": "Rent", "kind": "expense"}, headers=user_a["headers"]
    ).json()


@pytest.fixture
def savings_type(client, user_a):
    return client.get("/api/savings/types", headers=user_a["headers"]).json()["items"][0]


@pytest.mark.parametrize("amount", MALFORMED)
def test_a_malformed_entry_amount_is_422(client, user_a, expense_category, amount):
    response = client.post(
        "/api/entries",
        json={
            "kind": "expense",
            "amount": amount,
            "occurred_on": "2026-08-01",
            "category_id": expense_category["id"],
        },
        headers=user_a["headers"],
    )
    assert response.status_code == 422, f"{amount!r} produced {response.status_code}"


@pytest.mark.parametrize("amount", MALFORMED)
def test_a_malformed_contribution_amount_is_422(client, user_a, savings_type, amount):
    response = client.post(
        "/api/savings/contributions",
        json={
            "savings_type_id": savings_type["id"],
            "amount": amount,
            "occurred_on": "2026-08-01",
        },
        headers=user_a["headers"],
    )
    assert response.status_code == 422, f"{amount!r} produced {response.status_code}"


@pytest.mark.parametrize("amount", MALFORMED)
def test_a_malformed_budget_amount_is_422(client, user_a, expense_category, amount):
    response = client.put(
        f"/api/budgets/{expense_category['id']}",
        json={"monthly_amount": amount},
        headers=user_a["headers"],
    )
    assert response.status_code == 422, f"{amount!r} produced {response.status_code}"


@pytest.mark.parametrize("amount", MALFORMED)
def test_a_malformed_target_amount_is_422(client, user_a, savings_type, amount):
    response = client.put(
        f"/api/savings/targets/{savings_type['id']}",
        json={"monthly_amount": amount},
        headers=user_a["headers"],
    )
    assert response.status_code == 422, f"{amount!r} produced {response.status_code}"


def test_an_underscore_separated_amount_is_refused_rather_than_reinterpreted(
    client, user_a, expense_category
):
    """The dangerous one: this was accepted and stored as 10.00, not rejected."""
    response = client.post(
        "/api/entries",
        json={
            "kind": "expense",
            "amount": "1_0",
            "occurred_on": "2026-08-01",
            "category_id": expense_category["id"],
        },
        headers=user_a["headers"],
    )
    assert response.status_code == 422
    assert client.get("/api/entries", headers=user_a["headers"]).json()["items"] == []


def test_a_boolean_is_not_an_amount(client, user_a, expense_category):
    """`bool` is a subclass of `int`, so `True` would otherwise have become 1.00."""
    response = client.post(
        "/api/entries",
        json={
            "kind": "expense",
            "amount": True,
            "occurred_on": "2026-08-01",
            "category_id": expense_category["id"],
        },
        headers=user_a["headers"],
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("sent", "stored"),
    [("1250.00", "1250.00"), ("0.01", "0.01"), (" 42 ", "42.00"), (7, "7.00")],
)
def test_well_formed_amounts_still_work(client, user_a, expense_category, sent, stored):
    """Guards the guard: the tightened pattern must not reject legitimate input."""
    response = client.post(
        "/api/entries",
        json={
            "kind": "expense",
            "amount": sent,
            "occurred_on": "2026-08-01",
            "category_id": expense_category["id"],
        },
        headers=user_a["headers"],
    )
    assert response.status_code == 201, response.text
    assert response.json()["amount"] == stored
