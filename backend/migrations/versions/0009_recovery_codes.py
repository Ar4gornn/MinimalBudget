"""recovery codes, and the one function that may write a password hash

Epic 12. Self-service password recovery without email delivery: a person generates eight
one-time codes while signed in, keeps them somewhere safe, and redeems one with a new
password if they ever forget the old one. Codes are stored hashed, like invites and refresh
tokens — a leaked backup must not contain a working code.

The runtime role has never been able to write ``users.password_hash`` (AD-19), and that
does not change here. Instead there is one SECURITY DEFINER function, ``auth_set_password``,
which refuses any user id other than the transaction's own tenant. So even the function
that exists to write a hash cannot be pointed at someone else's account: recovery pins the
transaction to the id that the email resolved to, and only then may the hash change.

Revision ID: 0009
Revises: 0008
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import APP_ROLE, protect, unprotect

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)

    op.create_table(
        "recovery_codes",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("code_hash", sa.Text, nullable=False, unique=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("recovery_codes_user_id_idx", "recovery_codes", ["user_id"])
    # AD-1 like everything else. Recovery runs with the transaction pinned to the id the
    # email resolved to (AD-19's registration pattern), so the tenant policy applies.
    protect("recovery_codes")

    # The narrow hole: writes one row's hash, and only if that row is the current tenant.
    # plpgsql rather than sql so the tenant check can raise before the UPDATE runs.
    op.execute(
        """
        CREATE FUNCTION auth_set_password(p_user_id uuid, p_hash text)
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        BEGIN
            IF p_user_id IS NULL OR p_user_id IS DISTINCT FROM app_current_user_id() THEN
                RAISE EXCEPTION 'auth_set_password: not the current tenant'
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
            UPDATE users SET password_hash = p_hash WHERE id = p_user_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'auth_set_password: no such user' USING ERRCODE = 'no_data_found';
            END IF;
        END
        $$;
        """
    )
    op.execute("REVOKE ALL ON FUNCTION auth_set_password(uuid, text) FROM PUBLIC")
    op.execute(f'GRANT EXECUTE ON FUNCTION auth_set_password(uuid, text) TO "{APP_ROLE}"')


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS auth_set_password(uuid, text)")
    unprotect("recovery_codes")
    op.drop_table("recovery_codes")
