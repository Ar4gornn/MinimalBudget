"""Story 9.1 — currency belongs to the account.

The design decision under test is that one ledger holds one currency, which is what keeps
every existing total, budget comparison and trend correct without an exchange-rate source.
The tests that matter are the ones about *changing* it: relabelling a populated ledger would
turn dollars into euros silently, so it has to be refused.
"""

import pytest
from sqlalchemy import text

from tests.conftest import register_user


def register(client, email, currency=None):
    body = {"email": email, "password": "correct-horse-battery"}
    if currency is not None:
        body["currency"] = currency
    return client.post("/api/auth/register", json=body)


def test_the_default_is_dollars(client):
    response = register(client, "default@example.com")
    assert response.status_code == 201
    assert response.json()["currency"] == "USD"


@pytest.mark.parametrize("currency", ["USD", "EUR"])
def test_currency_can_be_chosen_at_sign_up(client, currency):
    response = register(client, f"{currency.lower()}@example.com", currency)
    assert response.status_code == 201
    assert response.json()["currency"] == currency


@pytest.mark.parametrize("bad", ["GBP", "usd", "", "DOLLARS", "US"])
def test_an_unsupported_currency_is_refused(client, bad):
    assert register(client, "nope@example.com", bad).status_code == 422


def test_the_database_refuses_an_unsupported_currency_too(user_a, runtime_connection):
    """Validation is not the only guard — the CHECK constraint is."""
    from sqlalchemy.exc import IntegrityError

    conn = runtime_connection(user_a["id"])
    try:
        with pytest.raises(IntegrityError) as exc:
            conn.execute(
                text("UPDATE users SET currency = 'GBP' WHERE id = :id"),
                {"id": str(user_a["id"])},
            )
        assert "users_currency_supported" in str(exc.value)
    finally:
        conn.close()


def test_me_reports_the_currency(client, user_a):
    assert client.get("/api/auth/me", headers=user_a["headers"]).json()["currency"] == "USD"


def test_currency_can_be_changed_while_the_ledger_is_empty(client, user_a):
    response = client.patch(
        "/api/auth/me/currency", json={"currency": "EUR"}, headers=user_a["headers"]
    )
    assert response.status_code == 200
    assert response.json()["currency"] == "EUR"
    assert client.get("/api/auth/me", headers=user_a["headers"]).json()["currency"] == "EUR"


def test_changing_it_is_locked_once_there_are_entries(client, user_a):
    """The important one.

    Changing the setting relabels rather than converts, because converting needs historical
    rates this deployment has no source for. Relabelling a year of entries would turn
    dollars into euros silently — so once the ledger has anything in it, the setting locks.
    """
    client.post(
        "/api/entries",
        json={
            "kind": "expense",
            "amount": "10.00",
            "occurred_on": "2026-08-01",
            "category_name": "Food",
        },
        headers=user_a["headers"],
    )

    response = client.patch(
        "/api/auth/me/currency", json={"currency": "EUR"}, headers=user_a["headers"]
    )
    assert response.status_code == 409
    assert "relabel" in response.json()["detail"].lower()
    assert client.get("/api/auth/me", headers=user_a["headers"]).json()["currency"] == "USD"


def test_a_savings_contribution_locks_it_too(client, user_a):
    """Entries are not the only thing carrying an amount."""
    savings_type = client.get("/api/savings/types", headers=user_a["headers"]).json()["items"][0]
    client.post(
        "/api/savings/contributions",
        json={
            "savings_type_id": savings_type["id"],
            "amount": "25.00",
            "occurred_on": "2026-08-01",
        },
        headers=user_a["headers"],
    )
    response = client.patch(
        "/api/auth/me/currency", json={"currency": "EUR"}, headers=user_a["headers"]
    )
    assert response.status_code == 409


def test_setting_it_to_the_same_value_is_not_blocked(client, user_a):
    """A no-op must not be refused just because the ledger has data."""
    client.post(
        "/api/entries",
        json={
            "kind": "expense",
            "amount": "10.00",
            "occurred_on": "2026-08-01",
            "category_name": "Food",
        },
        headers=user_a["headers"],
    )
    response = client.patch(
        "/api/auth/me/currency", json={"currency": "USD"}, headers=user_a["headers"]
    )
    assert response.status_code == 200


def test_changing_currency_requires_authentication(client):
    assert client.patch("/api/auth/me/currency", json={"currency": "EUR"}).status_code == 401


def test_one_account_cannot_change_another(client, user_a, user_b):
    """The lock is per account, and so is the setting."""
    client.patch("/api/auth/me/currency", json={"currency": "EUR"}, headers=user_b["headers"])

    assert client.get("/api/auth/me", headers=user_a["headers"]).json()["currency"] == "USD"
    assert client.get("/api/auth/me", headers=user_b["headers"]).json()["currency"] == "EUR"


def test_two_accounts_can_hold_different_currencies(client):
    """The point of the whole design: your euros, your sister's dollars, no conversion."""
    euro = register_user(client, "paris@example.com")
    client.patch(
        "/api/auth/me/currency", json={"currency": "EUR"}, headers=euro["headers"]
    )
    dollar = register_user(client, "beirut@example.com")

    assert client.get("/api/auth/me", headers=euro["headers"]).json()["currency"] == "EUR"
    assert client.get("/api/auth/me", headers=dollar["headers"]).json()["currency"] == "USD"
