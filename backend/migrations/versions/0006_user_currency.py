"""per-account currency

Story 9.1. Currency belongs to the account, not to the entry, and that choice is the whole
design.

Putting it on the entry would mean a ledger containing both €50 and $50, and every total,
budget comparison and trend would then need converting — which needs an exchange-rate
source, and *historical* rates, because converting last March at today's rate reports a
past that never happened. Putting it on the account means every amount in one ledger is
already in the same unit, so all the existing arithmetic stays correct and no rate source
is needed at all.

The cost, stated plainly because it is a real limitation: one account cannot hold two
currencies. Someone genuinely earning in EUR and spending in USD needs the per-entry model
and the rate history that comes with it. For a family where each person lives in one
currency zone, this is the honest trade.

Changing the setting relabels; it does not convert. The API refuses to change it once an
account has entries, because silently relabelling a year of history is a data-integrity
bug wearing a settings toggle.

Revision ID: 0006
Revises: 0005
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
    )
    # A CHECK rather than an enum type: adding a third currency later is one migration
    # altering a constraint, instead of the ALTER TYPE dance Postgres requires for enums.
    op.create_check_constraint(
        "users_currency_supported", "users", "currency IN ('USD', 'EUR')"
    )

    # The runtime role reads users by named columns (AD-19), so a new column is invisible
    # to it until granted explicitly. Without this, every read of a profile fails.
    from migrations.rls import APP_ROLE

    op.execute(f'GRANT SELECT (currency) ON users TO "{APP_ROLE}"')
    op.execute(f'GRANT INSERT (currency) ON users TO "{APP_ROLE}"')
    op.execute(f'GRANT UPDATE (currency) ON users TO "{APP_ROLE}"')


def downgrade() -> None:
    op.drop_constraint("users_currency_supported", "users", type_="check")
    op.drop_column("users", "currency")
