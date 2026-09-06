"""the budget month can start on a day other than the 1st

Epic 20. A salary that lands on the 26th makes the 26th the start of the month that matters,
and every total in this app was answering for the calendar one instead.

Unlike the currency (0006) and the weight unit (0014), this can be changed freely and as
often as someone likes: it re-groups rows, it never relabels a stored number. An entry dated
27 August is still dated 27 August; only the bucket it is counted in moves. That is the whole
difference between a unit and a boundary, and it is why there is no lock here.

Limited to 1-28 by a CHECK. The 29th, 30th and 31st do not exist in every month, so such a
boundary would have to be clamped — and a clamped boundary breaks the arithmetic that maps a
date back to its period, silently, in February. "The 31st" as people mean it is the last
banking day, which is a rule rather than a day, and a different feature.

Revision ID: 0015
Revises: 0014
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import APP_ROLE

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("budget_start_day", sa.Integer, nullable=False, server_default="1"),
    )
    op.create_check_constraint(
        "users_budget_start_day_supported",
        "users",
        "budget_start_day BETWEEN 1 AND 28",
    )
    # AD-19: the runtime role reads users by named columns, so a new column is invisible to
    # it until granted explicitly — without this every profile read would fail.
    for privilege in ("SELECT", "INSERT", "UPDATE"):
        op.execute(f'GRANT {privilege} (budget_start_day) ON users TO "{APP_ROLE}"')


def downgrade() -> None:
    op.drop_constraint("users_budget_start_day_supported", "users", type_="check")
    op.drop_column("users", "budget_start_day")
