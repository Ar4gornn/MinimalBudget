"""Epic 15 — searching entries and items.

The property worth a test is the one that is easy to get wrong: a phrase containing a LIKE
metacharacter must be searched literally. "50%" is a thing people write in notes, and an
unescaped % matches every row.
"""

import pytest

from app.core.search import ESCAPE, pattern


def _category(client, user, name, kind="expense"):
    return client.post(
        "/api/categories", json={"name": name, "kind": kind}, headers=user["headers"]
    ).json()


def _entry(client, user, category_id, note=None, amount="10.00"):
    payload = {
        "kind": "expense",
        "amount": amount,
        "occurred_on": "2026-08-15",
        "category_id": category_id,
    }
    if note is not None:
        payload["note"] = note
    return client.post("/api/entries", json=payload, headers=user["headers"]).json()


def _search(client, user, q):
    response = client.get(f"/api/entries?q={q}", headers=user["headers"])
    assert response.status_code == 200, response.text
    return response.json()["items"]


def _items(client, user, q):
    response = client.get(f"/api/inventory/items?q={q}", headers=user["headers"])
    assert response.status_code == 200, response.text
    return response.json()["items"]


@pytest.mark.parametrize(
    ("phrase", "expected"),
    [
        ("fuel", "%fuel%"),
        ("50%", f"%50{ESCAPE}%%"),
        ("a_b", f"%a{ESCAPE}_b%"),
        ("back\slash", f"%back{ESCAPE}{ESCAPE}slash%"),
        ("  padded  ", "%padded%"),
    ],
)
def test_metacharacters_are_escaped_into_literals(phrase, expected):
    assert pattern(phrase) == expected


def test_search_matches_the_note_and_the_category_name(client, user_a):
    fuel = _category(client, user_a, "Fuel")
    food = _category(client, user_a, "Groceries")
    by_note = _entry(client, user_a, food["id"], note="diesel for the mower")
    by_category = _entry(client, user_a, fuel["id"])
    _entry(client, user_a, food["id"], note="bread")

    found = {row["id"] for row in _search(client, user_a, "diesel")}
    assert found == {by_note["id"]}

    # The category's own name is searched too, so "fuel" finds the entry filed under it.
    found = {row["id"] for row in _search(client, user_a, "fuel")}
    assert found == {by_category["id"]}


def test_search_is_case_insensitive(client, user_a):
    food = _category(client, user_a, "Groceries")
    entry = _entry(client, user_a, food["id"], note="Bread and Milk")
    assert [row["id"] for row in _search(client, user_a, "BREAD")] == [entry["id"]]


def test_a_percent_sign_is_searched_literally(client, user_a):
    """The bug this guards: an unescaped % is the wildcard, so it would match everything."""
    food = _category(client, user_a, "Groceries")
    discounted = _entry(client, user_a, food["id"], note="50% off")
    _entry(client, user_a, food["id"], note="full price")
    _entry(client, user_a, food["id"], note=None)

    found = [row["id"] for row in _search(client, user_a, "50%25")]  # %25 is an encoded %
    assert found == [discounted["id"]]


def test_search_combines_with_the_other_filters(client, user_a):
    food = _category(client, user_a, "Groceries")
    wanted = _entry(client, user_a, food["id"], note="milk")
    client.post(
        "/api/entries",
        json={
            "kind": "expense",
            "amount": "5.00",
            "occurred_on": "2026-09-01",
            "category_id": food["id"],
            "note": "milk",
        },
        headers=user_a["headers"],
    )

    response = client.get("/api/entries?q=milk&month=2026-08", headers=user_a["headers"])
    assert [row["id"] for row in response.json()["items"]] == [wanted["id"]]


def test_an_empty_search_returns_everything(client, user_a):
    food = _category(client, user_a, "Groceries")
    _entry(client, user_a, food["id"], note="one")
    _entry(client, user_a, food["id"], note="two")
    assert len(_search(client, user_a, "")) == 2


def test_items_are_searched_by_name_and_note(client, user_a):
    client.post("/api/inventory/spaces", json={"name": "Garage"}, headers=user_a["headers"])
    oil = client.post(
        "/api/inventory/items",
        json={"name": "Engine oil", "quantity": 1, "space_name": "Garage", "note": "5W-30"},
        headers=user_a["headers"],
    ).json()
    client.post(
        "/api/inventory/items",
        json={"name": "Batteries", "quantity": 4, "space_name": "Garage"},
        headers=user_a["headers"],
    )

    assert [row["id"] for row in _items(client, user_a, "oil")] == [oil["id"]]
    assert [row["id"] for row in _items(client, user_a, "5W")] == [oil["id"]]
    assert _items(client, user_a, "nothing here") == []


def test_search_never_crosses_a_user_boundary(client, user_a, user_b):
    food = _category(client, user_a, "Groceries")
    _entry(client, user_a, food["id"], note="a private note")
    assert _search(client, user_b, "private") == []
