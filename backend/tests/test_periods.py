"""Epic 21 — the headline figures over a month, a year, or everything.

The property that matters most is that the three agree: twelve monthly figures must add up
to the yearly one, and the yearly ones to the all-time one. A year that did not line up with
its own months would be worse than not offering a year at all.
"""

import pytest

from app.core.months import Period, period_window, year_range


def _set_day(client, user, day):
    response = client.patch(
        "/api/auth/me/budget-start-day",
        json={"budget_start_day": day},
        headers=user["headers"],
    )
    assert response.status_code == 200, response.text


def _category(client, user, name, kind="expense"):
    return client.post(
        "/api/categories", json={"name": name, "kind": kind}, headers=user["headers"]
    ).json()


def _entry(client, user, category_id, amount, occurred_on, kind="expense"):
    return client.post(
        "/api/entries",
        json={
            "kind": kind,
            "amount": amount,
            "occurred_on": occurred_on,
            "category_id": category_id,
        },
        headers=user["headers"],
    ).json()


def _summary(client, user, month, period=None):
    query = f"month={month}" + (f"&period={period}" if period else "")
    response = client.get(f"/api/dashboard/summary?{query}", headers=user["headers"])
    assert response.status_code == 200, response.text
    return response.json()


# ------------------------------------------------------------ the windows


def test_a_year_is_exactly_its_twelve_budget_months():
    for start_day in (1, 15, 26, 28):
        year_start, year_end = year_range(2026, start_day)
        first_start, _, _ = period_window(Period.month, "2026-01", start_day)
        _, last_end, _ = period_window(Period.month, "2026-12", start_day)
        assert (year_start, year_end) == (first_start, last_end)


def test_all_time_has_no_bounds_at_all():
    """None, not a sentinel date. A guessed lower bound quietly drops a row."""
    start, end, label = period_window(Period.all, "2026-09", 26)
    assert start is None and end is None
    assert label == "All time"


# ------------------------------------------------------------- the figures


@pytest.fixture
def three_years(client, user_a):
    """Spending and income across three calendar years, worked out by hand.

    2025: income 1000, expense 100.
    2026: income 3000 (1000 in each of Jan, Jun, Dec), expense 350 (50 + 300).
    2027: income 500, expense 25.
    Savings: 200 in 2025, 400 in 2026.
    """
    salary = _category(client, user_a, "Salary", "income")
    food = _category(client, user_a, "Groceries")

    _entry(client, user_a, salary["id"], "1000.00", "2025-06-10", kind="income")
    _entry(client, user_a, food["id"], "100.00", "2025-06-11")

    for occurred_on in ("2026-01-10", "2026-06-10", "2026-12-10"):
        _entry(client, user_a, salary["id"], "1000.00", occurred_on, kind="income")
    _entry(client, user_a, food["id"], "50.00", "2026-01-11")
    _entry(client, user_a, food["id"], "300.00", "2026-06-11")

    _entry(client, user_a, salary["id"], "500.00", "2027-02-10", kind="income")
    _entry(client, user_a, food["id"], "25.00", "2027-02-11")

    types = client.get("/api/savings/types", headers=user_a["headers"]).json()["items"]
    for occurred_on in ("2025-06-12", "2026-03-12", "2026-09-12"):
        client.post(
            "/api/savings/contributions",
            json={
                "savings_type_id": types[0]["id"],
                "amount": "200.00",
                "occurred_on": occurred_on,
            },
            headers=user_a["headers"],
        )
    return {"salary": salary, "food": food}


def test_a_month_is_unchanged_and_is_still_the_default(client, user_a, three_years):
    default = _summary(client, user_a, "2026-06")
    explicit = _summary(client, user_a, "2026-06", "month")
    assert default["income"] == explicit["income"] == "1000.00"
    assert default["expense"] == explicit["expense"] == "300.00"
    assert default["period"] == "month"
    assert default["label"] == "2026-06"
    assert default["start"] == "2026-06-01" and default["end"] == "2026-06-30"


def test_a_year_sums_its_months(client, user_a, three_years):
    year = _summary(client, user_a, "2026-06", "year")
    assert year["period"] == "year"
    assert year["label"] == "2026"
    assert year["income"] == "3000.00"
    assert year["expense"] == "350.00"
    assert year["net"] == "2650.00"
    assert year["saved"] == "400.00"
    assert year["start"] == "2026-01-01" and year["end"] == "2026-12-31"

    # The twelve months must add up to it, to the penny.
    monthly = [_summary(client, user_a, f"2026-{month:02d}", "month") for month in range(1, 13)]
    for field in ("income", "expense", "saved"):
        assert sum(float(m[field]) for m in monthly) == float(year[field]), field


