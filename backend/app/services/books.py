"""A personal library: books, their series, and the rules the schema cannot hold (Epic 28).

A module beside the ledger, the inventory, the gym, the habits, the mood and the recipes —
not inside any of them (AD-31). It imports its own models and nothing else, and nothing here
commits (AD-4).

**Status is a stated fact** (AD-46). ``to-read`` / ``reading`` / ``read`` is what the person
said, and the three dates beside it are facts of their own. The one link between them: when
a status *moves* through :func:`update_book` and the date that move implies is empty, the
service fills it with today — because the move is happening now. :func:`create_book` never
fills a date, because a book added as already read is a record of the past, and "today" would
be the one date that is certainly wrong.

**A series is a name owned by its books.** It is created by name with the first book that
names it (insert-or-return, AD-12) and deleted when the last book leaves it — whether by
being deleted, by being moved to another series, or by having its series cleared. Nothing
else creates or deletes one, so a series with no books does not exist, and the list of series
is always the list of things there is at least one book in.
"""

import datetime as dt
import uuid

from sqlalchemy import delete, exists, func, select, text
from sqlalchemy.orm import Session

from app.core import search
from app.core.errors import Invalid, NotFound
from app.models.books import RATING_MAX, RATING_MIN, Book, BookSeries, BookStatus

# Sort keys the list accepts. Each is a full ordering, so a page is stable across reloads:
# ties break on the row id, never on insertion luck.
SORTS = ("added", "title", "author", "rating", "finished")

# The floor the dates must clear. Guarded so a hand-typed year answers 422 rather than an
# absurd row; a book acquired before 1900 is not a thing this library expects to record.
EARLIEST = dt.date(1900, 1, 1)


# ---------------------------------------------------------------- tags


def normalise_tags(raw: str | None) -> str:
    """One comma-separated string, tidied: trimmed, empties dropped, duplicates folded.

    Duplicates are folded case-insensitively and the first spelling wins, so "SciFi, scifi"
    stores as "SciFi". The result is what the row carries and what the search runs over.
    """
    if not raw:
        return ""
    seen: set[str] = set()
    kept: list[str] = []
    for piece in raw.split(","):
        tag = " ".join(piece.split())
        if not tag or tag.lower() in seen:
            continue
        seen.add(tag.lower())
        kept.append(tag)
    return ", ".join(kept)


# ---------------------------------------------------------------- series


def list_series(session: Session, user_id: uuid.UUID) -> list[tuple[BookSeries, int]]:
    """Every series, with how many books are in it. Never zero: an empty series is deleted."""
    count = func.count(Book.id)
    query = (
        select(BookSeries, count)
        .join(Book, (Book.user_id == BookSeries.user_id) & (Book.series_id == BookSeries.id))
        .where(BookSeries.user_id == user_id)
        .group_by(BookSeries.id)
        .order_by(func.lower(BookSeries.name), BookSeries.id)
    )
    return [(series, int(n)) for series, n in session.execute(query)]


def _get_or_create_series(session: Session, user_id: uuid.UUID, name: str) -> BookSeries:
    """AD-12: insert-or-return on ``(user_id, lower(name))``, never check-then-act."""
    inserted = session.execute(
        text(
            """
            INSERT INTO book_series (user_id, name)
            VALUES (:uid, :name)
            ON CONFLICT (user_id, lower(name)) DO NOTHING
            RETURNING id
            """
        ),
        {"uid": str(user_id), "name": name},
    ).scalar_one_or_none()

    if inserted is None:
        existing = session.execute(
            select(BookSeries).where(
                BookSeries.user_id == user_id, func.lower(BookSeries.name) == name.lower()
            )
        ).scalar_one_or_none()
        if existing is None:  # pragma: no cover — would mean the unique index disagrees
            raise NotFound("Series could not be created or found", "series_unwritable")
        return existing

    session.expire_all()
    series = session.get(BookSeries, inserted)
    if series is None:  # pragma: no cover
        raise NotFound("Series was inserted but is not readable", "series_unreadable")
    return series


def _prune_series(session: Session, user_id: uuid.UUID, series_id: uuid.UUID | None) -> None:
    """Delete the series if no book references it any more. Called after every move away."""
    if series_id is None:
        return
    still_used = select(exists().where(Book.user_id == user_id, Book.series_id == series_id))
    if session.execute(still_used).scalar_one():
        return
    session.execute(
        delete(BookSeries).where(BookSeries.user_id == user_id, BookSeries.id == series_id)
    )


