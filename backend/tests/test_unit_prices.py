"""Epic 10 — quantity and unit on an entry, and the derived unit-price series.

Story 10.4 in particular: the weighted average below was worked out by hand. Two fills,
10.000 l for 16.00 and 50.000 l for 70.00, cost 86.00 for 60.000 l — 1.4333/l. The
average of the two per-entry rates (1.6000 and 1.4000) would be 1.5000, and that is the
wrong number this file exists to catch.
"""

import re

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models.ledger import UNIT_VALUES, Unit


def _category(client, user, name, kind="expense"):
    return client.post(
        "/api/categories", json={"name": name, "kind": kind}, headers=user["headers"]
    ).json()


def _entry(client, user, **overrides):
    payload = {"kind": "expense", "amount": "60.00", "occurred_on": "2026-08-15"} | overrides
    return client.post("/api/entries", json=payload, headers=user["headers"])


# ------------------------------------------------------------------ Story 10.1


def test_quantity_and_unit_round_trip_with_a_derived_unit_price(client, user_a):
    fuel = _category(client, user_a, "Fuel")
    created = _entry(client, user_a, category_id=fuel["id"], quantity="40", unit="l")
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["quantity"] == "40.000"
    assert body["unit"] == "l"
    # AD-29: four places, a string, derived.
    assert body["unit_price"] == "1.5000"
    assert isinstance(body["unit_price"], str)


def test_an_entry_without_a_quantity_reads_back_all_null(client, user_a):
    rent = _category(client, user_a, "Rent")
    body = _entry(client, user_a, category_id=rent["id"]).json()
    assert body["quantity"] is None
    assert body["unit"] is None
    assert body["unit_price"] is None


def test_the_rate_rounds_half_up_to_four_places(client, user_a):
    fuel = _category(client, user_a, "Fuel")
    # 60.14 / 40.123 = 1.49889... -> 1.4989
    body = _entry(
        client, user_a, category_id=fuel["id"], amount="60.14", quantity="40.123", unit="l"
    ).json()
    assert body["unit_price"] == "1.4989"


def test_quantity_without_unit_or_unit_without_quantity_is_422(client, user_a):
    fuel = _category(client, user_a, "Fuel")
    assert _entry(client, user_a, category_id=fuel["id"], quantity="40").status_code == 422
    assert _entry(client, user_a, category_id=fuel["id"], unit="l").status_code == 422


def test_a_unit_outside_the_closed_list_is_422_and_never_normalised(client, user_a):
    fuel = _category(client, user_a, "Fuel")
    for bad in ("Litre", "L", "liters", "litres", ""):
        response = _entry(client, user_a, category_id=fuel["id"], quantity="40", unit=bad)
        assert response.status_code == 422, bad


def test_quantity_is_validated_like_money(client, user_a):
    fuel = _category(client, user_a, "Fuel")
    for bad in (40.0, "40.1234", "0", "-1", "1_0"):
        response = _entry(client, user_a, category_id=fuel["id"], quantity=bad, unit="l")
        assert response.status_code == 422, bad


def test_an_income_entry_cannot_carry_a_quantity(client, user_a):
    salary = _category(client, user_a, "Salary", kind="income")
    response = _entry(
        client, user_a, kind="income", category_id=salary["id"], quantity="40", unit="l"
    )
    assert response.status_code == 422


