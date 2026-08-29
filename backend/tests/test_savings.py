"""Stories 3.1 and 3.2 — savings types, contributions, budgets and targets."""

import uuid


def _types(client, user):
    return client.get("/api/savings/types", headers=user["headers"]).json()["items"]


def _contribute(client, user, type_id, **overrides):
    payload = {
        "savings_type_id": type_id,
        "amount": "250.00",
        "occurred_on": "2026-08-10",
    } | overrides
    return client.post("/api/savings/contributions", json=payload, headers=user["headers"])


def test_the_seeded_types_are_listed_in_order(client, user_a):
    assert [t["name"] for t in _types(client, user_a)] == [
        "investment",
        "startup",
        "vacation",
    ]


def test_creating_a_type_is_idempotent_by_name(client, user_a):
    first = client.post(
        "/api/savings/types", json={"name": "House"}, headers=user_a["headers"]
    )
    second = client.post(
        "/api/savings/types", json={"name": "house"}, headers=user_a["headers"]
    )
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert len(_types(client, user_a)) == 4


def test_record_and_list_contributions(client, user_a):
    startup = next(t for t in _types(client, user_a) if t["name"] == "startup")
    created = _contribute(client, user_a, startup["id"], amount="1000.5")
    assert created.status_code == 201
    assert created.json()["amount"] == "1000.50"

    listed = client.get("/api/savings/contributions", headers=user_a["headers"]).json()
    assert set(listed) == {"items"}
    assert len(listed["items"]) == 1


def test_a_contribution_never_creates_a_savings_type(client, user_a):
    """AD-12: unlike categories, a savings goal is deliberate — a typo must not become one."""
    response = _contribute(client, user_a, str(uuid.uuid4()))
    assert response.status_code == 404
    assert len(_types(client, user_a)) == 3


def test_contribution_amounts_must_be_positive(client, user_a):
    startup = _types(client, user_a)[1]
    assert _contribute(client, user_a, startup["id"], amount="0.00").status_code == 422
    assert _contribute(client, user_a, startup["id"], amount="-1.00").status_code == 422


def test_contributions_filter_by_month_and_type(client, user_a):
    types = _types(client, user_a)
    first, second = types[0], types[1]
    _contribute(client, user_a, first["id"], amount="10.00", occurred_on="2026-07-31")
    _contribute(client, user_a, first["id"], amount="20.00", occurred_on="2026-08-01")
    _contribute(client, user_a, second["id"], amount="30.00", occurred_on="2026-08-31")
    _contribute(client, user_a, second["id"], amount="40.00", occurred_on="2026-09-01")

    august = client.get(
        "/api/savings/contributions?month=2026-08", headers=user_a["headers"]
    ).json()["items"]
    assert sorted(c["amount"] for c in august) == ["20.00", "30.00"]

    by_type = client.get(
        f"/api/savings/contributions?savings_type_id={first['id']}", headers=user_a["headers"]
    ).json()["items"]
    assert sorted(c["amount"] for c in by_type) == ["10.00", "20.00"]


def test_amend_and_delete_a_contribution(client, user_a):
    startup = _types(client, user_a)[1]
    contribution = _contribute(client, user_a, startup["id"], note="bonus").json()

    updated = client.patch(
        f"/api/savings/contributions/{contribution['id']}",
        json={"amount": "500.00", "note": None},
        headers=user_a["headers"],
    )
    assert updated.status_code == 200
    assert updated.json()["amount"] == "500.00"
    assert updated.json()["note"] is None

    deleted = client.delete(
        f"/api/savings/contributions/{contribution['id']}", headers=user_a["headers"]
    )
    assert deleted.status_code == 204


def test_deleting_a_type_with_contributions_is_refused(client, user_a):
    startup = _types(client, user_a)[1]
    _contribute(client, user_a, startup["id"])
    response = client.delete(f"/api/savings/types/{startup['id']}", headers=user_a["headers"])
    # AD-21: RESTRICT — the record of what was saved outlives a tidy-up.
    assert response.status_code == 409
    assert len(_types(client, user_a)) == 3


