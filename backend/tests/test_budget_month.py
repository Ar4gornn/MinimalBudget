"""Epic 20 — a budget month that need not start on the 1st.

The salary lands on the 26th, so the month that matters runs 26th to 25th. The label is the
month the period *ends* in: with a start day of 26, "2026-09" means 26 August to 25
September.

What is worth testing is the boundary, in both directions, and the fact that every view
agrees about it — a dashboard total and an entries list that disagree by one day would be
worse than not having the feature.
"""

import datetime as dt

import pytest

from app.core.months import MAX_START_DAY, InvalidMonth, month_of, month_range


def _set_day(client, user, day):
    response = client.patch(
        "/api/auth/me/budget-start-day",
        json={"budget_start_day": day},
        headers=user["headers"],
    )
    assert response.status_code == 200, response.text
    return response.json()


def _category(client, user, name="Salary", kind="income"):
    return client.post(
        "/api/categories", json={"name": name, "kind": kind}, headers=user["headers"]
    ).json()


def _entry(client, user, category_id, amount, occurred_on, kind="income"):
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


# --------------------------------------------------------- the arithmetic


@pytest.mark.parametrize(
    ("label", "day", "expected"),
    [
        # Day 1 is the calendar month, exactly as before.
        ("2026-09", 1, (dt.date(2026, 9, 1), dt.date(2026, 10, 1))),
        # The salary case: the period whose last day falls in September.
        ("2026-09", 26, (dt.date(2026, 8, 26), dt.date(2026, 9, 26))),
        ("2026-10", 26, (dt.date(2026, 9, 26), dt.date(2026, 10, 26))),
        # Across a year boundary.
        ("2026-01", 26, (dt.date(2025, 12, 26), dt.date(2026, 1, 26))),
        # February, the month that breaks naive arithmetic.
        ("2026-02", 28, (dt.date(2026, 1, 28), dt.date(2026, 2, 28))),
        ("2026-03", 28, (dt.date(2026, 2, 28), dt.date(2026, 3, 28))),
    ],
)
def test_the_window_is_the_period_ending_in_the_labelled_month(label, day, expected):
    assert month_range(label, day) == expected


def test_consecutive_periods_are_contiguous_and_never_overlap(subtests=None):
    """Every day of the year belongs to exactly one period, whatever the start day."""
    for day in (1, 15, 26, MAX_START_DAY):
        previous_end = None
        for month in range(1, 13):
            start, end = month_range(f"2026-{month:02d}", day)
            assert start < end
            if previous_end is not None:
                assert start == previous_end, f"gap or overlap at day {day}, month {month}"
            previous_end = end


@pytest.mark.parametrize(
    ("when", "day", "expected"),
    [
        (dt.date(2026, 8, 25), 26, "2026-08"),
        (dt.date(2026, 8, 26), 26, "2026-09"),
        (dt.date(2026, 9, 25), 26, "2026-09"),
        (dt.date(2026, 9, 26), 26, "2026-10"),
        (dt.date(2026, 9, 15), 1, "2026-09"),
    ],
)
def test_month_of_is_the_exact_inverse(when, day, expected):
    assert month_of(when, day) == expected
    start, end = month_range(expected, day)
    assert start <= when < end


@pytest.mark.parametrize("day", [0, -1, 29, 30, 31, 99])
def test_a_start_day_that_does_not_exist_in_every_month_is_refused(day):
    """29, 30 and 31 would need clamping, and a clamped boundary breaks the inverse."""
    with pytest.raises(InvalidMonth):
        month_range("2026-09", day)


# ------------------------------------------------------------- the setting


def test_the_default_is_the_first_and_it_can_be_changed_freely(client, user_a):
    me = client.get("/api/auth/me", headers=user_a["headers"]).json()
    assert me["budget_start_day"] == 1

    assert _set_day(client, user_a, 26)["budget_start_day"] == 26

    # Unlike the currency and the weight unit, this is NOT locked once data exists: it
    # re-groups rows, it never relabels a stored number.
    category = _category(client, user_a)
    _entry(client, user_a, category["id"], "3000.00", "2026-08-26")
    assert _set_day(client, user_a, 15)["budget_start_day"] == 15
    assert _set_day(client, user_a, 1)["budget_start_day"] == 1


@pytest.mark.parametrize("day", [0, 29, 31, 100])
def test_an_impossible_start_day_is_refused_by_the_api(client, user_a, day):
    response = client.patch(
        "/api/auth/me/budget-start-day",
        json={"budget_start_day": day},
        headers=user_a["headers"],
    )
    assert response.status_code == 422


def test_the_database_refuses_one_too(client, user_a, runtime_connection):
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    conn = runtime_connection(user_a["id"])
    try:
        with pytest.raises(IntegrityError):
            conn.execute(
                text("UPDATE users SET budget_start_day = 31 WHERE id = :id"),
                {"id": str(user_a["id"])},
            )
    finally:
        conn.close()


def test_one_account_cannot_change_anothers(client, user_a, user_b):
    _set_day(client, user_a, 26)
    assert client.get("/api/auth/me", headers=user_b["headers"]).json()["budget_start_day"] == 1


# ------------------------------------------------------- what it changes


