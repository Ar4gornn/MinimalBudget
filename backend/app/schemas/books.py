"""Wire shapes for the library (Epic 28) and its quotes (Epic 31)."""

import datetime as dt
import uuid

from pydantic import BaseModel, Field

from app.models.books import QUOTE_MAX_LENGTH, RATING_MAX, RATING_MIN, BookStatus


class BookCreate(BaseModel):
    """A new book. The series is named, not identified: the row is found or made by name.

    No date is filled in on create — a book added as already read is a record of the past,
    and "today" would be the one wrong answer. Dates fill on a *transition* (AD-46).
    """

    title: str = Field(min_length=1, max_length=300)
    author: str = Field(min_length=1, max_length=200)
    series_name: str | None = Field(default=None, max_length=200)
    series_order: int | None = Field(default=None, ge=1)
    status: BookStatus = BookStatus.to_read
    rating: int | None = Field(default=None, ge=RATING_MIN, le=RATING_MAX)
    page_count: int | None = Field(default=None, ge=1)
    current_page: int | None = Field(default=None, ge=0)
    tags: str | None = Field(default=None, max_length=500)
    note: str | None = Field(default=None, max_length=5000)
    added_on: dt.date | None = None
    started_on: dt.date | None = None
    finished_on: dt.date | None = None


class BookUpdate(BaseModel):
    """Only the keys present are written; ``null`` clears the ones that can be cleared.

    ``series_name: null`` takes the book out of its series (and drops its ordinal with it).
    A status that moves fills the date it implies when that date is empty after this
    request's own values are applied — see ``services.books.update_book``.
    """

    title: str | None = Field(default=None, min_length=1, max_length=300)
    author: str | None = Field(default=None, min_length=1, max_length=200)
    series_name: str | None = Field(default=None, max_length=200)
    series_order: int | None = Field(default=None, ge=1)
    status: BookStatus | None = None
    rating: int | None = Field(default=None, ge=RATING_MIN, le=RATING_MAX)
    page_count: int | None = Field(default=None, ge=1)
    current_page: int | None = Field(default=None, ge=0)
    tags: str | None = Field(default=None, max_length=500)
    note: str | None = Field(default=None, max_length=5000)
    added_on: dt.date | None = None
    started_on: dt.date | None = None
    finished_on: dt.date | None = None


class BookQuoteCreate(BaseModel):
    """A line kept from the book. The page is where it was found, or nothing."""

    text: str = Field(min_length=1, max_length=QUOTE_MAX_LENGTH)
    page: int | None = Field(default=None, ge=1)


class BookQuoteUpdate(BaseModel):
    """Only the keys present are written; ``page: null`` clears the page."""

    text: str | None = Field(default=None, min_length=1, max_length=QUOTE_MAX_LENGTH)
    page: int | None = Field(default=None, ge=1)


class BookQuoteOut(BaseModel):
    id: uuid.UUID
    book_id: uuid.UUID
    text: str
    page: int | None
    created_at: dt.datetime
    updated_at: dt.datetime


class BookQuoteDrawOut(BaseModel):
    """One quote drawn at random, with enough of its book to be read on its own."""

    id: uuid.UUID
    book_id: uuid.UUID
    text: str
    page: int | None
    title: str
    author: str


class BookOut(BaseModel):
    id: uuid.UUID
    title: str
    author: str
    series_id: uuid.UUID | None
    # Carried beside the id so the list needs no second request to say "Discworld 3".
    series_name: str | None
    series_order: int | None
    status: BookStatus
    rating: int | None
    page_count: int | None
    current_page: int | None
    tags: str
    note: str | None
    added_on: dt.date
    started_on: dt.date | None
    finished_on: dt.date | None
    # Carried on the row, in the order they were added, so the shelf draws them under the
    # book with no second request. Never more than QUOTES_PER_BOOK (AD-47).
    quotes: list[BookQuoteOut]
    created_at: dt.datetime
    updated_at: dt.datetime


class BookSeriesOut(BaseModel):
    """A series and how many books are in it — never zero, an empty one is deleted."""

    id: uuid.UUID
    name: str
    books: int
