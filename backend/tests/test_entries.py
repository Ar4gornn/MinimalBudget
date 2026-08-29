"""Story 2.2 and 2.3 — recording, filtering and amending entries."""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError


def _category(client, user, name, kind="expense"):
    return client.post(
        "/api/categories", json={"name": name, "kind": kind}, headers=user["headers"]
    ).json()


def _entry(client, user, **overrides):
    payload = {
        "kind": "expense",
        "amount": "42.50",
        "occurred_on": "2026-08-15",
    } | overrides
    return client.post("/api/entries", json=payload, headers=user["headers"])


def test_amounts_round_trip_as_two_place_strings(client, user_a):
    category = _category(client, user_a, "Food")
    created = _entry(client, user_a, amount="1234.5", category_id=category["id"])
    assert created.status_code == 201
    # AD-5: a string, so a JavaScript client cannot lose cents to a float.
    assert created.json()["amount"] == "1234.50"
    assert isinstance(created.json()["amount"], str)


def test_a_float_amount_is_refused(client, user_a):
    category = _category(client, user_a, "Food")
    response = client.post(
        "/api/entries",
        json={
            "kind": "expense",
            "amount": 0.1 + 0.2,
            "occurred_on": "2026-08-15",
            "category_id": category["id"],
        },
        headers=user_a["headers"],
    )
    assert response.status_code == 422


def test_more_than_two_decimal_places_is_refused(client, user_a):
    category = _category(client, user_a, "Food")
    assert _entry(client, user_a, amount="10.001", category_id=category["id"]).status_code == 422


def test_zero_and_negative_amounts_are_refused(client, user_a):
    category = _category(client, user_a, "Food")
    assert _entry(client, user_a, amount="0.00", category_id=category["id"]).status_code == 422
    assert _entry(client, user_a, amount="-5.00", category_id=category["id"]).status_code == 422


def test_the_database_refuses_a_non_positive_amount_too(client, user_a, runtime_connection):
    """AD-6: validation is not the only guard — the CHECK constraint is."""
    category = _category(client, user_a, "Food")
    conn = runtime_connection(user_a["id"])
    try:
        with pytest.raises(IntegrityError) as exc:
            conn.execute(
                text(
                    "INSERT INTO entries (user_id, kind, category_id, amount, occurred_on) "
                    "VALUES (:uid, CAST('expense' AS entry_kind), :cid, -1, DATE '2026-08-01')"
                ),
                {"uid": str(user_a["id"]), "cid": category["id"]},
            )
        assert "entries_amount_positive" in str(exc.value)
    finally:
        conn.close()


def test_an_entry_cannot_use_a_category_of_the_other_kind(client, user_a):
    income_category = _category(client, user_a, "Salary", kind="income")
    response = _entry(client, user_a, kind="expense", category_id=income_category["id"])
    # AD-7. Indistinguishable from "no such category", which is also true from the
    # caller's point of view: there is no expense category with that id.
    assert response.status_code == 404


def test_occurred_on_is_required(client, user_a):
    category = _category(client, user_a, "Food")
    response = client.post(
        "/api/entries",
        json={"kind": "expense", "amount": "5.00", "category_id": category["id"]},
        headers=user_a["headers"],
    )
    assert response.status_code == 422


def test_creating_by_name_creates_the_category(client, user_a):
    created = _entry(client, user_a, category_name="Transport")
    assert created.status_code == 201
    categories = client.get("/api/categories", headers=user_a["headers"]).json()["items"]
    assert [c["name"] for c in categories] == ["Transport"]
    assert categories[0]["kind"] == "expense"
    assert created.json()["category_id"] == categories[0]["id"]


def test_creating_by_name_reuses_an_existing_category_case_insensitively(client, user_a):
    first = _entry(client, user_a, category_name="Transport")
    second = _entry(client, user_a, category_name="transport")
    assert first.json()["category_id"] == second.json()["category_id"]
    assert len(client.get("/api/categories", headers=user_a["headers"]).json()["items"]) == 1


