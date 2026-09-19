"""Epic 28 — the library: books, their series, and the status that is a stated fact.

The properties worth pinning: a status *moving* fills the date it implies and a book
*created* never has a date invented for it (AD-46); a series exists exactly as long as one
book names it (AD-12 in, pruning out); every rule the schema cannot hold answers 422 with a
code rather than 500 with an IntegrityError; and a title is user text that ends up in a
spreadsheet cell, so the export neutralises it like a note.
"""

import csv
import datetime as dt
import io

import pytest

from app.services.books import normalise_tags

TODAY = dt.date.today()


def _book(client, user, title="Guards! Guards!", **body):
    return client.post(
        "/api/books",
        json={"title": title, "author": "Terry Pratchett", **body},
        headers=user["headers"],
    )


def _patch(client, user, book_id, **body):
    return client.patch(f"/api/books/{book_id}", json=body, headers=user["headers"])


def _list(client, user, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return client.get(f"/api/books{'?' + query if query else ''}", headers=user["headers"]).json()[
        "items"
    ]


def _series(client, user):
    return [
        (s["name"], s["books"])
        for s in client.get("/api/books/series", headers=user["headers"]).json()["items"]
    ]


# ---------------------------------------------------------------- tags


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, ""),
        ("", ""),
        ("fantasy", "fantasy"),
        ("fantasy,  humour ,, ", "fantasy, humour"),
        ("SciFi, scifi, sci fi", "SciFi, sci fi"),
        ("  two   words , two words", "two words"),
    ],
)
def test_tags_are_one_tidy_comma_separated_string(raw, expected):
    assert normalise_tags(raw) == expected


# ---------------------------------------------------------------- create


def test_a_book_needs_only_a_title_and_an_author(client, user_a):
    response = _book(client, user_a)
    assert response.status_code == 201, response.text
    book = response.json()
    assert book["status"] == "to-read"
    assert book["series_id"] is None and book["series_name"] is None
    assert book["tags"] == ""
    assert book["rating"] is None
    assert book["added_on"] == TODAY.isoformat()
    assert book["started_on"] is None and book["finished_on"] is None


def test_creating_a_book_never_invents_a_date(client, user_a):
    """AD-46: a book added as already read is a record of the past; "today" is wrong."""
    book = _book(client, user_a, status="read", rating=5).json()
    assert book["status"] == "read"
    assert book["finished_on"] is None
    assert book["started_on"] is None

    reading = _book(client, user_a, title="Mort", status="reading").json()
    assert reading["started_on"] is None


def test_typed_dates_are_stored_as_typed(client, user_a):
    book = _book(
        client,
        user_a,
        status="read",
        added_on="2024-01-05",
        started_on="2024-02-01",
        finished_on="2024-02-20",
    ).json()
    assert (book["added_on"], book["started_on"], book["finished_on"]) == (
        "2024-01-05",
        "2024-02-01",
        "2024-02-20",
    )


def test_tags_and_names_are_tidied_on_write(client, user_a):
    book = _book(client, user_a, title="  Mort ", author=" Terry Pratchett ", tags="a, A ,b").json()
    assert book["title"] == "Mort"
    assert book["author"] == "Terry Pratchett"
    assert book["tags"] == "a, b"


# ---------------------------------------------------------------- series


def test_a_series_is_made_by_name_and_reused_case_insensitively(client, user_a):
    first = _book(client, user_a, series_name="Discworld", series_order=8).json()
    second = _book(client, user_a, title="Mort", series_name="  discworld ", series_order=4).json()
    assert first["series_id"] == second["series_id"]
    # The first spelling is the one kept.
    assert second["series_name"] == "Discworld"
    assert _series(client, user_a) == [("Discworld", 2)]


def test_a_series_is_deleted_with_its_last_book(client, user_a):
    first = _book(client, user_a, series_name="Discworld").json()
    second = _book(client, user_a, title="Mort", series_name="Discworld").json()

    assert client.delete(f"/api/books/{first['id']}", headers=user_a["headers"]).status_code == 204
    assert _series(client, user_a) == [("Discworld", 1)]

    assert client.delete(f"/api/books/{second['id']}", headers=user_a["headers"]).status_code == 204
    assert _series(client, user_a) == []


def test_clearing_a_series_drops_the_ordinal_and_prunes_the_series(client, user_a):
    book = _book(client, user_a, series_name="Discworld", series_order=8).json()
    response = _patch(client, user_a, book["id"], series_name=None)
    assert response.status_code == 200, response.text
    assert response.json()["series_id"] is None
    assert response.json()["series_order"] is None
    assert _series(client, user_a) == []


def test_moving_a_book_between_series_prunes_the_one_it_left(client, user_a):
    book = _book(client, user_a, series_name="Discworld", series_order=8).json()
    _book(client, user_a, title="Colour of Magic", series_name="Discworld", series_order=1)
    moved = _patch(client, user_a, book["id"], series_name="The Watch", series_order=1).json()
    assert moved["series_name"] == "The Watch"
    assert _series(client, user_a) == [("Discworld", 1), ("The Watch", 1)]

    # And when the other book follows, the first series is gone.
    others = [b for b in _list(client, user_a) if b["id"] != book["id"]]
    _patch(client, user_a, others[0]["id"], series_name="The Watch", series_order=2)
    assert _series(client, user_a) == [("The Watch", 2)]


