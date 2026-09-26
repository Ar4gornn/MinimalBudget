"""Epic 32 — notes: text or a sketch, written by a client-chosen id, pinned, searched.

Mutations that were run to prove these are not decoration are recorded on the tests they
turned red.
"""

import time
import uuid

import pytest


def put(client, user, note_id: str | None = None, *, expect: int | None = None, **body):
    note_id = note_id or str(uuid.uuid4())
    response = client.put(f"/api/notes/{note_id}", json=body, headers=user["headers"])
    if expect is not None:
        assert response.status_code == expect, response.text
    return response


def listed(client, user, **params) -> list[dict]:
    response = client.get("/api/notes", params=params, headers=user["headers"])
    assert response.status_code == 200, response.text
    return response.json()["items"]


SKETCH = {
    "strokes": [{"c": 0, "w": 0, "p": [10, 10, 20, 20, 30, 25]}, {"c": 2, "w": 1, "p": [5, 5]}]
}


# ------------------------------------------------------------------ writing


def test_a_text_note_is_created_by_its_client_id(client, user_a):
    note_id = str(uuid.uuid4())
    body = put(
        client, user_a, note_id, expect=201, kind="text", title="  Milk  ", body="and eggs"
    ).json()
    assert body["id"] == note_id
    assert (body["kind"], body["title"], body["body"], body["sketch"]) == (
        "text",
        "Milk",
        "and eggs",
        None,
    )
    assert body["pinned"] is False

    read = client.get(f"/api/notes/{note_id}", headers=user_a["headers"])
    assert read.status_code == 200
    assert read.json() == body


def test_a_retried_write_lands_on_the_same_row(client, user_a):
    """The offline draft's retry after a lost response: 200, one row, not two (AD-48)."""
    note_id = str(uuid.uuid4())
    put(client, user_a, note_id, expect=201, kind="text", body="once")
    put(client, user_a, note_id, expect=200, kind="text", body="once")
    assert [note["id"] for note in listed(client, user_a)] == [note_id]


def test_a_put_replaces_the_whole_note(client, user_a):
    note_id = str(uuid.uuid4())
    put(client, user_a, note_id, expect=201, kind="text", title="T", body="first")
    body = put(client, user_a, note_id, expect=200, kind="text", body="second").json()
    # The title was absent from the second write, so it is gone: PUT is not PATCH.
    assert (body["title"], body["body"]) == (None, "second")


def test_a_sketch_round_trips_its_strokes(client, user_a):
    body = put(client, user_a, expect=201, kind="sketch", title="Plan", sketch=SKETCH).json()
    assert body["sketch"] == SKETCH
    assert body["body"] is None


def test_an_empty_text_note_is_refused_with_a_code(client, user_a):
    response = put(client, user_a, kind="text", title="   ", body=" \n ")
    assert response.status_code == 422
    assert response.json()["code"] == "note_empty"


def test_a_sketch_without_strokes_is_refused(client, user_a):
    response = put(client, user_a, kind="sketch")
    assert response.status_code == 422
    assert response.json()["code"] == "note_empty"


@pytest.mark.parametrize(
    "body",
    [
        {"kind": "text", "body": "x", "sketch": SKETCH},
        {"kind": "sketch", "body": "x", "sketch": SKETCH},
    ],
)
def test_one_kind_of_content_per_note(client, user_a, body):
    response = put(client, user_a, **body)
    assert response.status_code == 422
    assert response.json()["code"] == "note_kind_mismatch"


def test_a_note_cannot_change_kind(client, user_a):
    note_id = str(uuid.uuid4())
    put(client, user_a, note_id, expect=201, kind="text", body="words")
    response = put(client, user_a, note_id, kind="sketch", sketch=SKETCH)
    assert response.status_code == 422
    assert response.json()["code"] == "note_kind_changed"
    assert client.get(f"/api/notes/{note_id}", headers=user_a["headers"]).json()["body"] == "words"


@pytest.mark.parametrize(
    "stroke",
    [
        {"c": 3, "w": 0, "p": [1, 1]},  # a fourth ink
        {"c": 0, "w": 2, "p": [1, 1]},  # a third nib
        {"c": 0, "w": 0, "p": [1, 1, 2]},  # half a point
        {"c": 0, "w": 0, "p": []},  # no point at all
        {"c": 0, "w": 0, "p": [751, 1]},  # off the canvas to the right
        {"c": 0, "w": 0, "p": [1, 1001]},  # off the bottom
        {"c": 0, "w": 0, "p": [-1, 1]},
    ],
)
def test_a_stroke_off_the_contract_is_422(client, user_a, stroke):
    response = put(client, user_a, kind="sketch", sketch={"strokes": [stroke]})
    assert response.status_code == 422, response.text


