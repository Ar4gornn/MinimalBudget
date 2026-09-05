"""Epic 17 — vendors, and the comparison they exist for.

A vendor is reference data (AD-12), not free text, because the whole point is comparing
"Shell" against "Total" and three spellings of one shop is noise rather than a comparison.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError


def _category(client, user, name="Fuel", kind="expense"):
    return client.post(
        "/api/categories", json={"name": name, "kind": kind}, headers=user["headers"]
    ).json()


def _entry(client, user, category_id, **overrides):
    payload = {
        "kind": "expense",
        "amount": "60.00",
        "occurred_on": "2026-08-15",
        "category_id": category_id,
    } | overrides
    return client.post("/api/entries", json=payload, headers=user["headers"])


def _vendors(client, user):
    return client.get("/api/vendors", headers=user["headers"]).json()["items"]


def _prices(client, user, category_id, **params):
    query = "&".join(f"{k}={v}" for k, v in {"category_id": category_id, **params}.items())
    response = client.get(f"/api/dashboard/vendor-prices?{query}", headers=user["headers"])
    assert response.status_code == 200, response.text
    return response.json()


# ------------------------------------------------------------- the vendor


def test_a_vendor_is_created_by_name_from_an_entry_and_reused_case_insensitively(client, user_a):
    fuel = _category(client, user_a)
    first = _entry(client, user_a, fuel["id"], vendor_name="Shell").json()
    second = _entry(client, user_a, fuel["id"], vendor_name="shell").json()

    assert first["vendor_id"] == second["vendor_id"]
    vendors = _vendors(client, user_a)
    assert [v["name"] for v in vendors] == ["Shell"], "the first spelling is the one kept"


def test_an_entry_without_a_vendor_is_unchanged(client, user_a):
    fuel = _category(client, user_a)
    created = _entry(client, user_a, fuel["id"]).json()
    assert created["vendor_id"] is None
    assert _vendors(client, user_a) == []


def test_both_vendor_fields_at_once_are_rejected(client, user_a):
    fuel = _category(client, user_a)
    vendor = client.post("/api/vendors", json={"name": "Total"}, headers=user_a["headers"]).json()
    response = _entry(client, user_a, fuel["id"], vendor_id=vendor["id"], vendor_name="Shell")
    assert response.status_code == 422


def test_a_vendor_can_be_set_and_cleared_by_patch(client, user_a):
    fuel = _category(client, user_a)
    entry = _entry(client, user_a, fuel["id"]).json()
    url = f"/api/entries/{entry['id']}"

    with_vendor = client.patch(url, json={"vendor_name": "Shell"}, headers=user_a["headers"])
    assert with_vendor.json()["vendor_id"] is not None

    cleared = client.patch(url, json={"vendor_id": None}, headers=user_a["headers"])
    assert cleared.json()["vendor_id"] is None
    # Absent is not the same as null: an untouched PATCH leaves the vendor alone.
    client.patch(url, json={"vendor_name": "Shell"}, headers=user_a["headers"])
    untouched = client.patch(url, json={"amount": "61.00"}, headers=user_a["headers"])
    assert untouched.json()["vendor_id"] is not None


def test_a_vendor_with_entries_cannot_be_deleted(client, user_a):
    fuel = _category(client, user_a)
    entry = _entry(client, user_a, fuel["id"], vendor_name="Shell").json()
    vendor_id = entry["vendor_id"]

    # AD-21: RESTRICT. Deleting it would erase which shop a year of entries came from.
    assert client.delete(f"/api/vendors/{vendor_id}", headers=user_a["headers"]).status_code == 409

    client.delete(f"/api/entries/{entry['id']}", headers=user_a["headers"])
    assert client.delete(f"/api/vendors/{vendor_id}", headers=user_a["headers"]).status_code == 204


def test_another_users_vendor_is_404_and_the_key_refuses_it_below_the_api(
    client, user_a, user_b, runtime_connection
):
    fuel_a = _category(client, user_a)
    vendor = client.post("/api/vendors", json={"name": "Shell"}, headers=user_a["headers"]).json()

    fuel_b = _category(client, user_b)
    assert _entry(client, user_b, fuel_b["id"], vendor_id=vendor["id"]).status_code == 404
    assert (
        client.delete(f"/api/vendors/{vendor['id']}", headers=user_b["headers"]).status_code == 404
    )
    assert _vendors(client, user_b) == []

    entry = _entry(client, user_b, fuel_b["id"]).json()
    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises(IntegrityError):
            conn.execute(
                text("UPDATE entries SET vendor_id = :vid WHERE id = :eid"),
                {"vid": vendor["id"], "eid": entry["id"]},
            )
    finally:
        conn.close()
    assert fuel_a["id"] != fuel_b["id"]


# -------------------------------------------------------- the comparison


def test_the_comparison_is_volume_weighted_per_vendor(client, user_a):
    """Two fills at one shop, one at another. The figures were worked out by hand."""
    fuel = _category(client, user_a)
    # Shell: 16.00 for 10 l and 70.00 for 50 l → 86.00 / 60.000 = 1.4333/l
    _entry(client, user_a, fuel["id"], amount="16.00", quantity="10", unit="l", vendor_name="Shell")
    _entry(client, user_a, fuel["id"], amount="70.00", quantity="50", unit="l", vendor_name="Shell")
    # Total: 30.00 for 20 l → 1.5000/l
    _entry(client, user_a, fuel["id"], amount="30.00", quantity="20", unit="l", vendor_name="Total")

    rows = {
        row["vendor_name"]: row
        for row in _prices(client, user_a, fuel["id"], months=3, ending="2026-08")["vendors"]
    }
    assert rows["Shell"]["unit_price"] == "1.4333"
    assert rows["Shell"]["spent"] == "86.00"
    assert rows["Shell"]["entries"] == 2
    assert rows["Total"]["unit_price"] == "1.5000"
    assert rows["Total"]["spent"] == "30.00"


def test_an_unquantified_entry_counts_towards_spend_but_not_towards_a_rate(client, user_a):
    fuel = _category(client, user_a)
    _entry(client, user_a, fuel["id"], amount="20.00", vendor_name="Shell")

    row = _prices(client, user_a, fuel["id"], months=3, ending="2026-08")["vendors"][0]
    assert row["spent"] == "20.00"
    assert row["unit_price"] is None, "0.0000 would be a price nobody paid"


def test_the_two_are_reported_separately_when_a_vendor_has_both(client, user_a):
    fuel = _category(client, user_a)
    _entry(client, user_a, fuel["id"], amount="30.00", quantity="20", unit="l", vendor_name="Shell")
    _entry(client, user_a, fuel["id"], amount="5.00", vendor_name="Shell")

    rows = _prices(client, user_a, fuel["id"], months=3, ending="2026-08")["vendors"]
    by_unit = {row["unit"]: row for row in rows}
    assert by_unit["l"]["unit_price"] == "1.5000"
    assert by_unit[None]["unit_price"] is None
    assert by_unit[None]["spent"] == "5.00"


def test_the_window_is_half_open_and_excludes_other_categories(client, user_a):
    fuel = _category(client, user_a)
    other = _category(client, user_a, name="Groceries")
    _entry(
        client, user_a, fuel["id"], amount="10.00", occurred_on="2026-08-31", vendor_name="Shell"
    )
    _entry(
        client, user_a, fuel["id"], amount="99.00", occurred_on="2026-09-01", vendor_name="Shell"
    )
    _entry(
        client, user_a, other["id"], amount="50.00", occurred_on="2026-08-15", vendor_name="Shell"
    )

    rows = _prices(client, user_a, fuel["id"], months=1, ending="2026-08")["vendors"]
    assert len(rows) == 1
    assert rows[0]["spent"] == "10.00", "September and the other category are both excluded"


def test_entries_with_no_vendor_are_absent_from_the_comparison(client, user_a):
    fuel = _category(client, user_a)
    _entry(client, user_a, fuel["id"], amount="40.00")
    assert _prices(client, user_a, fuel["id"], months=3, ending="2026-08")["vendors"] == []


def test_b_sees_none_of_as_vendor_spending(client, user_a, user_b):
    fuel = _category(client, user_a)
    _entry(client, user_a, fuel["id"], amount="60.00", vendor_name="Shell")
    assert _prices(client, user_b, fuel["id"], months=3, ending="2026-08")["vendors"] == []
