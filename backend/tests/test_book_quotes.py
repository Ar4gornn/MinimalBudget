"""Epic 31 — quotes kept under a book, and one drawn at random for the dashboard.

The properties worth pinning: a book carries its quotes in the order they were added, so
the shelf needs no second request; the eleventh is refused with a code, and the refusal
holds under two concurrent adds because the count runs under a lock on the book row; a
deleted book takes its quotes with it (the composite key of AD-18 cascades); and the draw
is the server's — the one on screen comes back only when it is the only one, so "Next"
on a single quote is not an empty card. Plus the second-user proof (AD-24), extended to
the new table.
"""

import threading

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, ProgrammingError

from app.models.books import QUOTES_PER_BOOK


def _book(client, user, title="Guards! Guards!", **body):
    response = client.post(
        "/api/books",
        json={"title": title, "author": "Terry Pratchett", **body},
        headers=user["headers"],
    )
    assert response.status_code == 201, response.text
    return response.json()


def _quote(client, user, book_id, text="Let there be light.", **body):
    return client.post(
        f"/api/books/{book_id}/quotes", json={"text": text, **body}, headers=user["headers"]
    )


def _read(client, user, book_id):
    response = client.get(f"/api/books/{book_id}", headers=user["headers"])
    assert response.status_code == 200, response.text
    return response.json()


def _draw(client, user, exclude=None):
    suffix = f"?exclude={exclude}" if exclude else ""
    response = client.get(f"/api/books/quotes/draw{suffix}", headers=user["headers"])
    assert response.status_code == 200, response.text
    return response.json()


# ---------------------------------------------------------------- add, edit, remove


def test_a_quote_needs_only_its_words(client, user_a):
    book = _book(client, user_a)
    response = _quote(client, user_a, book["id"])
    assert response.status_code == 201, response.text
    quote = response.json()
    assert quote["book_id"] == book["id"]
    assert quote["text"] == "Let there be light."
    assert quote["page"] is None


def test_the_book_carries_its_quotes_in_the_order_they_were_added(client, user_a):
    book = _book(client, user_a)
    assert _read(client, user_a, book["id"])["quotes"] == []
    for n, line in enumerate(["first", "second", "third"], start=1):
        assert _quote(client, user_a, book["id"], text=line, page=n * 10).status_code == 201

    kept = _read(client, user_a, book["id"])["quotes"]
    assert [(q["text"], q["page"]) for q in kept] == [("first", 10), ("second", 20), ("third", 30)]

    # And on the list, per book, without touching the other books' rows.
    other = _book(client, user_a, title="Mort")
    shelf = client.get("/api/books", headers=user_a["headers"]).json()["items"]
    listed = {b["id"]: b["quotes"] for b in shelf}
    assert [q["text"] for q in listed[book["id"]]] == ["first", "second", "third"]
    assert listed[other["id"]] == []


def test_a_quote_is_trimmed_and_blank_is_refused(client, user_a):
    book = _book(client, user_a)
    kept = _quote(client, user_a, book["id"], text="  spaced out  \n").json()
    assert kept["text"] == "spaced out"
    # Pydantic refuses "" on length; the service refuses whitespace, which has length.
    assert _quote(client, user_a, book["id"], text="").status_code == 422
    blank = _quote(client, user_a, book["id"], text="   ")
    assert blank.status_code == 422
    assert blank.json()["code"] == "book_quote_empty"


def test_a_page_is_one_or_more_or_nothing(client, user_a):
    book = _book(client, user_a)
    assert _quote(client, user_a, book["id"], page=0).status_code == 422
    assert _quote(client, user_a, book["id"], page=-3).status_code == 422
    assert _quote(client, user_a, book["id"], page=1).status_code == 201
    # Not checked against the page count: where the line was found is the person's fact.
    counted = _book(client, user_a, title="Mort", page_count=100)
    assert _quote(client, user_a, counted["id"], page=999).status_code == 201


def test_a_quote_can_be_corrected_and_its_page_cleared(client, user_a):
    book = _book(client, user_a)
    quote = _quote(client, user_a, book["id"], text="Let their be light.", page=5).json()
    headers = user_a["headers"]
    path = f"/api/books/{book['id']}/quotes/{quote['id']}"

    fixed = client.patch(path, json={"text": "Let there be light."}, headers=headers)
    assert fixed.status_code == 200, fixed.text
    assert fixed.json()["text"] == "Let there be light."
    assert fixed.json()["page"] == 5, "a key not sent is left alone"

    cleared = client.patch(path, json={"page": None}, headers=headers)
    assert cleared.json()["page"] is None
    assert cleared.json()["text"] == "Let there be light."

    assert client.patch(path, json={"text": "  "}, headers=headers).status_code == 422
    assert client.patch(path, json={"page": 0}, headers=headers).status_code == 422


