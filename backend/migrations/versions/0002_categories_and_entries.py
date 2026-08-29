"""categories and entries

Epic 2. The composite foreign key from entries to categories is the whole point of this
migration: Postgres foreign-key checks bypass row-level security, so a bare category_id
reference would let one user point at another user's category (AD-18).

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import protect, unprotect

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ENTRY_KIND = "entry_kind"


def upgrade() -> None:
    # AD-6: direction is an enum, never the sign of the amount.
    op.execute(f"CREATE TYPE {ENTRY_KIND} AS ENUM ('income', 'expense')")
    # create_type=False is a postgresql-dialect option; plain sa.Enum would emit its own
    # CREATE TYPE inside create_table and collide with the statement above.
    kind = sa.dialects.postgresql.ENUM(
        "income", "expense", name=ENTRY_KIND, create_type=False
    )
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)

    op.create_table(
        "categories",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id",
            uuid_type,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", kind, nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    # AD-12: one category per user, kind and name, compared case-insensitively.
    op.execute(
        "CREATE UNIQUE INDEX categories_user_kind_name_key "
        "ON categories (user_id, kind, lower(name))"
    )
    # AD-18 foreign-key targets. (user_id, id) is what budgets reference; the three-column
    # form additionally pins the kind, so AD-7 is enforced by the same constraint.
    op.create_unique_constraint("categories_user_id_id_key", "categories", ["user_id", "id"])
    op.create_unique_constraint(
        "categories_user_id_id_kind_key", "categories", ["user_id", "id", "kind"]
    )
    op.create_index("categories_user_id_idx", "categories", ["user_id"])

    op.create_table(
        "entries",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id",
            uuid_type,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", kind, nullable=False),
        sa.Column("category_id", uuid_type, nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        # AD-10: a calendar date, required, with no server default.
        sa.Column("occurred_on", sa.Date, nullable=False),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        # AD-6: the database refuses a non-positive amount; validation is not the only guard.
        sa.CheckConstraint("amount > 0", name="entries_amount_positive"),
        # AD-18 and AD-7 in one constraint: an entry can only reference a category that is
        # both its own user's and of the same kind. AD-21: RESTRICT, so deleting a category
        # that has entries fails rather than destroying them.
        sa.ForeignKeyConstraint(
            ["user_id", "category_id", "kind"],
            ["categories.user_id", "categories.id", "categories.kind"],
            name="entries_category_fkey",
            ondelete="RESTRICT",
        ),
    )
    op.create_index("entries_user_occurred_idx", "entries", ["user_id", "occurred_on"])
    op.create_index("entries_user_category_idx", "entries", ["user_id", "category_id"])

    protect("categories")
    protect("entries")


def downgrade() -> None:
    unprotect("entries")
    unprotect("categories")
    op.drop_table("entries")
    op.drop_table("categories")
    op.execute(f"DROP TYPE IF EXISTS {ENTRY_KIND}")
