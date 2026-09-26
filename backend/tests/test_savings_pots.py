"""Epic 34 (AD-50) — savings pots: withdrawals, balances, goals, month progress, skips."""

import datetime as dt
from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.services.savings import due_amount, needed_per_month


def _type(client, user, name="vacation"):
    items = client.get("/api/savings/types", headers=user["headers"]).json()["items"]
    return next(t for t in items if t["name"] == name)


def _move(client, user, type_id, amount, kind="deposit", on="2026-09-10"):
    return client.post(
        "/api/savings/contributions",
        json={"savings_type_id": type_id, "kind": kind, "amount": amount, "occurred_on": on},
        headers=user["headers"],
    )


def _overview(client, user, month="2026-09"):
    response = client.get(
        "/api/savings/overview", params={"month": month}, headers=user["headers"]
    )
    assert response.status_code == 200, response.text
    return response.json()


def _pot(overview, type_id):
    return next(p for p in overview["pots"] if p["savings_type_id"] == type_id)


# ------------------------------------------------------------------ withdrawals


def test_a_contribution_is_a_deposit_unless_it_says_otherwise(client, user_a):
    pot = _type(client, user_a)
    created = client.post(
        "/api/savings/contributions",
        json={"savings_type_id": pot["id"], "amount": "10.00", "occurred_on": "2026-09-01"},
        headers=user_a["headers"],
    )
    assert created.status_code == 201
    assert created.json()["kind"] == "deposit"


def test_a_withdrawal_lowers_the_balance(client, user_a):
    pot = _type(client, user_a)
    assert _move(client, user_a, pot["id"], "100.00").status_code == 201
    withdrawal = _move(client, user_a, pot["id"], "30.00", kind="withdrawal")
    assert withdrawal.status_code == 201
    assert withdrawal.json()["kind"] == "withdrawal"
    assert withdrawal.json()["amount"] == "30.00"  # the amount stays positive
    assert _pot(_overview(client, user_a), pot["id"])["balance"] == "70.00"


def test_a_withdrawal_larger_than_the_balance_is_refused_and_not_written(client, user_a):
    pot = _type(client, user_a)
    _move(client, user_a, pot["id"], "50.00")
    refused = _move(client, user_a, pot["id"], "50.01", kind="withdrawal")
    assert refused.status_code == 409
    assert refused.json()["code"] == "savings_balance_negative"
    assert _pot(_overview(client, user_a), pot["id"])["balance"] == "50.00"
    listed = client.get("/api/savings/contributions", headers=user_a["headers"]).json()
    assert [c["kind"] for c in listed["items"]] == ["deposit"]


def test_the_whole_balance_can_be_withdrawn(client, user_a):
    pot = _type(client, user_a)
    _move(client, user_a, pot["id"], "50.00")
    assert _move(client, user_a, pot["id"], "50.00", kind="withdrawal").status_code == 201
    assert _pot(_overview(client, user_a), pot["id"])["balance"] == "0.00"


def test_deleting_a_deposit_that_a_withdrawal_relies_on_is_refused(client, user_a):
    pot = _type(client, user_a)
    deposit = _move(client, user_a, pot["id"], "100.00").json()
    _move(client, user_a, pot["id"], "80.00", kind="withdrawal")
    refused = client.delete(
        f"/api/savings/contributions/{deposit['id']}", headers=user_a["headers"]
    )
    assert refused.status_code == 409
    assert refused.json()["code"] == "savings_balance_negative"
    assert _pot(_overview(client, user_a), pot["id"])["balance"] == "20.00"


def test_turning_a_deposit_into_a_withdrawal_is_checked_too(client, user_a):
    pot = _type(client, user_a)
    deposit = _move(client, user_a, pot["id"], "100.00").json()
    refused = client.patch(
        f"/api/savings/contributions/{deposit['id']}",
        json={"kind": "withdrawal"},
        headers=user_a["headers"],
    )
    assert refused.status_code == 409


def test_moving_a_deposit_to_another_pot_is_checked_on_the_pot_it_leaves(client, user_a):
    vacation, startup = _type(client, user_a), _type(client, user_a, "startup")
    deposit = _move(client, user_a, vacation["id"], "100.00").json()
    _move(client, user_a, vacation["id"], "60.00", kind="withdrawal")
    refused = client.patch(
        f"/api/savings/contributions/{deposit['id']}",
        json={"savings_type_id": startup["id"]},
        headers=user_a["headers"],
    )
    assert refused.status_code == 409
    overview = _overview(client, user_a)
    assert _pot(overview, vacation["id"])["balance"] == "40.00"
    assert _pot(overview, startup["id"])["balance"] == "0.00"


