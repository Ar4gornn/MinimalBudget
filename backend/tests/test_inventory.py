"""Epic 11 — spaces, items, the restock predicate, and the quantity log."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, ProgrammingError


def _space(client, user, name):
    response = client.post("/api/inventory/spaces", json={"name": name}, headers=user["headers"])
    assert response.status_code == 201, response.text
    return response.json()


def _item(client, user, **overrides):
    payload = {"name": "Milk", "quantity": 2} | overrides
    return client.post("/api/inventory/items", json=payload, headers=user["headers"])


# ------------------------------------------------------------------ Story 11.1


def test_spaces_are_created_by_name_idempotently(client, user_a):
    fridge = _space(client, user_a, "Fridge")
    again = client.post(
        "/api/inventory/spaces", json={"name": " fridge "}, headers=user_a["headers"]
    )
    assert again.status_code == 201
    assert again.json()["id"] == fridge["id"]
    assert again.json()["name"] == "Fridge"  # the original casing is kept


def test_spaces_are_listed_enveloped_and_ordered(client, user_a):
    for name in ("garage", "Fridge", "House stuff"):
        _space(client, user_a, name)
    body = client.get("/api/inventory/spaces", headers=user_a["headers"]).json()
    assert [s["name"] for s in body["items"]] == ["Fridge", "garage", "House stuff"]


def test_a_new_account_has_no_spaces(client, user_a):
    assert client.get("/api/inventory/spaces", headers=user_a["headers"]).json()["items"] == []


def test_rename_a_space_and_refuse_a_clash(client, user_a):
    fridge = _space(client, user_a, "Fridge")
    _space(client, user_a, "Garage")
    renamed = client.patch(
        f"/api/inventory/spaces/{fridge['id']}", json={"name": "Kitchen"}, headers=user_a["headers"]
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Kitchen"
    clash = client.patch(
        f"/api/inventory/spaces/{fridge['id']}", json={"name": "GARAGE"}, headers=user_a["headers"]
    )
    assert clash.status_code == 409


def test_delete_an_empty_space_but_not_one_with_items(client, user_a):
    empty = _space(client, user_a, "Attic")
    fridge = _space(client, user_a, "Fridge")
    _item(client, user_a, space_id=fridge["id"])

    assert (
        client.delete(f"/api/inventory/spaces/{empty['id']}", headers=user_a["headers"]).status_code
        == 204
    )
    blocked = client.delete(f"/api/inventory/spaces/{fridge['id']}", headers=user_a["headers"])
    assert blocked.status_code == 409
    assert "still has items" in blocked.json()["detail"]


# ------------------------------------------------------------------ Story 11.2


def test_an_item_can_be_created_into_a_space_by_name(client, user_a):
    created = _item(client, user_a, space_name="Fridge", cost="3.50", restock_below=1)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["quantity"] == 2
    assert body["cost"] == "3.50"
    assert body["needs_restock"] is False
    spaces = client.get("/api/inventory/spaces", headers=user_a["headers"]).json()["items"]
    assert [s["name"] for s in spaces] == ["Fridge"]
    assert body["space_id"] == spaces[0]["id"]


def test_both_or_neither_space_field_is_rejected(client, user_a):
    fridge = _space(client, user_a, "Fridge")
    assert _item(client, user_a).status_code == 422
    assert _item(client, user_a, space_id=fridge["id"], space_name="Fridge").status_code == 422


def test_needs_restock_is_the_threshold_predicate(client, user_a):
    fridge = _space(client, user_a, "Fridge")
    headers = user_a["headers"]

    at = _item(
        client, user_a, name="Eggs", quantity=1, restock_below=1, space_id=fridge["id"]
    ).json()
    above = _item(
        client, user_a, name="Butter", quantity=3, restock_below=1, space_id=fridge["id"]
    ).json()
    no_threshold = _item(
        client, user_a, name="Spare tyre", quantity=0, space_id=fridge["id"]
    ).json()

    assert at["needs_restock"] is True  # <= is the rule, so "at" counts
    assert above["needs_restock"] is False
    # AD-30: no threshold, no nag — a zero is a fact, not a task.
    assert no_threshold["needs_restock"] is False

    low = client.get("/api/inventory/items?needs_restock=true", headers=headers).json()["items"]
    assert [i["name"] for i in low] == ["Eggs"]
    fine = client.get("/api/inventory/items?needs_restock=false", headers=headers).json()["items"]
    assert [i["name"] for i in fine] == ["Butter", "Spare tyre"]


def test_the_predicate_clears_itself_when_the_quantity_changes(client, user_a):
    item = _item(client, user_a, quantity=0, restock_below=1, space_name="Fridge").json()
    assert item["needs_restock"] is True
    restocked = client.patch(
        f"/api/inventory/items/{item['id']}", json={"quantity": 4}, headers=user_a["headers"]
    ).json()
    assert restocked["needs_restock"] is False
    assert restocked["restocked_at"] is not None


def test_filters_and_ordering(client, user_a):
    fridge = _space(client, user_a, "Fridge")
    garage = _space(client, user_a, "Garage")
    _item(client, user_a, name="milk", space_id=fridge["id"])
    _item(client, user_a, name="Butter", space_id=fridge["id"])
    _item(client, user_a, name="Oil", space_id=garage["id"])

    everything = client.get("/api/inventory/items", headers=user_a["headers"]).json()["items"]
    assert [i["name"] for i in everything] == ["Butter", "milk", "Oil"]
    in_fridge = client.get(
        f"/api/inventory/items?space_id={fridge['id']}", headers=user_a["headers"]
    ).json()["items"]
    assert [i["name"] for i in in_fridge] == ["Butter", "milk"]


def test_patch_moves_clears_and_sets_absolutely(client, user_a):
    fridge = _space(client, user_a, "Fridge")
    garage = _space(client, user_a, "Garage")
    item = _item(
        client, user_a, space_id=fridge["id"], restock_below=1, cost="3.50", note="blue"
    ).json()
    url = f"/api/inventory/items/{item['id']}"
    headers = user_a["headers"]

    moved = client.patch(url, json={"space_id": garage["id"]}, headers=headers).json()
    assert moved["space_id"] == garage["id"]

    cleared = client.patch(
        url, json={"restock_below": None, "cost": None, "note": None}, headers=headers
    ).json()
    assert cleared["restock_below"] is None
    assert cleared["cost"] is None
    assert cleared["note"] is None

    # Absolute, not a delta: 5 means 5.
    assert client.patch(url, json={"quantity": 5}, headers=headers).json()["quantity"] == 5
    assert client.patch(url, json={"quantity": 5}, headers=headers).json()["quantity"] == 5
    assert client.patch(url, json={"quantity": -1}, headers=headers).status_code == 422


def test_the_database_refuses_a_negative_quantity_itself(client, user_a, runtime_connection):
    item = _item(client, user_a, space_name="Fridge").json()
    conn = runtime_connection(user_a["id"])
    try:
        with pytest.raises(IntegrityError):
            conn.execute(
                text("UPDATE inventory_items SET quantity = -1 WHERE id = :id"), {"id": item["id"]}
            )
    finally:
        conn.close()


def test_delete_an_item(client, user_a):
    item = _item(client, user_a, space_name="Fridge").json()
    assert (
        client.delete(f"/api/inventory/items/{item['id']}", headers=user_a["headers"]).status_code
        == 204
    )
    assert client.get("/api/inventory/items", headers=user_a["headers"]).json()["items"] == []


def test_unknown_ids_are_404(client, user_a):
    headers = user_a["headers"]
    missing = "00000000-0000-0000-0000-000000000000"
    assert (
        client.patch(
            f"/api/inventory/items/{missing}", json={"quantity": 1}, headers=headers
        ).status_code
        == 404
    )
    assert client.delete(f"/api/inventory/items/{missing}", headers=headers).status_code == 404
    assert client.get(f"/api/inventory/items/{missing}/history", headers=headers).status_code == 404
    assert (
        client.patch(
            f"/api/inventory/spaces/{missing}", json={"name": "x"}, headers=headers
        ).status_code
        == 404
    )
    assert _item(client, user_a, space_id=missing).status_code == 404


# -------------------------------------------------------- Story 11.6: the log


def test_every_quantity_change_is_logged_and_only_quantity_changes(client, user_a):
    item = _item(client, user_a, quantity=2, space_name="Fridge").json()
    url = f"/api/inventory/items/{item['id']}"
    headers = user_a["headers"]
    client.patch(url, json={"quantity": 0}, headers=headers)
    client.patch(url, json={"note": "not a quantity change"}, headers=headers)
    client.patch(url, json={"quantity": 0}, headers=headers)  # unchanged: no row
    client.patch(url, json={"quantity": 6}, headers=headers)

    history = client.get(f"{url}/history", headers=headers).json()["items"]
    assert [(h["quantity_before"], h["quantity_after"]) for h in history] == [
        (0, 2),
        (2, 0),
        (0, 6),
    ]


def test_the_log_is_append_only_for_the_runtime_role(client, user_a, runtime_connection):
    item = _item(client, user_a, space_name="Fridge").json()
    conn = runtime_connection(user_a["id"])
    try:
        for statement in (
            "UPDATE inventory_item_changes SET quantity_after = 99 WHERE item_id = :id",
            "DELETE FROM inventory_item_changes WHERE item_id = :id",
        ):
            with pytest.raises(ProgrammingError):
                conn.execute(text(statement), {"id": item["id"]})
            conn.rollback()
    finally:
        conn.close()


def test_the_log_goes_with_its_item(client, user_a, owner_engine):
    item = _item(client, user_a, space_name="Fridge").json()
    assert (
        client.delete(f"/api/inventory/items/{item['id']}", headers=user_a["headers"]).status_code
        == 204
    )
    with owner_engine.connect() as conn:
        left = conn.execute(
            text("SELECT count(*) FROM inventory_item_changes WHERE item_id = :id"),
            {"id": item["id"]},
        ).scalar_one()
    assert left == 0


def test_restocks_per_space_per_month_are_zero_filled(client, user_a):
    fridge = _space(client, user_a, "Fridge")
    _space(client, user_a, "Garage")  # no items at all: still appears, at zeroes
    item = _item(client, user_a, quantity=0, space_id=fridge["id"]).json()
    url = f"/api/inventory/items/{item['id']}"
    client.patch(url, json={"quantity": 3}, headers=user_a["headers"])  # up: a restock
    client.patch(url, json={"quantity": 1}, headers=user_a["headers"])  # down: not one
    client.patch(url, json={"quantity": 4}, headers=user_a["headers"])  # up

    body = client.get("/api/inventory/restocks?months=3", headers=user_a["headers"]).json()
    assert len(body["months"]) == 3
    by_name = {s["space_name"]: s["values"] for s in body["series"]}
    assert by_name["Fridge"] == [0, 0, 2]
    assert by_name["Garage"] == [0, 0, 0]


def test_restocks_with_no_spaces_still_labels_the_months(client, user_a):
    body = client.get(
        "/api/inventory/restocks?months=2&ending=2026-08", headers=user_a["headers"]
    ).json()
    assert body == {"months": ["2026-07", "2026-08"], "series": []}
