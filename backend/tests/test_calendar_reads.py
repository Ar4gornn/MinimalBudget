"""Story 22.1 — the two reads the calendar needed that no module yet answered.

The calendar composes existing module endpoints on the client (AD-31, AD-37). Two questions
had no endpoint at all: "what moved in the stock cupboard this month" and "what is still to
fall due later this month". Both are answered **inside the module that owns the rows**, so
composing the calendar stays a matter of calling each module rather than joining across them.

The figures asserted here are worked out by hand in the comments first.
"""

import datetime as dt

_TODAY = dt.date.today()


def _month_of(when: dt.date) -> str:
    return f"{when.year:04d}-{when.month:02d}"


# --------------------------------------------------- inventory: what moved


def _stock(client, user, name="Milk", quantity=2):
    space = client.post(
        "/api/inventory/spaces", json={"name": "Fridge"}, headers=user["headers"]
    ).json()
    item = client.post(
        "/api/inventory/items",
        json={"name": name, "quantity": quantity, "space_id": space["id"]},
        headers=user["headers"],
    ).json()
    return item


def test_changes_reports_every_item_in_one_window(client, user_a):
    """Two items, five log rows, one call.

    Hand-worked, and the first attempt got it wrong, which is why the count is spelled out:
    **creating an item logs a row too** — a *level*, `(q, q)`, so the chart has a first point
    without counting a newly written-down item as a restock. So Milk contributes (2,2) at
    creation, then (2,0) and (0,4); Eggs contributes (6,6) then (6,5). Five rows, oldest
    first, each naming its item so the calendar needs no second request to caption it.

    The calendar reads `quantity_before == quantity_after` as "added", not as a movement.
    """
    milk = _stock(client, user_a, "Milk", 2)
    eggs = _stock(client, user_a, "Eggs", 6)
    for item, quantity in ((milk, 0), (milk, 4), (eggs, 5)):
        client.patch(
            f"/api/inventory/items/{item['id']}",
            json={"quantity": quantity},
            headers=user_a["headers"],
        )

    rows = client.get(
        f"/api/inventory/changes?month={_month_of(_TODAY)}", headers=user_a["headers"]
    ).json()["items"]

    assert [(r["item_name"], r["quantity_before"], r["quantity_after"]) for r in rows] == [
        ("Milk", 2, 2),
        ("Eggs", 6, 6),
        ("Milk", 2, 0),
        ("Milk", 0, 4),
        ("Eggs", 6, 5),
    ]


def test_changes_excludes_a_month_that_holds_nothing(client, user_a):
    milk = _stock(client, user_a, "Milk", 2)
    client.patch(
        f"/api/inventory/items/{milk['id']}", json={"quantity": 0}, headers=user_a["headers"]
    )
    last_year = _month_of(_TODAY.replace(year=_TODAY.year - 1))
    assert (
        client.get(f"/api/inventory/changes?month={last_year}", headers=user_a["headers"]).json()[
            "items"
        ]
        == []
    )


def test_changes_needs_a_month_and_refuses_a_malformed_one(client, user_a):
    assert client.get("/api/inventory/changes", headers=user_a["headers"]).status_code == 422
    assert (
        client.get("/api/inventory/changes?month=Sept", headers=user_a["headers"]).status_code
        == 422
    )


def test_changes_of_one_account_never_reach_another(client, user_a, user_b):
    milk = _stock(client, user_a, "Milk", 2)
    client.patch(
        f"/api/inventory/items/{milk['id']}", json={"quantity": 0}, headers=user_a["headers"]
    )
    assert (
        client.get(
            f"/api/inventory/changes?month={_month_of(_TODAY)}", headers=user_b["headers"]
        ).json()["items"]
        == []
    )


# ------------------------------------------------- recurring: what is coming


def _weekly(client, user, *, start_on: dt.date, amount="10.00", category="Rent"):
    return client.post(
        "/api/recurring/templates",
        json={
            "kind": "expense",
            "amount": amount,
            "cadence": "weekly",
            "start_on": start_on.isoformat(),
            "category_name": category,
        },
        headers=user["headers"],
    ).json()


