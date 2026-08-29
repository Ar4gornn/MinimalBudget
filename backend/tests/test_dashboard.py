"""Epic 4 — the dashboard, checked against independently computed expected values.

Story 4.3 in particular: the fixture below was worked out on paper first. If a join
direction is reversed or a boundary slips by a day, a number here changes.
"""

from decimal import Decimal

import pytest


@pytest.fixture
def ledger(client, user_a):
    """A deliberately awkward month.

    July has data (so trends have a previous month to show), August is the month under
    test, September has one entry the boundary must exclude. `Gym` is budgeted but unspent;
    `Taxi` is spent but unbudgeted; `investment` is targeted but has nothing put into it.

    Expected for 2026-08, computed by hand:
        income  = 3000.00
        expense = 800.00 + 45.50 = 845.50
        net     = 2154.50
        saved   = 400.00
    """
    headers = user_a["headers"]

    def category(name, kind="expense"):
        return client.post(
            "/api/categories", json={"name": name, "kind": kind}, headers=headers
        ).json()

    def entry(category_id, kind, amount, occurred_on):
        return client.post(
            "/api/entries",
            json={
                "kind": kind,
                "amount": amount,
                "occurred_on": occurred_on,
                "category_id": category_id,
            },
            headers=headers,
        )

    rent = category("Rent")
    taxi = category("Taxi")
    gym = category("Gym")
    salary = category("Salary", kind="income")

    # July — the previous month in the trend window.
    entry(rent["id"], "expense", "790.00", "2026-07-31")
    entry(salary["id"], "income", "2900.00", "2026-07-01")

    # August — the month under test. 2026-08-31 must be included.
    entry(rent["id"], "expense", "800.00", "2026-08-01")
    entry(taxi["id"], "expense", "45.50", "2026-08-31")
    entry(salary["id"], "income", "3000.00", "2026-08-15")

    # September — must be excluded by the half-open range.
    entry(rent["id"], "expense", "999.00", "2026-09-01")

    client.put(
        f"/api/budgets/{rent['id']}", json={"monthly_amount": "900.00"}, headers=headers
    )
    client.put(f"/api/budgets/{gym['id']}", json={"monthly_amount": "40.00"}, headers=headers)

    types = client.get("/api/savings/types", headers=headers).json()["items"]
    startup = next(t for t in types if t["name"] == "startup")
    investment = next(t for t in types if t["name"] == "investment")

    client.post(
        "/api/savings/contributions",
        json={"savings_type_id": startup["id"], "amount": "400.00", "occurred_on": "2026-08-05"},
        headers=headers,
    )
    client.post(
        "/api/savings/contributions",
        json={"savings_type_id": startup["id"], "amount": "150.00", "occurred_on": "2026-07-05"},
        headers=headers,
    )
    client.put(
        f"/api/savings/targets/{startup['id']}",
        json={"monthly_amount": "1000.00"},
        headers=headers,
    )
    client.put(
        f"/api/savings/targets/{investment['id']}",
        json={"monthly_amount": "200.00"},
        headers=headers,
    )

    return {"rent": rent, "taxi": taxi, "gym": gym, "salary": salary, "headers": headers}


