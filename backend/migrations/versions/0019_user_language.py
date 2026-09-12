"""the language the account reads in

Epic 25. Two letters on the account, `'en'` or `'fr'`.

**On the account rather than in the browser**, which is the decision worth the paragraph.
The obvious alternative — `localStorage` plus `Accept-Language` — needs no migration and no
endpoint, and it is wrong here for two reasons. A household member who signs in on a phone
and a laptop would read two different languages; and the daily push digest is composed by
`notify.py` on the host, hours after anyone was last in the browser, so a preference the
server cannot see means a notification that can never be French. Currency, weight unit and
budget start day are all account settings for the same kind of reason (AD-36); this joins
them.

Unlike the currency and the weight unit, it is **not locked and never can be**. Those two
relabel a stored number — 100 kg does not become 100 lb — so changing them once data exists
corrupts it. This changes only which words are drawn around numbers that do not move. It is
the freest setting in the app.

Two letters, not a BCP 47 tag. `String(2)` with a CHECK, matching how `period` and `cadence`
are stored: the app ships exactly the languages it has a catalogue for, and a column that
could hold `pt-BR` while nothing could render it would be a promise the app does not keep.
A third language is one ALTER of the constraint.

Revision ID: 0019
Revises: 0018
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import APP_ROLE

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Defaulting to English rather than to the browser's language: a default is what every
    # existing row gets, and there is no browser at migration time. The client offers the
    # picker, and a first-time visitor is shown their browser's language before they sign
    # in — that is a client-side guess about an anonymous reader, not a stored fact.
    op.add_column(
        "users", sa.Column("language", sa.String(2), nullable=False, server_default="en")
    )
    op.create_check_constraint(
        "users_language_supported", "users", "language IN ('en', 'fr')"
    )
    # AD-19: the runtime role reads users by named columns, so a new column is invisible to
    # it until granted explicitly — without this every profile read would fail.
    for privilege in ("SELECT", "INSERT", "UPDATE"):
        op.execute(f'GRANT {privilege} (language) ON users TO "{APP_ROLE}"')


def downgrade() -> None:
    op.drop_constraint("users_language_supported", "users", type_="check")
    op.drop_column("users", "language")
