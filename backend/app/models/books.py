"""A personal library: books, the series they belong to (Epic 28), and their quotes (Epic 31)."""

import datetime as dt
import enum
import uuid

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedMixin


class BookStatus(enum.StrEnum):
    """Where a book stands. A stated fact, never derived from the dates (AD-46)."""

    to_read = "to-read"
    reading = "reading"
    read = "read"


RATING_MIN = 1
RATING_MAX = 5

# A quote is a line worth keeping, not a chapter: long enough for a paragraph, short enough
# that the shelf can draw every one of them under the book (AD-47).
QUOTE_MAX_LENGTH = 1000
# How many a book can hold. A wall of forty quotes under one row is a notebook, not a shelf,
# and "Next" on the dashboard is only interesting while the pool is curated.
QUOTES_PER_BOOK = 10


class BookSeries(TimestampedMixin, Base):
    """A name owned by its books: created with the first one, gone with the last."""

    __tablename__ = "book_series"
    __table_args__ = (UniqueConstraint("user_id", "id", name="book_series_user_id_id_key"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)


class Book(Base):
    __tablename__ = "books"
    __table_args__ = (
        CheckConstraint("status IN ('to-read', 'reading', 'read')", name="books_status_valid"),
        CheckConstraint("rating IS NULL OR rating BETWEEN 1 AND 5", name="books_rating_1_to_5"),
        CheckConstraint("page_count IS NULL OR page_count > 0", name="books_page_count_positive"),
        CheckConstraint(
            "current_page IS NULL OR (page_count IS NOT NULL "
            "AND current_page >= 0 AND current_page <= page_count)",
            name="books_current_page_within_count",
        ),
        CheckConstraint(
            "series_order IS NULL OR (series_id IS NOT NULL AND series_order > 0)",
            name="books_series_order_needs_series",
        ),
        CheckConstraint(
            "started_on IS NULL OR finished_on IS NULL OR started_on <= finished_on",
            name="books_started_before_finished",
        ),
        # Composite (AD-18); the column-list SET NULL is in the migration (AD-35).
        ForeignKeyConstraint(
            ["user_id", "series_id"],
            ["book_series.user_id", "book_series.id"],
            name="books_series_fkey",
        ),
        # The target of the composite key from book_quotes (AD-18). Added by 0023.
        UniqueConstraint("user_id", "id", name="books_user_id_id_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    author: Mapped[str] = mapped_column(String(200), nullable=False)
    series_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    series_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=BookStatus.to_read.value
    )
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    current_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tags: Mapped[str] = mapped_column(String(500), nullable=False, server_default="")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    added_on: Mapped[dt.date] = mapped_column(
        Date, nullable=False, server_default=text("current_date")
    )
    started_on: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    finished_on: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class BookQuote(Base):
    """A line from a book, kept by the person who read it (Epic 31).

    Owned by its book: the composite key cascades, so deleting the book takes its quotes
    with it and there is no such thing as a quote of nothing. The page is optional and is
    not checked against the book's page count — it is where the person found the line,
    and a count typed later or wrongly should not make the quote a liar.
    """

    __tablename__ = "book_quotes"
    __table_args__ = (
        CheckConstraint("page IS NULL OR page > 0", name="book_quotes_page_positive"),
        CheckConstraint("length(text) > 0", name="book_quotes_text_not_empty"),
        ForeignKeyConstraint(
            ["user_id", "book_id"],
            ["books.user_id", "books.id"],
            name="book_quotes_book_fkey",
            ondelete="CASCADE",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    book_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    # The column is `text` (what the wire calls it); the attribute is not, so the name does
    # not shadow sqlalchemy's `text()` inside this class body.
    body: Mapped[str] = mapped_column("text", String(QUOTE_MAX_LENGTH), nullable=False)
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
