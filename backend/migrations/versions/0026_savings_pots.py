"""Savings pots: withdrawals, goals, and skipped months (Epic 34, AD-50).

A savings type becomes a pot with a balance. Three changes, one purpose:

* ``savings_contributions.kind`` — ``deposit`` or ``withdrawal``. The amount stays positive
  (the existing CHECK) and the sign lives in ``kind``, as it does on entries: a negative
  amount would be a second way of saying "withdrawal" and the two would disagree one day.
  Every existing row is a deposit, which is what it was.
* ``savings_types.goal_amount`` / ``goal_date`` — optional. A date without an amount is a
  deadline for nothing, so the CHECK refuses it; an amount without a date is a goal with no
  hurry, which is fine.
* ``savings_skips`` — "not this month" for a proposed contribution, keyed by the type and
  the budget-month label. The label, not a date range: the proposal is computed per
  labelled month (AD-10), so the skip is remembered in the same terms.

**What the schema does not hold:** that a pot's balance never goes below zero. That is a
sum over rows, which a CHECK cannot see; ``services/savings.py`` enforces it after every
write, under a lock on the type row, and the tests prove the refusal.

Revision ID: 0026
Revises: 0024

0025 (layout preferences, Epic 33) is on its own branch. Whichever of the two lands on
``main`` second re-points its ``down_revision`` at the other.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import protect

revision: str = "0026"
down_revision: str | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)

    op.add_column(
        "savings_contributions",
        sa.Column("kind", sa.String(10), nullable=False, server_default="deposit"),
    )
    op.create_check_constraint(
        "savings_contributions_kind_known",
        "savings_contributions",
        "kind IN ('deposit', 'withdrawal')",
    )

    op.add_column("savings_types", sa.Column("goal_amount", sa.Numeric(14, 2), nullable=True))
    op.add_column("savings_types", sa.Column("goal_date", sa.Date(), nullable=True))
    op.create_check_constraint(
        "savings_types_goal_positive", "savings_types", "goal_amount IS NULL OR goal_amount > 0"
    )
    op.create_check_constraint(
        "savings_types_goal_date_needs_amount",
        "savings_types",
        "goal_date IS NULL OR goal_amount IS NOT NULL",
    )

    op.create_table(
        "savings_skips",
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("savings_type_id", uuid_type, nullable=False),
        sa.Column("month", sa.String(7), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("user_id", "savings_type_id", "month", name="savings_skips_pkey"),
        # Composite, so another account's type id cannot be referenced (lab note: foreign-key
        # checks bypass RLS). CASCADE: a skip means nothing once its pot is gone.
        sa.ForeignKeyConstraint(
            ["user_id", "savings_type_id"],
            ["savings_types.user_id", "savings_types.id"],
            name="savings_skips_type_fkey",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            r"month ~ '^\d{4}-(0[1-9]|1[0-2])$'", name="savings_skips_month_shape"
        ),
    )
    protect("savings_skips")


def downgrade() -> None:
    op.drop_table("savings_skips")
    op.drop_constraint("savings_types_goal_date_needs_amount", "savings_types")
    op.drop_constraint("savings_types_goal_positive", "savings_types")
    op.drop_column("savings_types", "goal_date")
    op.drop_column("savings_types", "goal_amount")
    op.drop_constraint("savings_contributions_kind_known", "savings_contributions")
    op.drop_column("savings_contributions", "kind")