def test_the_database_enforces_every_quantity_rule_itself(client, user_a, runtime_connection):
    """Validation is the first line; the CHECK constraints are the ones that cannot be skipped."""
    fuel = _category(client, user_a, "Fuel")
    salary = _category(client, user_a, "Salary", kind="income")

    def attempt(kind, category_id, quantity, unit):
        conn = runtime_connection(user_a["id"])
        try:
            with pytest.raises(IntegrityError):
                conn.execute(
                    text(
                        "INSERT INTO entries (user_id, kind, category_id, amount, occurred_on,"
                        " quantity, unit) VALUES (:uid, CAST(:kind AS entry_kind), :cid, 10,"
                        " '2026-08-01', :q, :u)"
                    ),
                    {
                        "uid": str(user_a["id"]),
                        "kind": kind,
                        "cid": category_id,
                        "q": quantity,
                        "u": unit,
                    },
                )
        finally:
            conn.close()

    attempt("expense", fuel["id"], "40", None)  # quantity without unit
    attempt("expense", fuel["id"], None, "l")  # unit without quantity
    attempt("expense", fuel["id"], "0", "l")  # non-positive
    attempt("expense", fuel["id"], "40", "litre")  # outside the list
    attempt("income", salary["id"], "40", "l")  # income


def test_patch_takes_the_pair_and_clears_the_pair(client, user_a):
    fuel = _category(client, user_a, "Fuel")
    entry = _entry(client, user_a, category_id=fuel["id"]).json()
    url = f"/api/entries/{entry['id']}"
    headers = user_a["headers"]

    added = client.patch(url, json={"quantity": "40", "unit": "l"}, headers=headers)
    assert added.status_code == 200, added.text
    assert added.json()["unit_price"] == "1.5000"

    # Changing the amount changes the rate, because nothing stored it.
    changed = client.patch(url, json={"amount": "80.00"}, headers=headers)
    assert changed.json()["unit_price"] == "2.0000"

    # One without the other is refused, whether as a value or as a lone null.
    assert client.patch(url, json={"quantity": "50"}, headers=headers).status_code == 422
    assert client.patch(url, json={"unit": "kg"}, headers=headers).status_code == 422
    lone_null = client.patch(url, json={"quantity": None, "unit": "l"}, headers=headers)
    assert lone_null.status_code == 422

    cleared = client.patch(url, json={"quantity": None, "unit": None}, headers=headers)
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["quantity"] is None
    assert cleared.json()["unit_price"] is None


def test_patching_a_quantity_onto_an_income_entry_is_422(client, user_a):
    salary = _category(client, user_a, "Salary", kind="income")
    entry = _entry(client, user_a, kind="income", category_id=salary["id"]).json()
    response = client.patch(
        f"/api/entries/{entry['id']}",
        json={"quantity": "40", "unit": "l"},
        headers=user_a["headers"],
    )
    assert response.status_code == 422


def test_the_list_carries_the_rate_on_every_row(client, user_a):
    fuel = _category(client, user_a, "Fuel")
    _entry(client, user_a, category_id=fuel["id"], quantity="40", unit="l")
    _entry(client, user_a, category_id=fuel["id"])
    rows = client.get("/api/entries", headers=user_a["headers"]).json()["items"]
    assert sorted(r["unit_price"] or "" for r in rows) == ["", "1.5000"]


def test_the_database_and_the_enum_agree_on_the_unit_list(owner_engine):
    """AD-29: the closed list lives in the migration, the ORM, the enum and the client. The
    migration is frozen by design, so this holds the database's constraint to the enum; the
    client's copy is held by its own test against the same literal list."""
    with owner_engine.connect() as conn:
        definition = conn.execute(
            text(
                "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
                "WHERE conname = 'entries_unit_supported'"
            )
        ).scalar_one()
    # Postgres renders the list back as ARRAY['l'::character varying, ...]; the quoted
    # tokens, in order, are what must match.
    assert tuple(re.findall(r"'([a-z0-9]+)'", definition)) == UNIT_VALUES, definition
    assert tuple(u.value for u in Unit) == UNIT_VALUES


def test_every_unit_in_the_enum_is_accepted(client, user_a):
    fuel = _category(client, user_a, "Fuel")
    for unit in Unit:
        response = _entry(client, user_a, category_id=fuel["id"], quantity="1", unit=unit.value)
        assert response.status_code == 201, (unit, response.text)


# ------------------------------------------------------------- Story 10.2 / 10.4


