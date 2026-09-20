"""Book quotes: lines kept from a book, owned by it (Epic 31).

A quote is a row under a book: a text, an optional page, and nothing else. The foreign key
is the composite of AD-18 — ``(user_id, book_id)`` against ``books (user_id, id)`` — which
needs a unique key on ``books`` that 0021 did not add because nothing referenced a book yet.
It cascades: a deleted book takes its quotes with it, and there is no quote of nothing.

**What the schema holds.** A quote is not empty and a page is positive or NULL. **What it
does not.** The page is not checked against the book's ``page_count``: it is where the person
found the line, and a count typed later or wrongly should not make the quote refuse. And the
cap of ten per book (AD-47) is the service's: a CHECK cannot count rows, a trigger is a
mechanism this project does not otherwise use, and the service locks the book row while it
counts, so two concurrent adds cannot make eleven.

Revision ID: 0023
Revises: 0022
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import protect

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)

    # The target of the composite key below (AD-18).
    op.create_unique_constraint("books_user_id_id_key", "books", ["user_id", "id"])

    op.create_table(
        "book_quotes",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("book_id", uuid_type, nullable=False),
        sa.Column("text", sa.String(1000), nullable=False),
        sa.Column("page", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("length(text) > 0", name="book_quotes_text_not_empty"),
        sa.CheckConstraint("page IS NULL OR page > 0", name="book_quotes_page_positive"),
        # Composite (AD-18) and cascading: the plain form is right here, because every column
        # of the key is meant to go with the book.
        sa.ForeignKeyConstraint(
            ["user_id", "book_id"],
            ["books.user_id", "books.id"],
            name="book_quotes_book_fkey",
            ondelete="CASCADE",
        ),
    )
    op.create_index("book_quotes_user_book_idx", "book_quotes", ["user_id", "book_id"])
    protect("book_quotes")


def downgrade() -> None:
    op.drop_table("book_quotes")
    op.drop_constraint("books_user_id_id_key", "books", type_="unique")
