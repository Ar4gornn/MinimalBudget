import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.core.deps import CurrentUserId, DbSession
from app.models.books import Book, BookStatus
from app.schemas.books import BookCreate, BookOut, BookSeriesOut, BookUpdate
from app.schemas.common import Page
from app.services import books

router = APIRouter(prefix="/api/books", tags=["books"])


def _out(book: Book, names: dict[uuid.UUID, str]) -> BookOut:
    return BookOut(
        id=book.id,
        title=book.title,
        author=book.author,
        series_id=book.series_id,
        series_name=names.get(book.series_id) if book.series_id else None,
        series_order=book.series_order,
        status=BookStatus(book.status),
        rating=book.rating,
        page_count=book.page_count,
        current_page=book.current_page,
        tags=book.tags,
        note=book.note,
        added_on=book.added_on,
        started_on=book.started_on,
        finished_on=book.finished_on,
        created_at=book.created_at,
        updated_at=book.updated_at,
    )


def _one(session, user_id: uuid.UUID, book: Book) -> BookOut:
    name = books.series_name_of(session, user_id, book.series_id)
    return _out(book, {book.series_id: name} if book.series_id and name else {})


# `/series` is declared before the `/{book_id}` shape so nothing tries to parse the word as
# a uuid — the same ordering habits uses for `/progress` and mood for `/history`.


@router.get("/series", response_model=Page[BookSeriesOut])
def list_series(user_id: CurrentUserId, session: DbSession) -> Page[BookSeriesOut]:
    """Every series with at least one book in it. There is no other kind (AD-46)."""
    rows = books.list_series(session, user_id)
    return Page[BookSeriesOut](
        items=[BookSeriesOut(id=series.id, name=series.name, books=n) for series, n in rows]
    )


@router.get("", response_model=Page[BookOut])
def list_books(
    user_id: CurrentUserId,
    session: DbSession,
    q: Annotated[str | None, Query(max_length=200)] = None,
    book_status: Annotated[BookStatus | None, Query(alias="status")] = None,
    series_id: uuid.UUID | None = None,
    sort: Annotated[str, Query(pattern="^(added|title|author|rating|finished)$")] = "added",
) -> Page[BookOut]:
    """The library, filtered and ordered server-side so the definition lives once.

    ``q`` matches the title, the author, the tags and the series name. The series names come
    back on every row rather than as a second list: "Discworld 3" is one line, and the page
    should not have to join it.
    """
    rows = books.list_books(
        session, user_id, q=q, status=book_status, series_id=series_id, sort=sort
    )
    names = {series.id: series.name for series, _ in books.list_series(session, user_id)}
    return Page[BookOut](items=[_out(book, names) for book in rows])


@router.post("", response_model=BookOut, status_code=status.HTTP_201_CREATED)
def create_book(payload: BookCreate, user_id: CurrentUserId, session: DbSession) -> BookOut:
    book = books.create_book(
        session,
        user_id,
        title=payload.title,
        author=payload.author,
        series_name=payload.series_name,
        series_order=payload.series_order,
        status=payload.status,
        rating=payload.rating,
        page_count=payload.page_count,
        current_page=payload.current_page,
        tags=payload.tags,
        note=payload.note,
        added_on=payload.added_on,
        started_on=payload.started_on,
        finished_on=payload.finished_on,
    )
    return _one(session, user_id, book)


@router.get("/{book_id}", response_model=BookOut)
def read_book(book_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> BookOut:
    return _one(session, user_id, books.get_book(session, user_id, book_id))


@router.patch("/{book_id}", response_model=BookOut)
def update_book(
    book_id: uuid.UUID, payload: BookUpdate, user_id: CurrentUserId, session: DbSession
) -> BookOut:
    """Only the keys sent are written — `null` clears, absent leaves alone."""
    fields = {key: getattr(payload, key) for key in payload.model_fields_set}
    return _one(session, user_id, books.update_book(session, user_id, book_id, fields))


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_book(book_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    books.delete_book(session, user_id, book_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
