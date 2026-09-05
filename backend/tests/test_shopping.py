"""Epic 14 — the shopping list and the one write that crosses the module boundary.

The properties that matter: the estimate never lies about what it left out; ticking an item
off restocks it and records the expense in one transaction, or neither; the link survives
the entry being deleted; and AD-31's boundary still holds everywhere except the seam.
"""

import datetime as dt

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

TODAY = dt.date.today().isoformat()


def _space(client, user, name="Fridge"):
    return client.post("/api/inventory/spaces", json={"name": name}, headers=user["headers"]).json()


def _item(client, user, **overrides):
    payload = {
        "name": "Milk",
        "quantity": 0,
        "restock_below": 2,
        "space_name": "Fridge",
    } | overrides
    return client.post("/api/inventory/items", json=payload, headers=user["headers"]).json()


def _list(client, user):
    response = client.get("/api/inventory/shopping-list", headers=user["headers"])
    assert response.status_code == 200, response.text
    return response.json()


def _purchase(client, user, item_id, **body):
    return client.post(
        f"/api/inventory/items/{item_id}/purchase", json=body, headers=user["headers"]
    )


# --------------------------------------------------------- the list


def test_the_list_suggests_enough_to_clear_the_threshold_with_one_to_spare(client, user_a):
    _space(client, user_a)
    _item(client, user_a, name="Milk", quantity=0, restock_below=2, cost="1.20")
    _item(client, user_a, name="Eggs", quantity=2, restock_below=2, cost="3.00")
    # Not low: absent from the list entirely.
    _item(client, user_a, name="Rice", quantity=9, restock_below=1, cost="2.00")

    body = _list(client, user_a)
    rows = {row["name"]: row for row in body["items"]}
    assert set(rows) == {"Milk", "Eggs"}
    # 0 with a threshold of 2 → buy 3; 2 with a threshold of 2 → buy 1.
    assert rows["Milk"]["suggested"] == 3
    assert rows["Eggs"]["suggested"] == 1
    assert rows["Milk"]["estimate"] == "3.60"
    assert rows["Eggs"]["estimate"] == "3.00"
    assert body["estimate"] == "6.60"
    assert body["without_cost"] == 0
    assert rows["Milk"]["space_name"] == "Fridge"


def test_an_item_with_no_cost_is_listed_but_left_out_of_the_total_and_counted(client, user_a):
    _space(client, user_a)
    _item(client, user_a, name="Milk", quantity=0, restock_below=1, cost="1.50")
    _item(client, user_a, name="Batteries", quantity=0, restock_below=1)

    body = _list(client, user_a)
    rows = {row["name"]: row for row in body["items"]}
    assert rows["Batteries"]["estimate"] is None, "0.00 would be a price, not an unknown"
    assert rows["Batteries"]["unit_cost"] is None
    # The total covers only what it can, and says so rather than being quietly short.
    assert body["estimate"] == "3.00"
    assert body["without_cost"] == 1


def test_an_empty_list_totals_zero_rather_than_nothing(client, user_a):
    assert _list(client, user_a) == {"items": [], "estimate": "0.00", "without_cost": 0}


# ------------------------------------------------------- ticking off