@pytest.fixture
def paid_on_the_26th(client, user_a):
    """A salary on 26 August and spending either side of the boundary.

    Worked out by hand for a start day of 26. The period labelled 2026-09 is
    26 Aug - 25 Sep, and holds: the 3000.00 salary, 40.00 on 27 Aug, 60.00 on 25 Sep.
    The 99.00 on 25 August belongs to 2026-08; the 77.00 on 26 September to 2026-10.
    """
    _set_day(client, user_a, 26)
    salary = _category(client, user_a, "Salary", "income")
    food = _category(client, user_a, "Groceries", "expense")

    _entry(client, user_a, salary["id"], "3000.00", "2026-08-26")
    _entry(client, user_a, food["id"], "40.00", "2026-08-27", kind="expense")
    _entry(client, user_a, food["id"], "60.00", "2026-09-25", kind="expense")
    # Outside, on each side.
    _entry(client, user_a, food["id"], "99.00", "2026-08-25", kind="expense")
    _entry(client, user_a, food["id"], "77.00", "2026-09-26", kind="expense")
    return {"salary": salary, "food": food}


def test_the_entries_list_follows_the_account_month(client, user_a, paid_on_the_26th):
    rows = client.get("/api/entries?month=2026-09", headers=user_a["headers"]).json()["items"]
    assert sorted(r["occurred_on"] for r in rows) == ["2026-08-26", "2026-08-27", "2026-09-25"]


def test_the_dashboard_totals_agree_with_the_entries_list(client, user_a, paid_on_the_26th):
    summary = client.get("/api/dashboard/summary?month=2026-09", headers=user_a["headers"]).json()
    assert summary["income"] == "3000.00"
    assert summary["expense"] == "100.00", "40.00 on 27 Aug plus 60.00 on 25 Sep"
    assert summary["net"] == "2900.00"

    # The two views must not disagree by a single day.
    rows = client.get("/api/entries?month=2026-09", headers=user_a["headers"]).json()["items"]
    expense = sum(float(r["amount"]) for r in rows if r["kind"] == "expense")
    assert f"{expense:.2f}" == summary["expense"]


def test_the_neighbouring_periods_hold_the_rest(client, user_a, paid_on_the_26th):
    august = client.get("/api/dashboard/summary?month=2026-08", headers=user_a["headers"]).json()
    october = client.get("/api/dashboard/summary?month=2026-10", headers=user_a["headers"]).json()
    assert august["expense"] == "99.00"
    assert october["expense"] == "77.00"


def test_the_trend_buckets_use_the_same_boundary(client, user_a, paid_on_the_26th):
    trends = client.get(
        "/api/dashboard/trends?months=3&ending=2026-10", headers=user_a["headers"]
    ).json()
    assert trends["months"] == ["2026-08", "2026-09", "2026-10"]
    # Same figures as the summaries above: one boundary, used everywhere.
    assert trends["expense"] == ["99.00", "100.00", "77.00"]
    assert trends["income"] == ["0.00", "3000.00", "0.00"]


def test_changing_the_day_re_groups_without_moving_anything(client, user_a, paid_on_the_26th):
    """The point of not locking it: the numbers move between buckets, the rows do not."""
    before = client.get("/api/entries", headers=user_a["headers"]).json()["items"]

    _set_day(client, user_a, 1)
    september = client.get("/api/dashboard/summary?month=2026-09", headers=user_a["headers"]).json()
    # Back to calendar months: September now holds only the 25 Sep and 26 Sep expenses.
    assert september["income"] == "0.00"
    assert september["expense"] == "137.00"

    after = client.get("/api/entries", headers=user_a["headers"]).json()["items"]
    assert [(r["id"], r["occurred_on"], r["amount"]) for r in before] == [
        (r["id"], r["occurred_on"], r["amount"]) for r in after
    ], "no row moved; only the grouping did"


def test_savings_contributions_follow_it_too(client, user_a):
    _set_day(client, user_a, 26)
    types = client.get("/api/savings/types", headers=user_a["headers"]).json()["items"]
    for occurred_on in ("2026-08-26", "2026-09-25", "2026-09-26"):
        client.post(
            "/api/savings/contributions",
            json={
                "savings_type_id": types[0]["id"],
                "amount": "100.00",
                "occurred_on": occurred_on,
            },
            headers=user_a["headers"],
        )

    rows = client.get("/api/savings/contributions?month=2026-09", headers=user_a["headers"]).json()[
        "items"
    ]
    assert sorted(r["occurred_on"] for r in rows) == ["2026-08-26", "2026-09-25"]

    summary = client.get("/api/dashboard/summary?month=2026-09", headers=user_a["headers"]).json()
    assert summary["saved"] == "200.00"


def test_the_gym_month_filter_follows_it_as_well(client, user_a):
    """Alex chose one rule across the app rather than money-only."""
    _set_day(client, user_a, 26)
    for performed_on in ("2026-08-26", "2026-09-25", "2026-09-26"):
        client.post(
            "/api/gym/workouts", json={"performed_on": performed_on}, headers=user_a["headers"]
        )

    rows = client.get("/api/gym/workouts?month=2026-09", headers=user_a["headers"]).json()["items"]
    assert sorted(w["performed_on"] for w in rows) == ["2026-08-26", "2026-09-25"]


def test_one_account_s_boundary_does_not_move_another_s_figures(client, user_a, user_b):
    _set_day(client, user_a, 26)
    salary_b = _category(client, user_b)
    _entry(client, user_b, salary_b["id"], "1000.00", "2026-08-26")

    # B is still on the calendar month, so August's salary is in August.
    assert (
        client.get("/api/dashboard/summary?month=2026-08", headers=user_b["headers"]).json()[
            "income"
        ]
        == "1000.00"
    )
    assert (
        client.get("/api/dashboard/summary?month=2026-09", headers=user_b["headers"]).json()[
            "income"
        ]
        == "0.00"
    )