def test_an_unknown_kind_is_a_422(client, user_a):
    pot = _type(client, user_a)
    assert _move(client, user_a, pot["id"], "1.00", kind="refund").status_code == 422


def test_the_database_refuses_an_unknown_kind(client, user_a, runtime_connection):
    pot = _type(client, user_a)
    conn = runtime_connection(user_a["id"])
    try:
        with pytest.raises(IntegrityError) as error:
            conn.execute(
                text(
                    "INSERT INTO savings_contributions "
                    "(user_id, savings_type_id, kind, amount, occurred_on) "
                    "VALUES (:uid, :sid, 'refund', 1, DATE '2026-09-01')"
                ),
                {"uid": str(user_a["id"]), "sid": pot["id"]},
            )
        assert "savings_contributions_kind_known" in str(error.value)
    finally:
        conn.close()


# --------------------------------------------------------------- month progress


def test_the_month_nets_withdrawals_and_ignores_other_months(client, user_a):
    pot = _type(client, user_a)
    _move(client, user_a, pot["id"], "200.00", on="2026-08-31")
    _move(client, user_a, pot["id"], "100.00", on="2026-09-01")
    _move(client, user_a, pot["id"], "30.00", kind="withdrawal", on="2026-09-30")
    _move(client, user_a, pot["id"], "5.00", on="2026-10-01")
    got = _pot(_overview(client, user_a), pot["id"])
    assert got["saved"] == "70.00"
    assert got["balance"] == "275.00"


def test_the_month_follows_the_budget_start_day(client, user_a):
    client.patch(
        "/api/auth/me/budget-start-day",
        json={"budget_start_day": 26},
        headers=user_a["headers"],
    )
    pot = _type(client, user_a)
    _move(client, user_a, pot["id"], "10.00", on="2026-08-25")  # "2026-08"
    _move(client, user_a, pot["id"], "20.00", on="2026-08-26")  # "2026-09" starts here
    _move(client, user_a, pot["id"], "40.00", on="2026-09-25")  # last day of "2026-09"
    _move(client, user_a, pot["id"], "80.00", on="2026-09-26")  # "2026-10"
    overview = _overview(client, user_a, "2026-09")
    assert overview["start"] == "2026-08-26"
    assert overview["end"] == "2026-09-26"
    assert _pot(overview, pot["id"])["saved"] == "60.00"


def test_a_pot_can_go_negative_within_a_month_but_not_overall(client, user_a):
    pot = _type(client, user_a)
    _move(client, user_a, pot["id"], "100.00", on="2026-08-10")
    _move(client, user_a, pot["id"], "40.00", kind="withdrawal", on="2026-09-10")
    got = _pot(_overview(client, user_a), pot["id"])
    assert got["saved"] == "-40.00"
    assert got["balance"] == "60.00"


def test_a_malformed_month_is_a_422(client, user_a):
    response = client.get(
        "/api/savings/overview", params={"month": "2026-13"}, headers=user_a["headers"]
    )
    assert response.status_code == 422


# ------------------------------------------------------------------ what is due


def test_the_rest_of_the_target_is_due(client, user_a):
    pot = _type(client, user_a)
    client.put(
        f"/api/savings/targets/{pot['id']}",
        json={"monthly_amount": "150.00"},
        headers=user_a["headers"],
    )
    assert _pot(_overview(client, user_a), pot["id"])["due"] == "150.00"
    _move(client, user_a, pot["id"], "100.00")
    assert _pot(_overview(client, user_a), pot["id"])["due"] == "50.00"
    _move(client, user_a, pot["id"], "50.00")
    assert _pot(_overview(client, user_a), pot["id"])["due"] is None