def _summary(client, headers, month="2026-08"):
    response = client.get(f"/api/dashboard/summary?month={month}", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_monthly_totals(client, ledger):
    body = _summary(client, ledger["headers"])
    assert body["month"] == "2026-08"
    assert body["income"] == "3000.00"
    assert body["expense"] == "845.50"
    assert body["net"] == "2154.50"
    assert body["saved"] == "400.00"


def test_the_month_boundary_is_half_open(client, ledger):
    """31 August is in; 1 September is out (AD-10)."""
    august = _summary(client, ledger["headers"], "2026-08")
    september = _summary(client, ledger["headers"], "2026-09")
    assert august["expense"] == "845.50", "45.50 on the 31st must be included"
    assert september["expense"] == "999.00", "the 1st belongs to September, not August"


def test_a_budgeted_category_with_no_spending_still_appears(client, ledger):
    """AD-22: joined from the budget side, so Gym is reported at zero, not dropped."""
    rows = {r["category_name"]: r for r in _summary(client, ledger["headers"])["budgets"]}
    assert rows["Gym"]["budget"] == "40.00"
    assert rows["Gym"]["actual"] == "0.00"


def test_a_spent_category_with_no_budget_still_appears(client, ledger):
    rows = {r["category_name"]: r for r in _summary(client, ledger["headers"])["budgets"]}
    assert rows["Taxi"]["budget"] is None
    assert rows["Taxi"]["actual"] == "45.50"


def test_budget_versus_actual_is_exact(client, ledger):
    rows = {r["category_name"]: r for r in _summary(client, ledger["headers"])["budgets"]}
    assert rows["Rent"] == {
        "category_id": ledger["rent"]["id"],
        "category_name": "Rent",
        "budget": "900.00",
        "actual": "800.00",
    }
    # An income category is never in this table.
    assert "Salary" not in rows
    assert sorted(rows) == ["Gym", "Rent", "Taxi"], "ordered by lower(name)"


def test_savings_progress_versus_target(client, ledger):
    rows = {r["savings_type_name"]: r for r in _summary(client, ledger["headers"])["savings"]}
    assert rows["startup"]["target"] == "1000.00"
    assert rows["startup"]["actual"] == "400.00"
    # Targeted, nothing put in this month — zero rather than absent.
    assert rows["investment"]["target"] == "200.00"
    assert rows["investment"]["actual"] == "0.00"
    # Untargeted and unused — not in the table at all.
    assert "vacation" not in rows


def test_a_month_with_no_data_is_all_zeroes_not_nulls(client, user_a):
    body = _summary(client, user_a["headers"], "2020-01")
    # AD-22: COALESCE, so an empty SUM is 0 and not null.
    assert (body["income"], body["expense"], body["net"], body["saved"]) == (
        "0.00",
        "0.00",
        "0.00",
        "0.00",
    )
    assert body["budgets"] == []
    assert body["savings"] == []


def test_a_malformed_month_is_rejected(client, user_a):
    assert (
        client.get("/api/dashboard/summary?month=2026-13", headers=user_a["headers"]).status_code
        == 422
    )
    assert client.get("/api/dashboard/summary", headers=user_a["headers"]).status_code == 422


def test_trends_return_exactly_n_months_with_no_gaps(client, ledger):
    response = client.get(
        "/api/dashboard/trends?months=4&ending=2026-09", headers=ledger["headers"]
    )
    assert response.status_code == 200
    body = response.json()
    assert body["months"] == ["2026-06", "2026-07", "2026-08", "2026-09"]
    # June has nothing at all — an explicit zero, produced by generate_series (AD-9).
    assert body["income"] == ["0.00", "2900.00", "3000.00", "0.00"]
    assert body["expense"] == ["0.00", "790.00", "845.50", "999.00"]
    assert body["saved"] == ["0.00", "150.00", "400.00", "0.00"]


def test_per_category_expense_series_covers_every_month(client, ledger):
    body = client.get(
        "/api/dashboard/trends?months=3&ending=2026-08", headers=ledger["headers"]
    ).json()
    series = {s["category_name"]: s["values"] for s in body["expense_by_category"]}
    assert series["Rent"] == ["0.00", "790.00", "800.00"]
    assert series["Taxi"] == ["0.00", "0.00", "45.50"]
    # Gym is budgeted but never spent on, so it has no expense series at all.
    assert "Gym" not in series
    for values in series.values():
        assert len(values) == len(body["months"]), "every series is as long as the month axis"


def test_trends_reject_an_absurd_window(client, user_a):
    assert (
        client.get("/api/dashboard/trends?months=0", headers=user_a["headers"]).status_code == 422
    )
    assert (
        client.get("/api/dashboard/trends?months=100", headers=user_a["headers"]).status_code == 422
    )


def test_the_dashboard_shows_a_user_only_their_own_numbers(client, ledger, user_b):
    """The aggregates run through the same row-level security as everything else."""
    theirs = _summary(client, user_b["headers"])
    assert theirs["income"] == "0.00"
    assert theirs["expense"] == "0.00"
    assert theirs["budgets"] == []

    mine = _summary(client, ledger["headers"])
    assert mine["income"] == "3000.00"


def test_totals_are_decimal_strings_not_numbers(client, ledger):
    body = _summary(client, ledger["headers"])
    for key in ("income", "expense", "net", "saved"):
        assert isinstance(body[key], str)
        assert Decimal(body[key]) == Decimal(body[key]).quantize(Decimal("0.01"))
