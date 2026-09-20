"""whether the account has seen the guided tour

Epic 30. Two columns on the account: `tutorial_completed`, a boolean, and
`tutorial_skipped_at`, a nullable timestamp. Together they answer one question the client
asks on every sign-in — *should the tour open?* — and keep one fact the product wants
later: of the people who did not finish it, when did they leave.

**Existing accounts are marked completed in this migration**, not left at the default.
The default is what a *new* row gets, and a new row is exactly who the tour is for. An
account that has been recording entries for a year is not new, and a welcome screen on
its next sign-in is an interruption, not an onboarding. So the column arrives as `false`
for rows created from now on and `true` for every row that already exists.

**On the account rather than in the browser**, for the same reason as the language
(0019): a household member who signs in on a phone and a laptop would otherwise be
welcomed twice, and a cleared browser would welcome them a third time.

The skip timestamp is set by the server (`now()`), never sent by the client — the same
rule as every other `*_at` column here. A client clock is not a fact.

Revision ID: 0022
Revises: 0021
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import APP_ROLE

revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "tutorial_completed", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column(
        "users", sa.Column("tutorial_skipped_at", sa.DateTime(timezone=True), nullable=True)
    )
    # Everyone who already has an account is, by definition, not a new user. See the
    # docstring: the default is for rows that do not exist yet.
    op.execute("UPDATE users SET tutorial_completed = true")
    # AD-19: the runtime role reads users by named columns, so a new column is invisible to
    # it until granted explicitly — without this every profile read would fail.
    for column in ("tutorial_completed", "tutorial_skipped_at"):
        for privilege in ("SELECT", "INSERT", "UPDATE"):
            op.execute(f'GRANT {privilege} ({column}) ON users TO "{APP_ROLE}"')


def downgrade() -> None:
    op.drop_column("users", "tutorial_skipped_at")
    op.drop_column("users", "tutorial_completed")
