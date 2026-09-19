"""Books: a personal library, with the series a book belongs to (Epic 28).

The seventh module beside the ledger, the inventory, the gym, the habits, the mood and the
recipes (AD-31). Two tables, both user-scoped, both through :func:`protect`.

**A book's status is a stated fact, not a derivation** (AD-46). ``to-read`` / ``reading`` /
``read`` is a column with a CHECK, the same shape as ``habits.schedule_kind`` — a VARCHAR
rather than an enum type, so a fourth state is one ALTER of a constraint. The three dates
beside it are facts too: the service fills ``started_on`` and ``finished_on`` when the status
first moves, and both stay editable afterwards, because "I finished it in March" is a thing
a person knows better than the day they got round to recording it.

**A series is a name owned by its books.** ``book_series`` has a name and nothing else, and
a row lives exactly as long as one book references it: the service creates it by name on the
first book (insert-or-return, AD-12) and removes it when the last one leaves. There is no
series endpoint to create or delete one. The foreign key is the composite of AD-18, so a book
can only point at a series with the same ``user_id``, and it is the column-list ``SET NULL``
of AD-35: the plain form would null ``user_id`` as well.

**What the schema cannot hold.** ``started_on <= current_date`` is refused by Postgres — a
CHECK may only call IMMUTABLE functions, the wall ``habit_checkins`` and ``mood_days`` both
met — so the not-in-the-future rule lives in ``services/books.py`` with a test. The
cross-column rules it *can* hold, it does: a rating is 1–5 or null, a page count is positive
or null, and a current page needs a page count and cannot pass it.

**Tags are one comma-separated string.** A tag table with a join would be the right shape
for a catalogue; here a tag is a word a person types to find the book again, the service
normalises the list on write, and the search is a substring match. Denormalised on purpose,
and the trade is recorded rather than implied.

Revision ID: 0021
Revises: 0020
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import protect

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)

    op.create_table(
        "book_series",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        # The target of the composite key below (AD-18).
        sa.UniqueConstraint("user_id", "id", name="book_series_user_id_id_key"),
    )
    # Case-insensitive, like exercises and routines: "Discworld" and "discworld" are one series.
    op.execute(
        "CREATE UNIQUE INDEX book_series_user_name_key ON book_series (user_id, lower(name))"
    )
    protect("book_series")

    op.create_table(
        "books",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("author", sa.String(200), nullable=False),
        # NULL is "stands alone". The key is added after the table: it needs the column-list
        # form of SET NULL, which SQLAlchemy cannot express (AD-35).
        sa.Column("series_id", uuid_type, nullable=True),
        # Its place in the series — "Discworld 3". Refused by the service without a series.
        sa.Column("series_order", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="to-read"),
        # 1–5 or NULL. NULL is "unrated", which is not a score of zero.
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("current_page", sa.Integer(), nullable=True),
        # Comma-separated, normalised by the service; '' rather than NULL so a book always has
        # a tag list, possibly empty.
        sa.Column("tags", sa.String(500), nullable=False, server_default=""),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("added_on", sa.Date(), nullable=False, server_default=sa.text("current_date")),
        sa.Column("started_on", sa.Date(), nullable=True),
        sa.Column("finished_on", sa.Date(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("status IN ('to-read', 'reading', 'read')", name="books_status_valid"),
        sa.CheckConstraint("rating IS NULL OR rating BETWEEN 1 AND 5", name="books_rating_1_to_5"),
        sa.CheckConstraint(
            "page_count IS NULL OR page_count > 0", name="books_page_count_positive"
        ),
        # A current page needs a count to be a fraction of, and cannot pass it. Page 0 is
        # allowed: "I have it open and have not started" is a real state.
        sa.CheckConstraint(
            "current_page IS NULL OR (page_count IS NOT NULL "
            "AND current_page >= 0 AND current_page <= page_count)",
            name="books_current_page_within_count",
        ),
        # A place in a series is meaningless without one.
        sa.CheckConstraint(
            "series_order IS NULL OR (series_id IS NOT NULL AND series_order > 0)",
            name="books_series_order_needs_series",
        ),
        # The one cross-column date rule the schema can hold. The future is refused by the
        # service: current_date is not IMMUTABLE.
        sa.CheckConstraint(
            "started_on IS NULL OR finished_on IS NULL OR started_on <= finished_on",
            name="books_started_before_finished",
        ),
    )
    op.execute(
        "ALTER TABLE books ADD CONSTRAINT books_series_fkey "
        "FOREIGN KEY (user_id, series_id) REFERENCES book_series (user_id, id) "
        "ON DELETE SET NULL (series_id)"
    )
    op.create_index("books_user_status_idx", "books", ["user_id", "status"])
    op.create_index("books_user_series_idx", "books", ["user_id", "series_id"])
    protect("books")


def downgrade() -> None:
    op.drop_table("books")
    op.drop_table("book_series")