def test_both_or_neither_category_field_is_rejected(client, user_a):
    category = _category(client, user_a, "Food")
    both = _entry(client, user_a, category_id=category["id"], category_name="Food")
    neither = _entry(client, user_a)
    assert both.status_code == 422
    assert neither.status_code == 422


def test_filters_and_ordering(client, user_a):
    food = _category(client, user_a, "Food")
    rent = _category(client, user_a, "Rent")
    _entry(client, user_a, amount="10.00", occurred_on="2026-07-31", category_id=food["id"])
    _entry(client, user_a, amount="20.00", occurred_on="2026-08-01", category_id=food["id"])
    _entry(client, user_a, amount="30.00", occurred_on="2026-08-31", category_id=rent["id"])
    _entry(client, user_a, amount="40.00", occurred_on="2026-09-01", category_id=rent["id"])
    _entry(
        client,
        user_a,
        kind="income",
        amount="99.00",
        occurred_on="2026-08-10",
        category_name="Salary",
    )

    everything = client.get("/api/entries", headers=user_a["headers"]).json()["items"]
    assert [e["amount"] for e in everything] == [
        "40.00",
        "30.00",
        "99.00",
        "20.00",
        "10.00",
    ], "newest first (AD-20)"

    # AD-10: half-open. 2026-07-31 is out, 2026-08-31 is in, 2026-09-01 is out.
    august = client.get("/api/entries?month=2026-08", headers=user_a["headers"]).json()["items"]
    assert sorted(e["amount"] for e in august) == ["20.00", "30.00", "99.00"]

    expenses = client.get(
        "/api/entries?month=2026-08&kind=expense", headers=user_a["headers"]
    ).json()["items"]
    assert sorted(e["amount"] for e in expenses) == ["20.00", "30.00"]

    by_category = client.get(
        f"/api/entries?category_id={food['id']}", headers=user_a["headers"]
    ).json()["items"]
    assert sorted(e["amount"] for e in by_category) == ["10.00", "20.00"]


def test_a_malformed_month_is_rejected(client, user_a):
    assert client.get("/api/entries?month=2026-13", headers=user_a["headers"]).status_code == 422
    assert client.get("/api/entries?month=august", headers=user_a["headers"]).status_code == 422


def test_amend_an_entry(client, user_a):
    food = _category(client, user_a, "Food")
    rent = _category(client, user_a, "Rent")
    entry = _entry(client, user_a, category_id=food["id"], note="lunch").json()

    updated = client.patch(
        f"/api/entries/{entry['id']}",
        json={"amount": "60.00", "category_id": rent["id"], "note": None},
        headers=user_a["headers"],
    )
    assert updated.status_code == 200
    assert updated.json()["amount"] == "60.00"
    assert updated.json()["category_id"] == rent["id"]
    assert updated.json()["note"] is None, "a note can be cleared, not only replaced"


def test_amending_to_a_category_of_the_wrong_kind_is_refused(client, user_a):
    salary = _category(client, user_a, "Salary", kind="income")
    entry = _entry(client, user_a, category_name="Food").json()
    response = client.patch(
        f"/api/entries/{entry['id']}",
        json={"category_id": salary["id"]},
        headers=user_a["headers"],
    )
    assert response.status_code == 404


def test_delete_an_entry(client, user_a):
    entry = _entry(client, user_a, category_name="Food").json()
    deleted = client.delete(f"/api/entries/{entry['id']}", headers=user_a["headers"])
    assert deleted.status_code == 204
    assert client.get("/api/entries", headers=user_a["headers"]).json()["items"] == []


def test_another_users_entry_is_404(client, user_a, user_b):
    entry = _entry(client, user_a, category_name="Food").json()
    assert (
        client.patch(
            f"/api/entries/{entry['id']}", json={"amount": "1.00"}, headers=user_b["headers"]
        ).status_code
        == 404
    )
    assert (
        client.delete(f"/api/entries/{entry['id']}", headers=user_b["headers"]).status_code == 404
    )


def test_unknown_ids_are_404(client, user_a):
    missing = uuid.uuid4()
    assert client.delete(f"/api/entries/{missing}", headers=user_a["headers"]).status_code == 404
    assert _entry(client, user_a, category_id=str(missing)).status_code == 404