def test_a_quote_can_be_removed(client, user_a):
    book = _book(client, user_a)
    keep = _quote(client, user_a, book["id"], text="keep").json()
    drop = _quote(client, user_a, book["id"], text="drop").json()
    headers = user_a["headers"]
    response = client.delete(f"/api/books/{book['id']}/quotes/{drop['id']}", headers=headers)
    assert response.status_code == 204
    assert [q["id"] for q in _read(client, user_a, book["id"])["quotes"]] == [keep["id"]]
    # Twice is a 404, not a second success.
    again = client.delete(f"/api/books/{book['id']}/quotes/{drop['id']}", headers=headers)
    assert again.status_code == 404


def test_a_quote_is_addressed_through_its_own_book(client, user_a):
    """The quote id alone is not enough: under the wrong book it is not found."""
    book = _book(client, user_a)
    other = _book(client, user_a, title="Mort")
    quote = _quote(client, user_a, book["id"]).json()
    headers = user_a["headers"]
    wrong = f"/api/books/{other['id']}/quotes/{quote['id']}"
    assert client.patch(wrong, json={"text": "x"}, headers=headers).status_code == 404
    assert client.delete(wrong, headers=headers).status_code == 404
    assert len(_read(client, user_a, book["id"])["quotes"]) == 1


