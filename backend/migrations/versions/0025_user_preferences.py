"""the account's layout preferences

Epic 33 (AD-49). One ``jsonb`` column on ``users``: which modules are on, and for each of
two layouts — ``phone`` and ``desktop`` — the order and slot of the sections and the order
and visibility of the dashboard cards.

**Sparse, so this migration writes no data.** Every existing row gets ``{}``, which
resolves to exactly the app as it was: every module on, today's tab order, today's cards.
A key is stored only once someone changes it, and a card added by a later epic reaches
everyone through ``services/preferences.resolve`` rather than through another migration.

**A column, not a table**, and not one column per setting. It is 1:1 with the account, read
in full on every ``/me``, and only ``modules`` is ever read by the server itself. The
catalogue it is validated against (sections, cards, the phone's caps) changes with every
epic that adds a card; a CHECK that duplicated it would have to change with it. The one
CHECK here is the shape the resolver relies on: an object.

Revision ID: 0025
Revises: 0026
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

from migrations.rls import APP_ROLE

revision: str = "0025"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "preferences", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
    )
    op.create_check_constraint(
        "users_preferences_object", "users", "jsonb_typeof(preferences) = 'object'"
    )
    # AD-19: the runtime role reads users by named columns, so a new column is invisible to
    # it until granted explicitly — without this every profile read would fail.
    for privilege in ("SELECT", "INSERT", "UPDATE"):
        op.execute(f'GRANT {privilege} (preferences) ON users TO "{APP_ROLE}"')


def downgrade() -> None:
    op.drop_column("users", "preferences")