def test_a_skipped_month_proposes_nothing_and_can_be_unskipped(client, user_a):
    pot = _type(client, user_a)
    client.put(
        f"/api/savings/targets/{pot['id']}",
        json={"monthly_amount": "150.00"},
        headers=user_a["headers"],
    )
    url = f"/api/savings/skips/{pot['id']}/2026-09"
    assert client.put(url, headers=user_a["headers"]).status_code == 204
    assert client.put(url, headers=user_a["headers"]).status_code == 204  # idempotent
    got = _pot(_overview(client, user_a), pot["id"])
    assert got["skipped"] is True
    assert got["due"] is None
    # The skip is for that month only.
    assert _pot(_overview(client, user_a, "2026-10"), pot["id"])["due"] == "150.00"

    assert client.delete(url, headers=user_a["headers"]).status_code == 204
    assert _pot(_overview(client, user_a), pot["id"])["due"] == "150.00"


def test_skipping_a_malformed_month_is_a_422(client, user_a):
    pot = _type(client, user_a)
    response = client.put(f"/api/savings/skips/{pot['id']}/2026-9", headers=user_a["headers"])
    assert response.status_code == 422


def test_deleting_a_pot_takes_its_skips_with_it(client, user_a, runtime_connection):
    pot = client.post(
        "/api/savings/types", json={"name": "Car"}, headers=user_a["headers"]
    ).json()
    client.put(f"/api/savings/skips/{pot['id']}/2026-09", headers=user_a["headers"])
    assert client.delete(
        f"/api/savings/types/{pot['id']}", headers=user_a["headers"]
    ).status_code == 204
    conn = runtime_connection(user_a["id"])
    try:
        assert conn.execute(text("SELECT count(*) FROM savings_skips")).scalar_one() == 0
    finally:
        conn.close()


@pytest.mark.parametrize(
    ("target", "saved", "skipped", "expected"),
    [
        (None, "0", False, None),
        ("0", "0", False, None),
        ("100", "0", False, "100"),
        ("100", "40", False, "60"),
        ("100", "100", False, None),
        ("100", "140", False, None),
        # A withdrawal does not make more than the target due.
        ("100", "-40", False, "100"),
        ("100", "0", True, None),
    ],
)
def test_due_amount(target, saved, skipped, expected):
    got = due_amount(Decimal(target) if target else None, Decimal(saved), skipped)
    assert got == (Decimal(expected) if expected else None)


# ------------------------------------------------------------------------ goals


def test_a_goal_is_set_read_and_cleared(client, user_a):
    pot = _type(client, user_a)
    url = f"/api/savings/types/{pot['id']}"
    set_ = client.patch(
        url, json={"goal_amount": "5000", "goal_date": "2027-06-30"}, headers=user_a["headers"]
    )
    assert set_.status_code == 200, set_.text
    assert set_.json()["goal_amount"] == "5000.00"
    assert set_.json()["goal_date"] == "2027-06-30"
    assert _pot(_overview(client, user_a), pot["id"])["goal_amount"] == "5000.00"

    cleared = client.patch(
        url, json={"goal_amount": None, "goal_date": None}, headers=user_a["headers"]
    )
    assert cleared.json()["goal_amount"] is None
    assert cleared.json()["goal_date"] is None


def test_a_goal_date_without_an_amount_is_refused(client, user_a):
    pot = _type(client, user_a)
    response = client.patch(
        f"/api/savings/types/{pot['id']}",
        json={"goal_date": "2027-06-30"},
        headers=user_a["headers"],
    )
    assert response.status_code == 422
    assert response.json()["code"] == "savings_goal_date_needs_amount"


def test_a_pot_can_be_renamed_but_not_onto_another(client, user_a):
    pot = _type(client, user_a)
    url = f"/api/savings/types/{pot['id']}"
    assert client.patch(url, json={"name": " Holidays "}, headers=user_a["headers"]).json()[
        "name"
    ] == "Holidays"
    clash = client.patch(url, json={"name": "STARTUP"}, headers=user_a["headers"])
    assert clash.status_code == 409
    assert clash.json()["code"] == "savings_type_name_taken"
    assert client.patch(url, json={"name": None}, headers=user_a["headers"]).status_code == 422