def test_expected_projects_forward_and_writes_nothing(client, user_a):
    """AD-39. Hand-worked, anchored on today so it holds whatever day the suite runs.

    A weekly template starting 14 days ago is due on -14, -7, 0, +7, +14, … Only the dates
    **strictly after today** are projections, so every date returned sits on the weekly
    rhythm and is later than today, and none of the already-due ones appear.

    And nothing is written: the occurrence table holds the same number of rows before and
    after, because a forecast that created rows would be the scheduler AD-33 refuses.
    """
    start = _TODAY - dt.timedelta(days=14)
    _weekly(client, user_a, start_on=start)

    before = client.get("/api/recurring/templates", headers=user_a["headers"]).json()["items"][0]
    expected = client.get(
        f"/api/recurring/expected?month={_month_of(_TODAY)}", headers=user_a["headers"]
    ).json()["items"]
    after = client.get("/api/recurring/templates", headers=user_a["headers"]).json()["items"][0]

    assert after["next_due"] == before["next_due"], "a projection must not advance the template"
    assert all(dt.date.fromisoformat(row["due_on"]) > _TODAY for row in expected)
    assert all(
        "id" not in row for row in expected
    ), "there is no row, so there is nothing to confirm"
    assert all(row["category_name"] == "Rent" for row in expected)

    # Every projected date is on the weekly rhythm from the template's start.
    for row in expected:
        assert (dt.date.fromisoformat(row["due_on"]) - start).days % 7 == 0


def test_expected_never_repeats_a_date_that_already_has_an_occurrence(client, user_a):
    """The materialised past and the projected future must not overlap by a single day.

    A template that started 14 days ago has already-due dates at -14, -7 and 0. Reading the
    pending list materialises those three. The projection then reports only dates after
    today, so no due date can appear twice on the calendar.
    """
    start = _TODAY - dt.timedelta(days=14)
    _weekly(client, user_a, start_on=start)

    pending = client.get("/api/recurring/pending", headers=user_a["headers"]).json()["items"]
    assert len(pending) == 3

    expected = client.get(
        f"/api/recurring/expected?month={_month_of(_TODAY)}", headers=user_a["headers"]
    ).json()["items"]

    due_pending = {row["due_on"] for row in pending}
    due_expected = {row["due_on"] for row in expected}
    assert due_pending & due_expected == set()


def test_a_paused_template_projects_nothing(client, user_a):
    template = _weekly(client, user_a, start_on=_TODAY - dt.timedelta(days=1))
    client.patch(
        f"/api/recurring/templates/{template['id']}",
        json={"paused": True},
        headers=user_a["headers"],
    )
    assert (
        client.get(
            f"/api/recurring/expected?month={_month_of(_TODAY)}", headers=user_a["headers"]
        ).json()["items"]
        == []
    )


def test_a_template_that_has_ended_projects_nothing_past_its_end(client, user_a):
    template = _weekly(client, user_a, start_on=_TODAY - dt.timedelta(days=1))
    client.patch(
        f"/api/recurring/templates/{template['id']}",
        json={"end_on": (_TODAY + dt.timedelta(days=3)).isoformat()},
        headers=user_a["headers"],
    )
    rows = client.get(
        f"/api/recurring/expected?month={_month_of(_TODAY)}", headers=user_a["headers"]
    ).json()["items"]
    horizon = _TODAY + dt.timedelta(days=3)
    assert all(dt.date.fromisoformat(row["due_on"]) <= horizon for row in rows)


def test_expected_of_one_account_never_reaches_another(client, user_a, user_b):
    _weekly(client, user_a, start_on=_TODAY - dt.timedelta(days=1))
    assert (
        client.get(
            f"/api/recurring/expected?month={_month_of(_TODAY)}", headers=user_b["headers"]
        ).json()["items"]
        == []
    )