def test_a_quote_cannot_be_added_to_a_book_that_does_not_exist(client, user_a):
    response = _quote(client, user_a, "00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


# ---------------------------------------------------------------- the cap


def test_the_eleventh_quote_is_refused_with_a_code(client, user_a):
    book = _book(client, user_a)
    for n in range(QUOTES_PER_BOOK):
        assert _quote(client, user_a, book["id"], text=f"line {n}").status_code == 201
    refused = _quote(client, user_a, book["id"], text="one too many")
    assert refused.status_code == 409, refused.text
    assert refused.json()["code"] == "book_quotes_full"
    assert len(_read(client, user_a, book["id"])["quotes"]) == QUOTES_PER_BOOK
    # Removing one makes room again; the cap is a count, not a lifetime total.
    first = _read(client, user_a, book["id"])["quotes"][0]
    client.delete(f"/api/books/{book['id']}/quotes/{first['id']}", headers=user_a["headers"])
    assert _quote(client, user_a, book["id"], text="room again").status_code == 201


def test_the_cap_holds_under_concurrent_adds(client, user_a):
    """Two adds racing on the last free slot: exactly one wins.

    Made to fail on purpose by dropping ``with_for_update()`` from the count: both threads
    counted nine and the book ended with eleven.
    """
    book = _book(client, user_a)
    for n in range(QUOTES_PER_BOOK - 1):
        assert _quote(client, user_a, book["id"], text=f"line {n}").status_code == 201

    statuses: list[int] = []
    gate = threading.Barrier(2)

    def add(label: str) -> None:
        gate.wait()
        statuses.append(_quote(client, user_a, book["id"], text=label).status_code)

    threads = [threading.Thread(target=add, args=(f"racer {i}",)) for i in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(statuses) == [201, 409], statuses
    assert len(_read(client, user_a, book["id"])["quotes"]) == QUOTES_PER_BOOK


# ---------------------------------------------------------------- the book owns them


def test_deleting_the_book_takes_its_quotes_with_it(client, user_a, runtime_connection):
    book = _book(client, user_a)
    _quote(client, user_a, book["id"], text="going")
    _quote(client, user_a, book["id"], text="gone")
    survivor = _book(client, user_a, title="Mort")
    _quote(client, user_a, survivor["id"], text="staying")

    assert client.delete(f"/api/books/{book['id']}", headers=user_a["headers"]).status_code == 204

    conn = runtime_connection(user_a["id"])
    try:
        rows = conn.execute(text("SELECT text FROM book_quotes ORDER BY text")).scalars().all()
    finally:
        conn.close()
    assert rows == ["staying"]


# ---------------------------------------------------------------- the draw


def test_no_quotes_draws_nothing(client, user_a):
    _book(client, user_a)
    assert _draw(client, user_a) is None


def test_a_draw_comes_with_its_book(client, user_a):
    book = _book(client, user_a, title="Guards! Guards!")
    quote = _quote(client, user_a, book["id"], text="Let there be light.", page=1).json()
    drawn = _draw(client, user_a)
    assert drawn == {
        "id": quote["id"],
        "book_id": book["id"],
        "text": "Let there be light.",
        "page": 1,
        "title": "Guards! Guards!",
        "author": "Terry Pratchett",
    }


def test_the_draw_reaches_every_quote(client, user_a):
    """Random, not "the first row": thirty draws over three quotes see all three."""
    book = _book(client, user_a)
    ids = {_quote(client, user_a, book["id"], text=f"line {n}").json()["id"] for n in range(3)}
    seen = {_draw(client, user_a)["id"] for _ in range(30)}
    assert seen == ids


def test_next_never_repeats_the_one_on_screen_when_there_is_another(client, user_a):
    book = _book(client, user_a)
    shown = _quote(client, user_a, book["id"], text="shown").json()["id"]
    other = _quote(client, user_a, book["id"], text="other").json()["id"]
    for _ in range(20):
        assert _draw(client, user_a, exclude=shown)["id"] == other


def test_next_on_the_only_quote_shows_it_again_rather_than_nothing(client, user_a):
    book = _book(client, user_a)
    only = _quote(client, user_a, book["id"], text="only").json()["id"]
    assert _draw(client, user_a, exclude=only)["id"] == only


def test_an_exclude_that_is_not_a_uuid_is_a_422(client, user_a):
    response = client.get("/api/books/quotes/draw?exclude=nope", headers=user_a["headers"])
    assert response.status_code == 422


# ---------------------------------------------------------------- the second user


def test_b_sees_none_of_a_quotes(client, user_a, user_b, runtime_connection):
    book = _book(client, user_a)
    _quote(client, user_a, book["id"], text="A's private line")

    conn = runtime_connection(user_b["id"])
    try:
        assert conn.execute(text("SELECT count(*) FROM book_quotes")).scalar_one() == 0
    finally:
        conn.close()
    assert _draw(client, user_b) is None
    assert client.get("/api/books", headers=user_b["headers"]).json()["items"] == []


def test_b_cannot_touch_a_quote_of_as_by_id(client, user_a, user_b):
    """AD-8: another user's row is a 404, never a 403 that confirms it exists."""
    book = _book(client, user_a)
    quote = _quote(client, user_a, book["id"], text="A's line").json()
    headers = user_b["headers"]
    path = f"/api/books/{book['id']}/quotes/{quote['id']}"
    assert _quote(client, user_b, book["id"], text="B's addition").status_code == 404
    assert client.patch(path, json={"text": "defaced"}, headers=headers).status_code == 404
    assert client.delete(path, headers=headers).status_code == 404
    assert [q["text"] for q in _read(client, user_a, book["id"])["quotes"]] == ["A's line"]


def test_b_cannot_write_rows_owned_by_a(client, user_a, user_b, runtime_connection):
    book = _book(client, user_a)
    _quote(client, user_a, book["id"], text="A's line")
    conn = runtime_connection(user_b["id"])
    try:
        assert conn.execute(text("UPDATE book_quotes SET text = 'x'")).rowcount == 0
        assert conn.execute(text("DELETE FROM book_quotes")).rowcount == 0
    finally:
        conn.close()
    assert [q["text"] for q in _read(client, user_a, book["id"])["quotes"]] == ["A's line"]


def test_b_cannot_hang_a_quote_on_as_book(client, user_a, user_b, runtime_connection):
    """AD-18, executed on the new table.

    B stamps the row with B's own ``user_id`` — the policy is content — and points
    ``book_id`` at A's book. The **composite** key refuses it: ``(B, A's book)`` is not a
    row in ``books``. Made to fail on purpose by reducing the key to ``(book_id)``.
    """
    book = _book(client, user_a)
    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises((ProgrammingError, IntegrityError)):
            conn.execute(
                text("INSERT INTO book_quotes (user_id, book_id, text) VALUES (:uid, :bid, 'x')"),
                {"uid": str(user_b["id"]), "bid": book["id"]},
            )
    finally:
        conn.rollback()
        conn.close()


def test_b_cannot_smuggle_a_quote_in_under_as_user_id(client, user_a, user_b, runtime_connection):
    book = _book(client, user_a)
    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises((ProgrammingError, IntegrityError)):
            conn.execute(
                text("INSERT INTO book_quotes (user_id, book_id, text) VALUES (:uid, :bid, 'x')"),
                {"uid": str(user_a["id"]), "bid": book["id"]},
            )
    finally:
        conn.rollback()
        conn.close()


def test_an_unset_tenant_sees_nothing(client, user_a, runtime_connection):
    book = _book(client, user_a)
    _quote(client, user_a, book["id"])
    conn = runtime_connection(None)
    try:
        assert conn.execute(text("SELECT count(*) FROM book_quotes")).scalar_one() == 0
    finally:
        conn.close()