@pytest.fixture
def fills(client, user_a):
    """The hand-computed fixture.

    August, Fuel in litres: 10.000 l for 16.00 and 50.000 l for 70.00 -> 86.00 / 60.000 =
    1.4333. An unquantified Fuel entry of 30.00 in August must touch neither side of the
    division. A September fill lands in September only. Groceries in kg is a second series
    whose August is empty.
    """
    fuel = _category(client, user_a, "Fuel")
    groceries = _category(client, user_a, "Groceries")

    _entry(
        client,
        user_a,
        category_id=fuel["id"],
        amount="16.00",
        quantity="10",
        unit="l",
        occurred_on="2026-08-03",
    )
    _entry(
        client,
        user_a,
        category_id=fuel["id"],
        amount="70.00",
        quantity="50",
        unit="l",
        occurred_on="2026-08-31",
    )
    _entry(client, user_a, category_id=fuel["id"], amount="30.00", occurred_on="2026-08-20")
    _entry(
        client,
        user_a,
        category_id=fuel["id"],
        amount="66.00",
        quantity="40",
        unit="l",
        occurred_on="2026-09-01",
    )
    _entry(
        client,
        user_a,
        category_id=groceries["id"],
        amount="9.00",
        quantity="2.5",
        unit="kg",
        occurred_on="2026-07-10",
    )
    return {"fuel": fuel, "groceries": groceries}


def _series(client, user, months=3, ending="2026-09"):
    response = client.get(
        f"/api/dashboard/unit-prices?months={months}&ending={ending}", headers=user["headers"]
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_the_monthly_rate_is_volume_weighted(client, user_a, fills):
    body = _series(client, user_a)
    assert body["months"] == ["2026-07", "2026-08", "2026-09"]

    fuel = next(s for s in body["series"] if s["unit"] == "l")
    assert fuel["category_id"] == fills["fuel"]["id"]
    # Not 1.5000. The unquantified 30.00 is excluded from both sides.
    assert fuel["unit_price"] == [None, "1.4333", "1.6500"]
    assert fuel["quantity"] == ["0.000", "60.000", "40.000"]


def test_an_empty_month_is_null_for_the_rate_and_zero_for_the_quantity(client, user_a, fills):
    body = _series(client, user_a)
    groceries = next(s for s in body["series"] if s["unit"] == "kg")
    assert groceries["unit_price"] == ["3.6000", None, None]
    assert groceries["quantity"] == ["2.500", "0.000", "0.000"]


def test_the_series_are_ordered_and_keyed_by_category_and_unit(client, user_a, fills):
    # Same category, a second unit: two series, no conversion attempted.
    _entry(
        client,
        user_a,
        category_id=fills["fuel"]["id"],
        amount="40.00",
        quantity="10",
        unit="gal",
        occurred_on="2026-08-10",
    )
    body = _series(client, user_a)
    keys = [(s["category_name"], s["unit"]) for s in body["series"]]
    assert keys == [("Fuel", "gal"), ("Fuel", "l"), ("Groceries", "kg")]
    gallons = body["series"][0]
    assert gallons["unit_price"] == [None, "4.0000", None]


def test_a_single_entry_month_matches_that_entrys_own_unit_price(client, user_a):
    """The SQL rounding and the model's Python rounding must be the same rounding."""
    fuel = _category(client, user_a, "Fuel")
    entry = _entry(
        client, user_a, category_id=fuel["id"], amount="60.14", quantity="40.123", unit="l"
    ).json()
    body = _series(client, user_a, months=1, ending="2026-08")
    assert body["series"][0]["unit_price"] == [entry["unit_price"]] == ["1.4989"]


def test_no_quantified_entries_means_no_series(client, user_a):
    rent = _category(client, user_a, "Rent")
    _entry(client, user_a, category_id=rent["id"])
    body = _series(client, user_a, months=1, ending="2026-08")
    assert body["months"] == ["2026-08"]
    assert body["series"] == []


def test_b_sees_none_of_as_series(client, user_a, user_b, fills):
    assert _series(client, user_b)["series"] == []