def _clean_series_name(name: str | None) -> str | None:
    if name is None:
        return None
    cleaned = " ".join(name.split())
    return cleaned or None


# ---------------------------------------------------------------- rules


def _guard(book: Book, today: dt.date) -> None:
    """The rules the schema cannot hold, plus the cross-column ones restated for a sentence.

    The schema refuses ``started_on > finished_on`` and a page beyond the count too, but an
    IntegrityError is a 500 and says nothing; the same rule here answers 422 with a code.
    """
    for label, value in (
        ("added_on", book.added_on),
        ("started_on", book.started_on),
        ("finished_on", book.finished_on),
    ):
        if value is None:
            continue
        if value > today:
            raise Invalid(f"{label} has not happened yet", "book_date_future")
        if value < EARLIEST:
            raise Invalid(f"{label} is before {EARLIEST.isoformat()}", "book_date_too_early")
    if book.started_on and book.finished_on and book.started_on > book.finished_on:
        raise Invalid("finished before it was started", "book_dates_out_of_order")
    # The next three are pydantic's job on the wire (ge/le on the schema); held here too for
    # a caller that is not a request, so they have no client message.
    if book.rating is not None and not RATING_MIN <= book.rating <= RATING_MAX:  # pragma: no cover
        raise Invalid(f"a rating is {RATING_MIN} to {RATING_MAX}", "book_rating_out_of_range")
    if book.page_count is not None and book.page_count <= 0:  # pragma: no cover
        raise Invalid("a page count is positive", "book_page_count_not_positive")
    if book.current_page is not None:
        if book.page_count is None:
            raise Invalid("a current page needs a page count", "book_page_without_count")
        if book.current_page < 0 or book.current_page > book.page_count:
            raise Invalid("the current page is past the last one", "book_page_beyond_count")
    if book.series_order is not None:
        if book.series_id is None:
            raise Invalid("a place in a series needs a series", "book_series_order_without_series")
        if book.series_order <= 0:  # pragma: no cover
            raise Invalid("a place in a series is 1 or more", "book_series_order_not_positive")


# ---------------------------------------------------------------- books


def _book_query(user_id: uuid.UUID):
    return select(Book).where(Book.user_id == user_id)


def list_books(
    session: Session,
    user_id: uuid.UUID,
    *,
    q: str | None = None,
    status: BookStatus | None = None,
    series_id: uuid.UUID | None = None,
    sort: str = "added",
) -> list[Book]:
    if sort not in SORTS:
        raise Invalid(f"sort is one of {', '.join(SORTS)}", "book_sort_unknown")
    query = _book_query(user_id)
    if q:
        like = search.pattern(q)
        # The series name is searchable too: "Discworld" should find the books, not the
        # series row. An outer join, because a book with no series still matches on title.
        in_series = select(BookSeries.id).where(
            BookSeries.user_id == user_id, BookSeries.name.ilike(like, escape=search.ESCAPE)
        )
        query = query.where(
            Book.title.ilike(like, escape=search.ESCAPE)
            | Book.author.ilike(like, escape=search.ESCAPE)
            | Book.tags.ilike(like, escape=search.ESCAPE)
            | Book.series_id.in_(in_series)
        )
    if status is not None:
        query = query.where(Book.status == status.value)
    if series_id is not None:
        query = query.where(Book.series_id == series_id)

    if sort == "title":
        query = query.order_by(func.lower(Book.title), Book.id)
    elif sort == "author":
        query = query.order_by(
            func.lower(Book.author), Book.series_order.nulls_last(), func.lower(Book.title), Book.id
        )
    elif sort == "rating":
        query = query.order_by(Book.rating.desc().nulls_last(), func.lower(Book.title), Book.id)
    elif sort == "finished":
        query = query.order_by(
            Book.finished_on.desc().nulls_last(), func.lower(Book.title), Book.id
        )
    else:
        query = query.order_by(Book.added_on.desc(), Book.created_at.desc(), Book.id)
    return list(session.execute(query).scalars())


def get_book(session: Session, user_id: uuid.UUID, book_id: uuid.UUID) -> Book:
    book = session.execute(_book_query(user_id).where(Book.id == book_id)).scalar_one_or_none()
    if book is None:
        raise NotFound("No book with that id")
    return book


