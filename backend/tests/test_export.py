"""Epic 16 — CSV export.

The property worth the most here is formula injection: a note is user-written text, and a
spreadsheet treats a cell starting with ``=`` as a formula. Everything else is shape.
"""

import csv
import io

import pytest

from app.services.export import safe_cell


def _category(client, user, name="Groceries", kind="expense"):
    return client.post(
        "/api/categories", json={"name": name, "kind": kind}, headers=user["headers"]
    ).json()


def _entry(client, user, category_id, **overrides):
    payload = {
        "kind": "expense",
        "amount": "12.50",
        "occurred_on": "2026-08-15",
        "category_id": category_id,
    } | overrides
    return client.post("/api/entries", json=payload, headers=user["headers"]).json()


def _csv(client, user, kind="entries"):
    response = client.get(f"/api/export/{kind}.csv", headers=user["headers"])
    assert response.status_code == 200, response.text
    return response


def _rows(response):
    return list(csv.reader(io.StringIO(response.text)))


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("=1+1", "'=1+1"),
        ("+34 7 123", "'+34 7 123"),
        ("-cmd", "'-cmd"),
        ("@SUM(A1)", "'@SUM(A1)"),
        ("\tlead", "'\tlead"),
        ("ordinary note", "ordinary note"),
        ("12.50", "12.50"),
        ("", ""),
        (None, ""),
    ],
)
def test_a_cell_that_looks_like_a_formula_is_written_as_text(value, expected):
    assert safe_cell(value) == expected


def test_a_note_cannot_smuggle_a_formula_into_a_spreadsheet(client, user_a):
    """The attack: a family member opens the export and the note runs."""
    category = _category(client, user_a)
    _entry(client, user_a, category["id"], note='=HYPERLINK("http://evil","click me")')

    rows = _rows(_csv(client, user_a))
    note = rows[1][-1]
    assert note.startswith("'="), note
    # The text is preserved — neutralised, not censored.
    assert 'HYPERLINK("http://evil","click me")' in note


def test_a_category_name_is_neutralised_too(client, user_a):
    category = _category(client, user_a, name="=cmd|calc")
    _entry(client, user_a, category["id"])
    assert _rows(_csv(client, user_a))[1][2] == "'=cmd|calc"


def test_entries_export_carries_the_columns_and_the_decimal_strings(client, user_a):
    category = _category(client, user_a, name="Fuel")
    _entry(client, user_a, category["id"], amount="60.00", quantity="40", unit="l", note="full")

    rows = _rows(_csv(client, user_a))
    assert rows[0] == [
        "date",
        "kind",
        "category",
        "amount",
        "quantity",
        "unit",
        "unit_price",
        "note",
    ]
    assert rows[1] == ["2026-08-15", "expense", "Fuel", "60.00", "40.000", "l", "1.5000", "full"]


def test_an_unquantified_entry_leaves_those_columns_empty(client, user_a):
    category = _category(client, user_a)
    _entry(client, user_a, category["id"])
    row = _rows(_csv(client, user_a))[1]
    assert row[4] == "" and row[5] == "" and row[6] == ""


def test_a_comma_or_a_newline_in_a_note_survives_the_round_trip(client, user_a):
    category = _category(client, user_a)
    _entry(client, user_a, category["id"], note="milk, bread\nand cheese")
    rows = _rows(_csv(client, user_a))
    assert rows[1][-1] == "milk, bread\nand cheese"
    assert len(rows) == 2, "an embedded newline must not become a second row"


def test_the_response_is_a_dated_attachment(client, user_a):
    response = _csv(client, user_a)
    disposition = response.headers["content-disposition"]
    assert disposition.startswith("attachment;")
    assert "minimalbudget-entries-" in disposition and disposition.endswith('.csv"')
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["cache-control"] == "no-store"


def test_savings_and_inventory_export_too(client, user_a):
    types = client.get("/api/savings/types", headers=user_a["headers"]).json()["items"]
    client.post(
        "/api/savings/contributions",
        json={
            "savings_type_id": types[0]["id"],
            "amount": "400.00",
            "occurred_on": "2026-08-05",
        },
        headers=user_a["headers"],
    )
    client.post("/api/inventory/spaces", json={"name": "Fridge"}, headers=user_a["headers"])
    client.post(
        "/api/inventory/items",
        json={"name": "Milk", "quantity": 0, "restock_below": 2, "space_name": "Fridge"},
        headers=user_a["headers"],
    )

    savings = _rows(_csv(client, user_a, "savings"))
    assert savings[0] == ["date", "savings_type", "amount", "note"]
    assert savings[1][2] == "400.00"

    inventory = _rows(_csv(client, user_a, "inventory"))
    assert inventory[0] == [
        "space",
        "item",
        "quantity",
        "restock_below",
        "cost",
        "needs_restock",
        "note",
    ]
    assert inventory[1][:4] == ["Fridge", "Milk", "0", "2"]
    assert inventory[1][5] == "yes"


def test_an_empty_export_is_a_header_and_nothing_else(client, user_a):
    rows = _rows(_csv(client, user_a))
    assert len(rows) == 1 and rows[0][0] == "date"


def test_export_needs_a_token_and_never_crosses_a_user(client, user_a, user_b):
    category = _category(client, user_a)
    _entry(client, user_a, category["id"], note="a private note")

    assert client.get("/api/export/entries.csv").status_code == 401
    assert "private" not in _csv(client, user_b).text
    assert len(_rows(_csv(client, user_b))) == 1