def test_an_unknown_field_on_a_pot_patch_is_refused(client, user_a):
    pot = _type(client, user_a)
    response = client.patch(
        f"/api/savings/types/{pot['id']}", json={"goal": "5000"}, headers=user_a["headers"]
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("goal", "date", "balance", "current", "day", "expected"),
    [
        # Sept through Dec 2026 is four months; 1000 left over four is 250.
        ("1000", "2026-12-15", "0", "2026-09", 1, "250.00"),
        # Rounded up: 100 over three months is 33.34, never 33.33.
        ("100", "2026-11-01", "0", "2026-09", 1, "33.34"),
        # The balance counts.
        ("1000", "2026-12-15", "600", "2026-09", 1, "100.00"),
        # Reached: nothing needed.
        ("1000", "2026-12-15", "1000", "2026-09", 1, None),
        # No date: no hurry, no figure.
        ("1000", None, "0", "2026-09", 1, None),
        # A date already passed leaves one month — now.
        ("1000", "2026-01-01", "400", "2026-09", 1, "600.00"),
        # Start day 26: 2026-12-26 belongs to the month labelled 2027-01, five months away.
        ("1000", "2026-12-26", "0", "2026-09", 26, "200.00"),
    ],
)
def test_needed_per_month(goal, date, balance, current, day, expected):
    got = needed_per_month(
        Decimal(goal),
        dt.date.fromisoformat(date) if date else None,
        Decimal(balance),
        current,
        day,
    )
    assert got == (Decimal(expected) if expected else None)


# ------------------------------------------------------------- dashboard, export


def test_the_dashboard_counts_a_withdrawal_as_money_out_of_savings(client, user_a):
    pot = _type(client, user_a)
    _move(client, user_a, pot["id"], "100.00")
    _move(client, user_a, pot["id"], "30.00", kind="withdrawal")
    dashboard = client.get(
        "/api/dashboard/summary", params={"month": "2026-09"}, headers=user_a["headers"]
    ).json()
    savings = next(s for s in dashboard["savings"] if s["savings_type_id"] == pot["id"])
    assert savings["actual"] == "70.00"


def test_the_dashboard_survives_a_month_of_withdrawals(client, user_a):
    """A net-negative savings month used to be a NonNegativeMoney field: a 500, not a figure."""
    pot = _type(client, user_a)
    _move(client, user_a, pot["id"], "100.00", on="2026-08-10")
    _move(client, user_a, pot["id"], "40.00", kind="withdrawal", on="2026-09-10")
    summary = client.get(
        "/api/dashboard/summary", params={"month": "2026-09"}, headers=user_a["headers"]
    )
    assert summary.status_code == 200, summary.text
    assert summary.json()["saved"] == "-40.00"
    savings = next(s for s in summary.json()["savings"] if s["savings_type_id"] == pot["id"])
    assert savings["actual"] == "-40.00"
    trends = client.get(
        "/api/dashboard/trends", params={"ending": "2026-09"}, headers=user_a["headers"]
    )
    assert trends.status_code == 200, trends.text
    assert trends.json()["saved"][-1] == "-40.00"


def test_the_export_says_which_rows_are_withdrawals(client, user_a):
    pot = _type(client, user_a)
    _move(client, user_a, pot["id"], "100.00", on="2026-09-01")
    _move(client, user_a, pot["id"], "30.00", kind="withdrawal", on="2026-09-02")
    body = client.get("/api/export/savings.csv", headers=user_a["headers"]).text
    lines = body.strip().splitlines()
    assert lines[0] == "date,savings_type,kind,amount,note"
    assert lines[1] == "2026-09-01,vacation,deposit,100.00,"
    assert lines[2] == "2026-09-02,vacation,withdrawal,30.00,"


# -------------------------------------------------------------------- isolation


def test_b_cannot_see_patch_or_skip_a_pot_of_a(client, user_a, user_b):
    pot = _type(client, user_a)
    _move(client, user_a, pot["id"], "100.00")
    assert all(p["savings_type_id"] != pot["id"] for p in _overview(client, user_b)["pots"])
    assert client.patch(
        f"/api/savings/types/{pot['id']}", json={"name": "x"}, headers=user_b["headers"]
    ).status_code == 404
    assert client.put(
        f"/api/savings/skips/{pot['id']}/2026-09", headers=user_b["headers"]
    ).status_code == 404
    assert _move(client, user_b, pot["id"], "1.00", kind="withdrawal").status_code == 404


def test_a_skip_cannot_reference_another_users_pot(client, user_a, user_b, runtime_connection):
    pot = _type(client, user_a)
    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises(IntegrityError) as error:
            conn.execute(
                text(
                    "INSERT INTO savings_skips (user_id, savings_type_id, month) "
                    "VALUES (:uid, :sid, '2026-09')"
                ),
                {"uid": str(user_b["id"]), "sid": pot["id"]},
            )
        assert "savings_skips_type_fkey" in str(error.value)
    finally:
        conn.close()
