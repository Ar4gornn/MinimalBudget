"""invites

Story 7.1. An invite is the only way to register on an internet-facing instance.

Invites are the one table in the schema that is deliberately **not** user-scoped: an invite
exists before the user it creates does, so there is no tenant to attach it to. It therefore
cannot follow AD-1, and it is exempted explicitly rather than by omission — the schema audit
of AD-24 checks the exemption list, so a *new* table still cannot ship unprotected by
accident.

What protects it instead: the runtime role gets SELECT and UPDATE but **no INSERT**. The
application can consume an invite and can never mint one. Issuing is a deliberate act by
whoever holds the owner credentials, through the script in `backend/invite.py`.

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import APP_ROLE

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)

    op.create_table(
        "invites",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        # The code is stored hashed. A leaked database backup should not hand someone a
        # working invite, for the same reason password hashes are not stored in the clear.
        sa.Column("code_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("note", sa.String(200), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        # Set when the invite is consumed, so an invite can be traced to the account it made.
        sa.Column(
            "used_by",
            uuid_type,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("invites_code_hash_idx", "invites", ["code_hash"])

    # No INSERT: the application consumes invites, it never issues them.
    op.execute(f'GRANT SELECT, UPDATE ON invites TO "{APP_ROLE}"')


def downgrade() -> None:
    op.execute(f'REVOKE ALL ON invites FROM "{APP_ROLE}"')
    op.drop_table("invites")
