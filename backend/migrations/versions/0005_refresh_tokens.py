"""refresh tokens

Story 7.3. A 60-minute access token with no refresh means a family member re-enters their
password several times a day on a phone, which is how you end up with a short password.
The answer is not a longer access token — that is a bearer credential with no revocation.

Rotation with reuse detection instead. Every refresh mints a new token and revokes the one
presented. A token that is presented *after* it was already rotated means someone kept a
copy, so the whole family of tokens descended from that login is revoked, which logs the
attacker and the real user out and makes the theft visible.

Tokens are stored hashed. Unlike a password these are 256 bits of `secrets.token_urlsafe`,
so SHA-256 is the right choice — there is no dictionary to slow anyone down against, and
Argon2 would only make every refresh slower.

Revision ID: 0005
Revises: 0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import APP_ROLE, protect, unprotect

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id",
            uuid_type,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        # Every token minted from one login shares a family. Reuse revokes the family, not
        # just the one token, because a copy means the whole chain is compromised.
        sa.Column("family_id", uuid_type, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("refresh_tokens_user_family_idx", "refresh_tokens", ["user_id", "family_id"])

    # AD-1 applies here like everywhere else: the table is user-scoped, so it gets forced
    # RLS and a tenant policy.
    protect("refresh_tokens")

    # AD-19's pattern, for the same reason it exists there. A refresh request arrives with
    # no tenant — the token is what establishes identity — so the lookup cannot run under
    # the tenant policy. This function is the narrow, audited hole: it takes a hash and
    # returns one row's identity, never a listing, and cannot be used to enumerate.
    op.execute(
        """
        CREATE FUNCTION refresh_lookup(p_token_hash text)
        RETURNS TABLE (user_id uuid, family_id uuid, expired boolean, revoked boolean)
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
            SELECT r.user_id,
                   r.family_id,
                   (r.expires_at <= now()) AS expired,
                   (r.revoked_at IS NOT NULL) AS revoked
            FROM refresh_tokens r
            WHERE r.token_hash = p_token_hash
        $$;
        """
    )
    op.execute("REVOKE ALL ON FUNCTION refresh_lookup(text) FROM PUBLIC")
    op.execute(f'GRANT EXECUTE ON FUNCTION refresh_lookup(text) TO "{APP_ROLE}"')


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS refresh_lookup(text)")
    unprotect("refresh_tokens")
    op.drop_table("refresh_tokens")
