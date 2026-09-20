"""Story 28.1 — the second-user proof extended to the library (AD-24, AR-5).

Same shape as the ledger, savings, inventory, gym, habits, mood and recipe proofs: run as the
**runtime role** with B's tenancy and assert zero rows of A's on read and refusal on write.

The one thing specific to this module is the series. A series is addressed by *name* and
found-or-made on the first book that names it (AD-12) — so the proof has to show that A's
"Discworld" and B's "Discworld" are two rows, that B naming it neither finds nor blocks on
A's, and that B cannot point a book at A's series by id even with B's own ``user_id`` on the
row: the composite foreign key of AD-18 is what refuses that, not the policy.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, ProgrammingError


def _book(client, user, title="Guards! Guards!", **body):
    response = client.post(
        "/api/books",
        json={"title": title, "author": "Terry Pratchett", **body},
        headers=user["headers"],
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_b_sees_none_of_a_rows(client, user_a, user_b, runtime_connection):
    _book(client, user_a, series_name="Discworld", series_order=8, tags="fantasy")

    conn = runtime_connection(user_b["id"])
    try:
        assert conn.execute(text("SELECT count(*) FROM books")).scalar_one() == 0
        assert conn.execute(text("SELECT count(*) FROM book_series")).scalar_one() == 0
    finally:
        conn.close()

    headers = user_b["headers"]
    assert client.get("/api/books", headers=headers).json()["items"] == []
    assert client.get("/api/books/series", headers=headers).json()["items"] == []
    # The search runs over A's tags and series name too; none of it reaches B.
    assert client.get("/api/books?q=Discworld", headers=headers).json()["items"] == []
    assert client.get("/api/books?q=fantasy", headers=headers).json()["items"] == []


def test_b_cannot_read_update_or_delete_a_book_of_as_by_id(client, user_a, user_b):
    """AD-8: another user's row is a 404, never a 403 that confirms it exists."""
    book = _book(client, user_a)
    headers = user_b["headers"]
    assert client.get(f"/api/books/{book['id']}", headers=headers).status_code == 404
    assert (
        client.patch(f"/api/books/{book['id']}", json={"rating": 1}, headers=headers).status_code
        == 404
    )
    assert client.delete(f"/api/books/{book['id']}", headers=headers).status_code == 404
    # And A's row is untouched by the attempts.
    assert (
        client.get(f"/api/books/{book['id']}", headers=user_a["headers"]).json()["rating"] is None
    )


def test_b_cannot_write_rows_owned_by_a(client, user_a, user_b, runtime_connection):
    _book(client, user_a, series_name="Discworld")

    conn = runtime_connection(user_b["id"])
    try:
        assert conn.execute(text("UPDATE books SET rating = 1")).rowcount == 0
        assert conn.execute(text("DELETE FROM books")).rowcount == 0
        assert conn.execute(text("UPDATE book_series SET name = 'x'")).rowcount == 0
        assert conn.execute(text("DELETE FROM book_series")).rowcount == 0
    finally:
        conn.close()

    rows = client.get("/api/books", headers=user_a["headers"]).json()["items"]
    assert len(rows) == 1
    assert rows[0]["series_name"] == "Discworld"


def test_b_cannot_smuggle_a_row_in_under_as_user_id(client, user_a, user_b, runtime_connection):
    """The WITH CHECK half of the policy, on both tables."""
    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises((ProgrammingError, IntegrityError)):
            conn.execute(
                text("INSERT INTO books (user_id, title, author) VALUES (:uid, 't', 'a')"),
                {"uid": str(user_a["id"])},
            )
    finally:
        conn.rollback()
    try:
        with pytest.raises((ProgrammingError, IntegrityError)):
            conn.execute(
                text("INSERT INTO book_series (user_id, name) VALUES (:uid, 's')"),
                {"uid": str(user_a["id"])},
            )
    finally:
        conn.rollback()
        conn.close()


def test_the_same_series_name_is_two_rows_for_two_people(client, user_a, user_b):
    """AD-12's insert-or-return is keyed on ``(user_id, lower(name))``, not on the name.

    Made to fail on purpose by dropping ``user_id`` from the index: B's first Discworld book
    was refused with a 500 for a series B could not see — a broken feature and an oracle
    that somebody else reads Pratchett.
    """
    a_book = _book(client, user_a, series_name="Discworld")
    b_book = _book(client, user_b, series_name="discworld")
    assert a_book["series_id"] != b_book["series_id"]

    a_series = client.get("/api/books/series", headers=user_a["headers"]).json()["items"]
    b_series = client.get("/api/books/series", headers=user_b["headers"]).json()["items"]
    assert [(s["name"], s["books"]) for s in a_series] == [("Discworld", 1)]
    assert [(s["name"], s["books"]) for s in b_series] == [("discworld", 1)]


def test_b_cannot_point_a_book_at_as_series_by_id(client, user_a, user_b, runtime_connection):
    """AD-18, executed.

    B stamps the row with B's own ``user_id`` — so the RLS policy is perfectly happy with
    it — and points ``series_id`` at A's series. The **composite** foreign key is what
    refuses it: ``(B, A's series)`` is not a row in ``book_series``.

    Made to fail on purpose by reducing the key to ``FOREIGN KEY (series_id)``: the insert
    succeeded, and A could never lose that series again with no visible reason why.
    """
    a_book = _book(client, user_a, series_name="Discworld")

    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises((ProgrammingError, IntegrityError)):
            conn.execute(
                text(
                    "INSERT INTO books (user_id, title, author, series_id) "
                    "VALUES (:uid, 'Mort', 'Terry Pratchett', :series)"
                ),
                {"uid": str(user_b["id"]), "series": a_book["series_id"]},
            )
    finally:
        conn.rollback()
        conn.close()


def test_an_unset_tenant_sees_nothing(client, user_a, runtime_connection):
    """AD-3: a connection with no ``app.user_id`` matches no row rather than every row."""
    _book(client, user_a, series_name="Discworld")
    conn = runtime_connection(None)
    try:
        assert conn.execute(text("SELECT count(*) FROM books")).scalar_one() == 0
        assert conn.execute(text("SELECT count(*) FROM book_series")).scalar_one() == 0
    finally:
        conn.close()


def test_one_accounts_library_never_reaches_anothers_export(client, user_a, user_b):
    _book(client, user_a, note="A's private thought about this one")
    body = client.get("/api/export/books.csv", headers=user_b["headers"]).text
    assert "private thought" not in body
    assert body.strip().splitlines() == [
        "title,author,series,series_order,status,rating_1_to_5,page_count,current_page,"
        "tags,added_on,started_on,finished_on,note"
    ]
