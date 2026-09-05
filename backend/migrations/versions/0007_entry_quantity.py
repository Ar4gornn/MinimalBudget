"""quantity and unit on entries

Story 10.1. An expense can say how much of what was bought: "$60.00 for 40.000 l". The
per-unit price is derived on read (AD-29) and deliberately has no column — a stored rate
would be wrong the moment someone PATCHed the amount.

The unit is a closed list enforced by a CHECK, the same choice currency made in 0006:
adding a unit is one constraint alteration, not the ALTER TYPE dance an enum needs. Closed
rather than free text because the feature is *comparing* the rate across months, and
"L", "litre" and "liters" would chart as three lines for one thing.

Every existing row is untouched: both columns are nullable, and null together.

Revision ID: 0007
Revises: 0006
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UNITS = ("l", "gal", "kg", "lb", "kwh", "m3", "unit")


def upgrade() -> None:
    op.add_column("entries", sa.Column("quantity", sa.Numeric(12, 3), nullable=True))
    op.add_column("entries", sa.Column("unit", sa.String(8), nullable=True))

    op.create_check_constraint(
        "entries_quantity_positive", "entries", "quantity IS NULL OR quantity > 0"
    )
    # Both or neither. A quantity without a unit is a number with no meaning; a unit
    # without a quantity is a label on nothing.
    op.create_check_constraint(
        "entries_quantity_unit_together", "entries", "(quantity IS NULL) = (unit IS NULL)"
    )
    # Only an expense buys something. "40 litres of salary" is refused by the database,
    # not only by validation.
    op.create_check_constraint(
        "entries_quantity_expense_only", "entries", "kind = 'expense' OR quantity IS NULL"
    )
    quoted = ", ".join(f"'{u}'" for u in UNITS)
    op.create_check_constraint(
        "entries_unit_supported", "entries", f"unit IS NULL OR unit IN ({quoted})"
    )

    # The unit-price series groups quantified rows by category and unit inside a date
    # window; a partial index keeps that cheap without touching unquantified rows.
    op.execute(
        "CREATE INDEX entries_user_quantified_idx ON entries (user_id, category_id, unit, "
        "occurred_on) WHERE quantity IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS entries_user_quantified_idx")
    op.drop_constraint("entries_unit_supported", "entries", type_="check")
    op.drop_constraint("entries_quantity_expense_only", "entries", type_="check")
    op.drop_constraint("entries_quantity_unit_together", "entries", type_="check")
    op.drop_constraint("entries_quantity_positive", "entries", type_="check")
    op.drop_column("entries", "unit")
    op.drop_column("entries", "quantity")