def test_a_place_in_a_series_needs_a_series(client, user_a):
    response = _book(client, user_a, series_order=3)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "book_series_order_without_series"


def test_a_blank_series_name_is_no_series(client, user_a):
    book = _book(client, user_a, series_name="   ").json()
    assert book["series_id"] is None
    assert _series(client, user_a) == []


# ---------------------------------------------------------------- transitions


def test_starting_a_book_fills_started_on_with_today(client, user_a):
    book = _book(client, user_a).json()
    moved = _patch(client, user_a, book["id"], status="reading").json()
    assert moved["status"] == "reading"
    assert moved["started_on"] == TODAY.isoformat()
    assert moved["finished_on"] is None


def test_finishing_a_book_fills_finished_on_with_today(client, user_a):
    book = _book(client, user_a, status="reading", started_on="2026-09-01").json()
    moved = _patch(client, user_a, book["id"], status="read").json()
    assert moved["finished_on"] == TODAY.isoformat()
    assert moved["started_on"] == "2026-09-01"


def test_a_date_sent_with_the_transition_wins_over_today(client, user_a):
    book = _book(client, user_a).json()
    moved = _patch(client, user_a, book["id"], status="read", finished_on="2026-09-10").json()
    assert moved["finished_on"] == "2026-09-10"


def test_a_transition_does_not_overwrite_a_date_already_there(client, user_a):
    book = _book(client, user_a, started_on="2026-09-01").json()
    moved = _patch(client, user_a, book["id"], status="reading").json()
    assert moved["started_on"] == "2026-09-01"


def test_moving_back_clears_nothing_and_a_null_clears_by_hand(client, user_a):
    book = _book(client, user_a).json()
    _patch(client, user_a, book["id"], status="read")
    back = _patch(client, user_a, book["id"], status="to-read").json()
    assert back["status"] == "to-read"
    assert back["finished_on"] == TODAY.isoformat()

    cleared = _patch(client, user_a, book["id"], finished_on=None).json()
    assert cleared["finished_on"] is None


def test_setting_the_same_status_again_is_not_a_transition(client, user_a):
    book = _book(client, user_a, status="reading").json()
    assert book["started_on"] is None
    same = _patch(client, user_a, book["id"], status="reading").json()
    assert same["started_on"] is None


# ---------------------------------------------------------------- the rules the schema cannot hold


@pytest.mark.parametrize("field", ["added_on", "started_on", "finished_on"])
def test_a_date_in_the_future_is_refused_with_a_code(client, user_a, field):
    tomorrow = (TODAY + dt.timedelta(days=1)).isoformat()
    response = _book(client, user_a, **{field: tomorrow})
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "book_date_future"


def test_finishing_before_starting_is_refused_with_a_code(client, user_a):
    response = _book(client, user_a, started_on="2026-09-10", finished_on="2026-09-01")
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "book_dates_out_of_order"

    # And on update, where the schema's CHECK would otherwise answer 500.
    book = _book(client, user_a, title="Mort", started_on="2026-09-10").json()
    response = _patch(client, user_a, book["id"], finished_on="2026-09-01")
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "book_dates_out_of_order"


def test_a_current_page_needs_a_page_count_and_cannot_pass_it(client, user_a):
    response = _book(client, user_a, current_page=10)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "book_page_without_count"

    response = _book(client, user_a, page_count=100, current_page=101)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "book_page_beyond_count"

    # Page 0 is "open but not started"; the last page is allowed too.
    assert _book(client, user_a, page_count=100, current_page=0).status_code == 201
    assert _book(client, user_a, title="Mort", page_count=100, current_page=100).status_code == 201


def test_clearing_the_page_count_under_a_current_page_is_refused(client, user_a):
    book = _book(client, user_a, page_count=100, current_page=10).json()
    response = _patch(client, user_a, book["id"], page_count=None)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "book_page_without_count"


def test_a_null_added_on_is_a_cleared_box_not_a_request_to_forget(client, user_a):
    """The column is NOT NULL; nulling it would be a 500 for a box left empty."""
    book = _book(client, user_a, added_on="2026-09-01").json()
    response = _patch(client, user_a, book["id"], added_on=None, rating=3)
    assert response.status_code == 200, response.text
    assert response.json()["added_on"] == "2026-09-01"
    assert response.json()["rating"] == 3


def test_a_rating_outside_one_to_five_is_a_validation_error(client, user_a):
    for rating in (0, 6):
        response = _book(client, user_a, rating=rating)
        assert response.status_code == 422, response.text
        assert response.json()["code"] == "validation"


