"""savings contributions, budgets and savings targets

Epic 3. Budgets and targets are standing monthly amounts, one row per
(user, category) and (user, savings type) — so the composite key *is* AD-11, and a
duplicate is impossible rather than merely unlikely.

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import protect, unprotect

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)
    kind = sa.dialects.postgresql.ENUM(
        "income", "expense", name="entry_kind", create_type=False
    )

    op.create_table(
        "savings_contributions",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("savings_type_id", uuid_type, nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("occurred_on", sa.Date, nullable=False),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("amount > 0", name="savings_contributions_amount_positive"),
        # AD-18: carries user_id. AD-21: RESTRICT — deleting a savings type must not
        # silently destroy the record of what was put into it.
        sa.ForeignKeyConstraint(
            ["user_id", "savings_type_id"],
            ["savings_types.user_id", "savings_types.id"],
            name="savings_contributions_type_fkey",
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "savings_contributions_user_occurred_idx",
        "savings_contributions",
        ["user_id", "occurred_on"],
    )

    op.create_table(
        "budgets",
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("category_id", uuid_type, nullable=False),
        # Carried so the foreign key below can pin it. A budget on an income category is
        # meaningless, and this makes it impossible rather than merely validated.
        sa.Column("kind", kind, nullable=False, server_default="expense"),
        sa.Column("monthly_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        # AD-11: the primary key is the uniqueness rule. A second budget for the same
        # category cannot exist, so PUT can only ever update.
        sa.PrimaryKeyConstraint("user_id", "category_id", name="budgets_pkey"),
        sa.CheckConstraint("monthly_amount >= 0", name="budgets_amount_non_negative"),
        sa.CheckConstraint("kind = 'expense'", name="budgets_expense_only"),
        # AD-21: a budget is an attribute of its category, so it goes when the category does.
        sa.ForeignKeyConstraint(
            ["user_id", "category_id", "kind"],
            ["categories.user_id", "categories.id", "categories.kind"],
            name="budgets_category_fkey",
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "savings_targets",
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("savings_type_id", uuid_type, nullable=False),
        sa.Column("monthly_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("user_id", "savings_type_id", name="savings_targets_pkey"),
        sa.CheckConstraint("monthly_amount >= 0", name="savings_targets_amount_non_negative"),
        sa.ForeignKeyConstraint(
            ["user_id", "savings_type_id"],
            ["savings_types.user_id", "savings_types.id"],
            name="savings_targets_type_fkey",
            ondelete="CASCADE",
        ),
    )

    protect("savings_contributions")
    protect("budgets")
    protect("savings_targets")


def downgrade() -> None:
    unprotect("savings_targets")
    unprotect("budgets")
    unprotect("savings_contributions")
    op.drop_table("savings_targets")
    op.drop_table("budgets")
    op.drop_table("savings_contributions")