def test_deleting_an_unused_type_succeeds(client, user_a):
    startup = _types(client, user_a)[1]
    assert (
        client.delete(f"/api/savings/types/{startup['id']}", headers=user_a["headers"]).status_code
        == 204
    )
    assert len(_types(client, user_a)) == 2


def test_setting_a_target_twice_updates_rather_than_duplicates(client, user_a):
    startup = _types(client, user_a)[1]
    first = client.put(
        f"/api/savings/targets/{startup['id']}",
        json={"monthly_amount": "500.00"},
        headers=user_a["headers"],
    )
    second = client.put(
        f"/api/savings/targets/{startup['id']}",
        json={"monthly_amount": "750.00"},
        headers=user_a["headers"],
    )
    assert first.status_code == second.status_code == 200
    listed = client.get("/api/savings/targets", headers=user_a["headers"]).json()["items"]
    # AD-11: one standing amount per type, so the second PUT replaced the first.
    assert len(listed) == 1
    assert listed[0]["monthly_amount"] == "750.00"


def test_a_target_of_zero_is_allowed_but_negative_is_not(client, user_a):
    startup = _types(client, user_a)[1]
    zero = client.put(
        f"/api/savings/targets/{startup['id']}",
        json={"monthly_amount": "0.00"},
        headers=user_a["headers"],
    )
    negative = client.put(
        f"/api/savings/targets/{startup['id']}",
        json={"monthly_amount": "-1.00"},
        headers=user_a["headers"],
    )
    assert zero.status_code == 200
    assert negative.status_code == 422


def test_setting_a_budget_twice_updates_rather_than_duplicates(client, user_a):
    category = client.post(
        "/api/categories", json={"name": "Food", "kind": "expense"}, headers=user_a["headers"]
    ).json()
    client.put(
        f"/api/budgets/{category['id']}",
        json={"monthly_amount": "400.00"},
        headers=user_a["headers"],
    )
    client.put(
        f"/api/budgets/{category['id']}",
        json={"monthly_amount": "450.00"},
        headers=user_a["headers"],
    )
    listed = client.get("/api/budgets", headers=user_a["headers"]).json()["items"]
    assert len(listed) == 1
    assert listed[0]["monthly_amount"] == "450.00"


def test_a_budget_cannot_be_attached_to_an_income_category(client, user_a):
    salary = client.post(
        "/api/categories", json={"name": "Salary", "kind": "income"}, headers=user_a["headers"]
    ).json()
    response = client.put(
        f"/api/budgets/{salary['id']}",
        json={"monthly_amount": "100.00"},
        headers=user_a["headers"],
    )
    assert response.status_code == 404
    assert client.get("/api/budgets", headers=user_a["headers"]).json()["items"] == []


def test_deleting_a_category_removes_its_budget(client, user_a):
    category = client.post(
        "/api/categories", json={"name": "Gym", "kind": "expense"}, headers=user_a["headers"]
    ).json()
    client.put(
        f"/api/budgets/{category['id']}",
        json={"monthly_amount": "40.00"},
        headers=user_a["headers"],
    )
    # AD-21: the budget cascades with its category...
    assert (
        client.delete(f"/api/categories/{category['id']}", headers=user_a["headers"]).status_code
        == 204
    )
    assert client.get("/api/budgets", headers=user_a["headers"]).json()["items"] == []


def test_deleting_a_savings_type_removes_its_target(client, user_a):
    startup = _types(client, user_a)[1]
    client.put(
        f"/api/savings/targets/{startup['id']}",
        json={"monthly_amount": "100.00"},
        headers=user_a["headers"],
    )
    client.delete(f"/api/savings/types/{startup['id']}", headers=user_a["headers"])
    assert client.get("/api/savings/targets", headers=user_a["headers"]).json()["items"] == []
