"""Story 32.1 — the second-user proof extended to notes (AD-24, AR-5).

Same shape as the other isolation proofs, plus the one thing notes have that no other table
does: **the id is chosen by the client** (AD-48). So B can name A's id on a write — not
guess it, since a v4 uuid cannot be guessed, but name it if it ever leaked. That write must
neither overwrite A's note nor answer with anything that tells B the id is taken.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, ProgrammingError


def _seed(client, user, **body) -> dict:
    note_id = str(uuid.uuid4())
    response = client.put(
        f"/api/notes/{note_id}",
        json=body or {"kind": "text", "title": "A's secret", "body": "the combination"},
        headers=user["headers"],
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_b_sees_none_of_a_notes(client, user_a, user_b, runtime_connection):
    note = _seed(client, user_a)

    conn = runtime_connection(user_b["id"])
    try:
        assert conn.execute(text("SELECT count(*) FROM notes")).scalar_one() == 0
    finally:
        conn.close()

    headers = user_b["headers"]
    assert client.get("/api/notes", headers=headers).json()["items"] == []
    assert client.get("/api/notes", params={"q": "secret"}, headers=headers).json()["items"] == []
    assert client.get(f"/api/notes/{note['id']}", headers=headers).status_code == 404
    assert client.delete(f"/api/notes/{note['id']}", headers=headers).status_code == 404


def test_b_writing_a_notes_id_is_404_and_changes_nothing(client, user_a, user_b):
    """A PUT under A's id is an insert that clashes with a row B cannot see.

    It answers 404 — the same as every other id that is not yours (AD-8) — rather than a
    500 that would both break and confirm the id exists. Made red by re-raising the
    ``IntegrityError`` in ``put_note`` instead of translating it.
    """
    note = _seed(client, user_a)
    response = client.put(
        f"/api/notes/{note['id']}",
        json={"kind": "text", "body": "overwritten by B"},
        headers=user_b["headers"],
    )
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"

    mine = client.get(f"/api/notes/{note['id']}", headers=user_a["headers"]).json()
    assert mine["body"] == "the combination"


def test_b_cannot_write_a_row_owned_by_a(client, user_a, user_b, runtime_connection):
    _seed(client, user_a)
    conn = runtime_connection(user_b["id"])
    try:
        assert conn.execute(text("UPDATE notes SET body = 'x'")).rowcount == 0
        assert conn.execute(text("DELETE FROM notes")).rowcount == 0
    finally:
        conn.close()
    assert client.get("/api/notes", headers=user_a["headers"]).json()["items"][0]["body"] == (
        "the combination"
    )


def test_b_cannot_smuggle_a_row_in_under_as_user_id(client, user_a, user_b, runtime_connection):
    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises((ProgrammingError, IntegrityError)):
            conn.execute(
                text("INSERT INTO notes (user_id, kind, body) VALUES (:uid, 'text', 'x')"),
                {"uid": str(user_a["id"])},
            )
    finally:
        conn.rollback()
        conn.close()


def test_an_unset_tenant_sees_nothing(client, user_a, runtime_connection):
    _seed(client, user_a)
    conn = runtime_connection(None)
    try:
        assert conn.execute(text("SELECT count(*) FROM notes")).scalar_one() == 0
    finally:
        conn.close()