def test_an_unknown_book_is_a_404(client, user_a):
    missing = "00000000-0000-0000-0000-000000000000"
    assert client.get(f"/api/books/{missing}", headers=user_a["headers"]).status_code == 404
    assert _patch(client, user_a, missing, rating=3).status_code == 404
    assert client.delete(f"/api/books/{missing}", headers=user_a["headers"]).status_code == 404


# ---------------------------------------------------------------- the list


def _shelf(client, user):
    _book(client, user, title="Guards! Guards!", series_name="Discworld", series_order=8, rating=5)
    _book(client, user, title="Mort", series_name="Discworld", series_order=4, status="read")
    _book(
        client,
        user,
        title="Dune",
        author="Frank Herbert",
        tags="scifi, desert",
        status="reading",
        rating=4,
    )
    _book(client, user, title="Emma", author="Jane Austen", added_on="2020-01-01")


def test_the_search_covers_title_author_tags_and_series_name(client, user_a):
    _shelf(client, user_a)
    assert {b["title"] for b in _list(client, user_a, q="guards")} == {"Guards! Guards!"}
    assert {b["title"] for b in _list(client, user_a, q="herbert")} == {"Dune"}
    assert {b["title"] for b in _list(client, user_a, q="desert")} == {"Dune"}
    assert {b["title"] for b in _list(client, user_a, q="discworld")} == {"Guards! Guards!", "Mort"}
    # A wildcard in the phrase is a character, not a wildcard.
    assert _list(client, user_a, q="%") == []


def test_the_list_filters_by_status_and_by_series(client, user_a):
    _shelf(client, user_a)
    assert {b["title"] for b in _list(client, user_a, status="reading")} == {"Dune"}
    assert {b["title"] for b in _list(client, user_a, status="to-read")} == {
        "Guards! Guards!",
        "Emma",
    }
    series = client.get("/api/books/series", headers=user_a["headers"]).json()["items"][0]
    assert {b["title"] for b in _list(client, user_a, series_id=series["id"])} == {
        "Guards! Guards!",
        "Mort",
    }


def test_every_sort_is_a_full_ordering(client, user_a):
    _shelf(client, user_a)
    titles = lambda **p: [b["title"] for b in _list(client, user_a, **p)]  # noqa: E731
    assert titles(sort="title") == ["Dune", "Emma", "Guards! Guards!", "Mort"]
    # By author, then by place in the series, then by title.
    assert titles(sort="author") == ["Dune", "Emma", "Mort", "Guards! Guards!"]
    # Best first; unrated last, not first.
    assert titles(sort="rating") == ["Guards! Guards!", "Dune", "Emma", "Mort"]
    # Newest addition first; the one dated 2020 comes last.
    assert titles()[-1] == "Emma"
    assert titles(sort="added")[-1] == "Emma"


def test_an_unknown_sort_is_refused(client, user_a):
    response = client.get("/api/books?sort=colour", headers=user_a["headers"])
    assert response.status_code == 422


def test_every_row_carries_its_series_name(client, user_a):
    _shelf(client, user_a)
    by_title = {b["title"]: b for b in _list(client, user_a)}
    assert by_title["Mort"]["series_name"] == "Discworld"
    assert by_title["Mort"]["series_order"] == 4
    assert by_title["Dune"]["series_name"] is None


# ---------------------------------------------------------------- export


def test_the_library_exports_one_row_per_book(client, user_a):
    _book(
        client,
        user_a,
        series_name="Discworld",
        series_order=8,
        status="read",
        rating=5,
        page_count=300,
        current_page=300,
        tags="fantasy, watch",
        added_on="2026-09-01",
        started_on="2026-09-02",
        finished_on="2026-09-12",
        note="Vimes.",
    )
    _book(client, user_a, title="Dune", author="Frank Herbert")

    response = client.get("/api/export/books.csv", headers=user_a["headers"])
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    rows = list(csv.reader(io.StringIO(response.text)))
    assert rows[0] == [
        "title",
        "author",
        "series",
        "series_order",
        "status",
        "rating_1_to_5",
        "page_count",
        "current_page",
        "tags",
        "added_on",
        "started_on",
        "finished_on",
        "note",
    ]
    assert rows[1] == [
        "Dune",
        "Frank Herbert",
        "",
        "",
        "to-read",
        "",
        "",
        "",
        "",
        TODAY.isoformat(),
        "",
        "",
        "",
    ]
    assert rows[2] == [
        "Guards! Guards!",
        "Terry Pratchett",
        "Discworld",
        "8",
        "read",
        "5",
        "300",
        "300",
        "fantasy, watch",
        "2026-09-01",
        "2026-09-02",
        "2026-09-12",
        "Vimes.",
    ]


def test_a_title_cannot_smuggle_a_formula_into_a_spreadsheet(client, user_a):
    _book(client, user_a, title='=HYPERLINK("http://evil","click")', tags="+1", note="@x")
    rows = list(
        csv.reader(io.StringIO(client.get("/api/export/books.csv", headers=user_a["headers"]).text))
    )
    assert rows[1][0] == '\'=HYPERLINK("http://evil","click")'
    assert rows[1][8] == "'+1"
    assert rows[1][12] == "'@x"