def test_all_time_sums_the_years(client, user_a, three_years):
    everything = _summary(client, user_a, "2026-06", "all")
    assert everything["period"] == "all"
    assert everything["label"] == "All time"
    assert everything["start"] is None and everything["end"] is None
    assert everything["income"] == "4500.00"
    assert everything["expense"] == "475.00"
    assert everything["net"] == "4025.00"
    assert everything["saved"] == "600.00"

    years = [_summary(client, user_a, f"{y}-06", "year") for y in (2025, 2026, 2027)]
    for field in ("income", "expense", "saved"):
        assert sum(float(y[field]) for y in years) == float(everything[field]), field


def test_the_anchor_month_does_not_change_a_year_or_all_time(client, user_a, three_years):
    for anchor in ("2026-01", "2026-06", "2026-12"):
        assert _summary(client, user_a, anchor, "year")["income"] == "3000.00"
        assert _summary(client, user_a, anchor, "all")["income"] == "4500.00"


def test_an_empty_account_reports_zeroes_rather_than_nothing(client, user_a):
    for period in ("month", "year", "all"):
        found = _summary(client, user_a, "2026-06", period)
        assert found["income"] == "0.00"
        assert found["expense"] == "0.00"
        assert found["net"] == "0.00"
        assert found["saved"] == "0.00"


def test_the_year_follows_the_account_month(client, user_a):
    """With a start day of 26, the year 2026 runs 26 Dec 2025 to 25 Dec 2026."""
    _set_day(client, user_a, 26)
    salary = _category(client, user_a, "Salary", "income")

    # Inside the 2026 budget year, though December 2025 by the calendar.
    _entry(client, user_a, salary["id"], "1000.00", "2025-12-26", kind="income")
    # Outside it, on each side.
    _entry(client, user_a, salary["id"], "700.00", "2025-12-25", kind="income")
    _entry(client, user_a, salary["id"], "900.00", "2026-12-26", kind="income")

    year = _summary(client, user_a, "2026-06", "year")
    assert year["income"] == "1000.00"
    assert year["start"] == "2025-12-26" and year["end"] == "2026-12-25"

    assert _summary(client, user_a, "2025-06", "year")["income"] == "700.00"
    assert _summary(client, user_a, "2027-06", "year")["income"] == "900.00"
    # All time still sees every one of them.
    assert _summary(client, user_a, "2026-06", "all")["income"] == "2600.00"


# ------------------------------------------------------- what stays monthly


def test_budget_vs_actual_is_reported_for_a_month_only(client, user_a, three_years):
    """AD-11: a budget is a standing *monthly* amount.

    Comparing a year of spending against it would mean inventing a multiplier — twelve, or
    fewer for a young account. Reporting nothing is honest; a number nobody chose is not.
    """
    client.put(
        f"/api/budgets/{three_years['food']['id']}",
        json={"monthly_amount": "400.00"},
        headers=user_a["headers"],
    )
    # A savings target too: it is a standing monthly amount for the same reason (AD-11), so
    # it has to disappear from the wider periods alongside the budget.
    types = client.get("/api/savings/types", headers=user_a["headers"]).json()["items"]
    client.put(
        f"/api/savings/targets/{types[0]['id']}",
        json={"monthly_amount": "200.00"},
        headers=user_a["headers"],
    )

    month = _summary(client, user_a, "2026-06", "month")
    assert [row["category_name"] for row in month["budgets"]] == ["Groceries"]
    assert month["budgets"][0]["budget"] == "400.00"
    assert [row["target"] for row in month["savings"]] == ["200.00"]

    for period in ("year", "all"):
        wider = _summary(client, user_a, "2026-06", period)
        assert wider["budgets"] == []
        assert wider["savings"] == []
        # The figures the person asked for are still there.
        assert wider["income"] != "0.00"


def test_an_unknown_period_is_refused(client, user_a):
    response = client.get(
        "/api/dashboard/summary?month=2026-06&period=decade", headers=user_a["headers"]
    )
    assert response.status_code == 422


def test_one_account_s_totals_never_include_another_s(client, user_a, user_b, three_years):
    for period in ("month", "year", "all"):
        found = _summary(client, user_b, "2026-06", period)
        assert found["income"] == "0.00" and found["expense"] == "0.00"