def test_ticking_an_item_off_restocks_it_and_records_the_expense_in_one_action(client, user_a):
    _space(client, user_a)
    item = _item(client, user_a, quantity=0, restock_below=2, cost="1.20")

    response = _purchase(
        client, user_a, item["id"], quantity=3, amount="3.75", category_name="Groceries"
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["item"]["quantity"] == 3
    assert body["item"]["needs_restock"] is False
    assert body["purchase"]["quantity"] == 3
    assert body["purchase"]["entry_id"] is not None

    entries = client.get("/api/entries", headers=user_a["headers"]).json()["items"]
    assert len(entries) == 1
    assert entries[0]["amount"] == "3.75"
    assert entries[0]["kind"] == "expense"
    assert entries[0]["id"] == body["purchase"]["entry_id"]
    # The note says what was bought, so the ledger row is readable on its own.
    assert "Milk" in entries[0]["note"] and "3" in entries[0]["note"]

    # It counts as a real restock: the history and restocked_at both moved.
    assert body["item"]["restocked_at"] is not None
    history = client.get(
        f"/api/inventory/items/{item['id']}/history", headers=user_a["headers"]
    ).json()["items"]
    assert (history[-1]["quantity_before"], history[-1]["quantity_after"]) == (0, 3)


def test_a_restock_that_cost_nothing_records_no_entry(client, user_a):
    _space(client, user_a)
    item = _item(client, user_a, quantity=0)

    response = _purchase(client, user_a, item["id"], quantity=2)
    assert response.status_code == 200, response.text
    assert response.json()["purchase"]["entry_id"] is None
    assert response.json()["item"]["quantity"] == 2
    assert client.get("/api/entries", headers=user_a["headers"]).json()["items"] == []


def test_an_amount_needs_a_category_and_a_category_needs_an_amount(client, user_a):
    _space(client, user_a)
    item = _item(client, user_a)

    assert _purchase(client, user_a, item["id"], quantity=1, amount="2.00").status_code == 422
    assert (
        _purchase(client, user_a, item["id"], quantity=1, category_name="Groceries").status_code
        == 422
    )
    # And neither half was written by the attempt.
    assert client.get("/api/entries", headers=user_a["headers"]).json()["items"] == []
    assert (
        client.get(
            f"/api/inventory/items?space_id={item['space_id']}", headers=user_a["headers"]
        ).json()["items"][0]["quantity"]
        == 0
    )


def test_a_zero_or_negative_quantity_is_refused(client, user_a):
    _space(client, user_a)
    item = _item(client, user_a)
    assert _purchase(client, user_a, item["id"], quantity=0).status_code == 422
    assert _purchase(client, user_a, item["id"], quantity=-2).status_code == 422


def test_a_failed_entry_leaves_the_item_unrestocked(client, user_a):
    """Both halves are in the request's one transaction (AD-4), so neither survives alone.

    Verified by mutation rather than assumed: with the restock moved *before* the entry, so
    that ordering alone could not explain the result, this still passes — the item is put
    back by the rollback, not by never having been touched.
    """
    _space(client, user_a)
    item = _item(client, user_a, quantity=1)
    salary = client.post(
        "/api/categories", json={"name": "Salary", "kind": "income"}, headers=user_a["headers"]
    ).json()

    # An expense cannot be filed under an income category (AD-7): the entry fails.
    failed = _purchase(
        client, user_a, item["id"], quantity=5, amount="9.99", category_id=salary["id"]
    )
    assert failed.status_code == 404

    fresh = client.get("/api/inventory/items", headers=user_a["headers"]).json()["items"]
    assert fresh[0]["quantity"] == 1, "the restock must have rolled back with the entry"
    assert client.get("/api/entries", headers=user_a["headers"]).json()["items"] == []


def test_purchases_are_listed_newest_first_and_survive_the_entry(client, user_a):
    _space(client, user_a)
    item = _item(client, user_a, quantity=0)
    first = _purchase(
        client,
        user_a,
        item["id"],
        quantity=1,
        amount="1.10",
        category_name="Groceries",
        occurred_on="2026-08-01",
    ).json()
    _purchase(
        client,
        user_a,
        item["id"],
        quantity=2,
        amount="2.20",
        category_name="Groceries",
        occurred_on="2026-09-01",
    )

    rows = client.get(
        f"/api/inventory/items/{item['id']}/purchases", headers=user_a["headers"]
    ).json()["items"]
    assert [r["purchased_on"] for r in rows] == ["2026-09-01", "2026-08-01"]

    # Deleting the entry releases the link and keeps the purchase — the item was restocked,
    # whatever later happened to the expense record.
    assert (
        client.delete(
            f"/api/entries/{first['purchase']['entry_id']}", headers=user_a["headers"]
        ).status_code
        == 204
    )
    rows = client.get(
        f"/api/inventory/items/{item['id']}/purchases", headers=user_a["headers"]
    ).json()["items"]
    assert len(rows) == 2
    assert rows[-1]["entry_id"] is None
    assert rows[-1]["quantity"] == 1


def test_deleting_an_item_takes_its_purchases_and_leaves_the_entries(client, user_a):
    _space(client, user_a)
    item = _item(client, user_a, quantity=0)
    bought = _purchase(
        client, user_a, item["id"], quantity=1, amount="4.00", category_name="Groceries"
    ).json()

    assert (
        client.delete(f"/api/inventory/items/{item['id']}", headers=user_a["headers"]).status_code
        == 204
    )
    entries = client.get("/api/entries", headers=user_a["headers"]).json()["items"]
    assert [e["id"] for e in entries] == [bought["purchase"]["entry_id"]]


# --------------------------------------------------------- isolation


def test_b_cannot_shop_for_a(client, user_a, user_b, runtime_connection):
    _space(client, user_a)
    item = _item(client, user_a, quantity=0, cost="1.20")

    assert _list(client, user_b) == {"items": [], "estimate": "0.00", "without_cost": 0}
    assert _purchase(client, user_b, item["id"], quantity=1).status_code == 404
    assert (
        client.get(
            f"/api/inventory/items/{item['id']}/purchases", headers=user_b["headers"]
        ).status_code
        == 404
    )

    _purchase(client, user_a, item["id"], quantity=1, amount="1.20", category_name="Groceries")
    conn = runtime_connection(user_b["id"])
    try:
        assert conn.execute(text("SELECT count(*) FROM inventory_purchases")).scalar_one() == 0
    finally:
        conn.close()


def test_the_foreign_key_refuses_a_purchase_across_users(
    client, user_a, user_b, runtime_connection
):
    _space(client, user_a)
    item = _item(client, user_a)

    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO inventory_purchases (user_id, item_id, quantity, purchased_on) "
                    "VALUES (:uid, :iid, 1, CURRENT_DATE)"
                ),
                {"uid": str(user_b["id"]), "iid": item["id"]},
            )
    finally:
        conn.close()


def test_the_modules_stay_independent_apart_from_the_seam():
    """AD-31, checked by reading the imports rather than by trusting the convention."""
    from pathlib import Path

    root = Path(__file__).resolve().parents[1] / "app" / "services"
    inventory_src = (root / "inventory.py").read_text(encoding="utf-8")
    ledger_src = (root / "ledger.py").read_text(encoding="utf-8")

    assert "models.ledger" not in inventory_src and "services import ledger" not in inventory_src
    assert "models.inventory" not in ledger_src and "services import inventory" not in ledger_src
    # The seam imports the two services, and neither of their model modules.
    shopping_src = (root / "shopping.py").read_text(encoding="utf-8")
    assert "from app.services import inventory as inventory_service" in shopping_src
    assert "from app.services import ledger as ledger_service" in shopping_src
    assert "from app.models.ledger import" not in shopping_src