def series_name_of(session: Session, user_id: uuid.UUID, series_id: uuid.UUID | None) -> str | None:
    if series_id is None:
        return None
    return session.execute(
        select(BookSeries.name).where(BookSeries.user_id == user_id, BookSeries.id == series_id)
    ).scalar_one_or_none()


def create_book(
    session: Session,
    user_id: uuid.UUID,
    *,
    title: str,
    author: str,
    series_name: str | None = None,
    series_order: int | None = None,
    status: BookStatus = BookStatus.to_read,
    rating: int | None = None,
    page_count: int | None = None,
    current_page: int | None = None,
    tags: str | None = None,
    note: str | None = None,
    added_on: dt.date | None = None,
    started_on: dt.date | None = None,
    finished_on: dt.date | None = None,
    today: dt.date | None = None,
) -> Book:
    """A new book. No date is filled in: what was typed is what is stored."""
    today = today or dt.date.today()
    name = _clean_series_name(series_name)
    series = _get_or_create_series(session, user_id, name) if name else None
    book = Book(
        user_id=user_id,
        title=title.strip(),
        author=author.strip(),
        series_id=series.id if series else None,
        series_order=series_order,
        status=status.value,
        rating=rating,
        page_count=page_count,
        current_page=current_page,
        tags=normalise_tags(tags),
        note=note,
        added_on=added_on or today,
        started_on=started_on,
        finished_on=finished_on,
    )
    _guard(book, today)
    session.add(book)
    session.flush()
    session.refresh(book)
    return book


# The keys `update_book` accepts. `series_name` is the wire's name for the series; the row
# holds an id, and the swap happens here.
_UPDATABLE = frozenset(
    {
        "title",
        "author",
        "series_name",
        "series_order",
        "status",
        "rating",
        "page_count",
        "current_page",
        "tags",
        "note",
        "added_on",
        "started_on",
        "finished_on",
    }
)


def update_book(
    session: Session,
    user_id: uuid.UUID,
    book_id: uuid.UUID,
    fields: dict,
    *,
    today: dt.date | None = None,
) -> Book:
    """Write only the keys present. A status that moves fills the date it implies (AD-46).

    ``reading`` fills ``started_on`` and ``read`` fills ``finished_on`` — each only when
    that date is empty *after* the request's own values are applied, so sending the status
    and the date together stores the date that was sent. Moving back to ``to-read`` clears
    nothing: the dates are facts about the past, and the person can clear them by hand.
    """
    today = today or dt.date.today()
    book = get_book(session, user_id, book_id)
    unknown = set(fields) - _UPDATABLE
    if unknown:  # pragma: no cover — the schema does not admit other keys
        raise Invalid(f"cannot update {', '.join(sorted(unknown))}", "book_field_unknown")

    previous_status = book.status
    previous_series = book.series_id

    if "series_name" in fields:
        name = _clean_series_name(fields["series_name"])
        if name is None:
            book.series_id = None
        else:
            book.series_id = _get_or_create_series(session, user_id, name).id
        if book.series_id is None:
            # A cleared series takes its ordinal with it: keeping "3" of nothing would be
            # refused by the schema anyway, and this is what the person meant.
            book.series_order = None
    for key in ("title", "author"):
        if key in fields and fields[key]:
            setattr(book, key, fields[key].strip())
    if "status" in fields:
        book.status = BookStatus(fields["status"]).value
    if "tags" in fields:
        book.tags = normalise_tags(fields["tags"])
    for key in (
        "series_order",
        "rating",
        "page_count",
        "current_page",
        "note",
        "started_on",
        "finished_on",
    ):
        if key in fields:
            setattr(book, key, fields[key])
    # A book always has the day it was added; a null here is a cleared box, not a request
    # to forget it, and the column is NOT NULL either way.
    if fields.get("added_on") is not None:
        book.added_on = fields["added_on"]

    if book.status != previous_status:
        if book.status == BookStatus.reading and book.started_on is None:
            book.started_on = today
        if book.status == BookStatus.read and book.finished_on is None:
            book.finished_on = today

    _guard(book, today)
    book.updated_at = func.now()
    session.flush()
    if previous_series is not None and previous_series != book.series_id:
        _prune_series(session, user_id, previous_series)
    session.refresh(book)
    return book


def delete_book(session: Session, user_id: uuid.UUID, book_id: uuid.UUID) -> None:
    book = get_book(session, user_id, book_id)
    series_id = book.series_id
    session.delete(book)
    session.flush()
    _prune_series(session, user_id, series_id)