def test_a_sketch_has_a_ceiling_on_points(client, user_a):
    # 20 001 points in 21 strokes: one over. Made red by raising MAX_POINTS by one.
    strokes = [{"c": 0, "w": 0, "p": [1, 1] * 1000} for _ in range(20)]
    strokes.append({"c": 0, "w": 0, "p": [1, 1]})
    assert put(client, user_a, kind="sketch", sketch={"strokes": strokes}).status_code == 422
    strokes.pop()
    assert put(client, user_a, kind="sketch", sketch={"strokes": strokes}).status_code == 201


def test_the_title_has_a_length_ceiling(client, user_a):
    assert put(client, user_a, kind="text", title="x" * 201).status_code == 422
    assert put(client, user_a, kind="text", title="x" * 200).status_code == 201


# ------------------------------------------------------------------ order and pins


def test_pinned_first_then_most_recently_changed(client, user_a):
    old = str(uuid.uuid4())
    new = str(uuid.uuid4())
    pinned = str(uuid.uuid4())
    put(client, user_a, old, expect=201, kind="text", body="old")
    time.sleep(0.01)
    put(client, user_a, pinned, expect=201, kind="text", body="pinned", pinned=True)
    time.sleep(0.01)
    put(client, user_a, new, expect=201, kind="text", body="new")
    assert [n["id"] for n in listed(client, user_a)] == [pinned, new, old]

    # Editing the old one moves it above the new one.
    time.sleep(0.01)
    put(client, user_a, old, expect=200, kind="text", body="old, edited")
    assert [n["id"] for n in listed(client, user_a)] == [pinned, old, new]


def test_pinning_is_not_editing(client, user_a):
    """A pin must not bump ``updated_at``, or the list reorders under the thumb.

    Made red by setting ``updated_at`` unconditionally in ``put_note``.
    """
    note_id = str(uuid.uuid4())
    first = put(client, user_a, note_id, expect=201, kind="text", body="same").json()
    time.sleep(0.01)
    pinned = put(client, user_a, note_id, expect=200, kind="text", body="same", pinned=True).json()
    assert pinned["pinned"] is True
    assert pinned["updated_at"] == first["updated_at"]

    time.sleep(0.01)
    edited = put(
        client, user_a, note_id, expect=200, kind="text", body="changed", pinned=True
    ).json()
    assert edited["updated_at"] > first["updated_at"]


# ------------------------------------------------------------------ search


def test_search_matches_title_and_body_case_blind(client, user_a):
    by_title = put(client, user_a, expect=201, kind="text", title="Garden plan").json()["id"]
    by_body = put(client, user_a, expect=201, kind="text", body="buy GARDEN gloves").json()["id"]
    sketch = put(
        client, user_a, expect=201, kind="sketch", title="garden layout", sketch=SKETCH
    ).json()["id"]
    put(client, user_a, expect=201, kind="text", body="unrelated")

    found = {note["id"] for note in listed(client, user_a, q="garden")}
    assert found == {by_title, by_body, sketch}


def test_search_treats_wildcards_as_letters(client, user_a):
    hit = put(client, user_a, expect=201, kind="text", body="50% off").json()["id"]
    put(client, user_a, expect=201, kind="text", body="500 grams")
    assert [note["id"] for note in listed(client, user_a, q="50%")] == [hit]


def test_a_blank_search_is_no_filter(client, user_a):
    put(client, user_a, expect=201, kind="text", body="a")
    put(client, user_a, expect=201, kind="text", body="b")
    assert len(listed(client, user_a, q="   ")) == 2


# ------------------------------------------------------------------ delete


def test_delete_then_a_second_delete_is_404(client, user_a):
    note_id = put(client, user_a, expect=201, kind="text", body="bye").json()["id"]
    first = client.delete(f"/api/notes/{note_id}", headers=user_a["headers"])
    assert first.status_code == 204
    second = client.delete(f"/api/notes/{note_id}", headers=user_a["headers"])
    assert second.status_code == 404
    assert client.get(f"/api/notes/{note_id}", headers=user_a["headers"]).status_code == 404


def test_a_deleted_note_can_be_put_back_under_its_id(client, user_a):
    """The list's undo: the same PUT re-creates the row under the id it had."""
    note_id = str(uuid.uuid4())
    put(client, user_a, note_id, expect=201, kind="text", body="undo me")
    client.delete(f"/api/notes/{note_id}", headers=user_a["headers"])
    put(client, user_a, note_id, expect=201, kind="text", body="undo me")
    assert [n["id"] for n in listed(client, user_a)] == [note_id]
