"""users and savings_types, under forced row-level security

Stories 1.3 and 1.4. Creates only the two tables those stories need.

Revision ID: 0001
Revises:
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import (
    APP_ROLE,
    create_tenant_function,
    drop_tenant_function,
    protect,
    unprotect,
)

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    create_tenant_function()

    op.create_table(
        "users",
        # AD-19: no server default. The application generates this id so it can set
        # app.user_id *before* the row is inserted.
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    # AD-23: uniqueness over the normalised value, so casing cannot split one person
    # into two accounts even if a caller forgets to normalise.
    op.execute("CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email))")

    op.create_table(
        "savings_types",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.execute(
        "CREATE UNIQUE INDEX savings_types_user_name_key ON savings_types (user_id, lower(name))"
    )
    # AD-18: later tables reference savings_types by (user_id, id), which needs this
    # composite unique key to exist as a foreign-key target.
    op.create_unique_constraint("savings_types_user_id_id_key", "savings_types", ["user_id", "id"])
    op.create_index("savings_types_user_id_idx", "savings_types", ["user_id"])

    # users is owned by its own id, not by a user_id column.
    protect("users", owning_column="id", grants="SELECT")
    protect("savings_types")

    # AD-19: the runtime role may write a password hash but may never read one back.
    # Column-level grants make that structural rather than a convention.
    op.execute(f'REVOKE SELECT ON users FROM "{APP_ROLE}"')
    op.execute(f'GRANT SELECT (id, email, created_at) ON users TO "{APP_ROLE}"')
    op.execute(f'GRANT INSERT (id, email, password_hash, created_at) ON users TO "{APP_ROLE}"')

    # AD-19: login must find a user by email before any tenant exists, which the tenant
    # policy forbids. This is the one narrow, audited hole: it takes an email and returns
    # only the id and the hash — never the whole row, and never a listing.
    op.execute(
        """
        CREATE FUNCTION auth_lookup(p_email text)
        RETURNS TABLE (user_id uuid, password_hash text)
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
            SELECT u.id, u.password_hash
            FROM users u
            WHERE lower(u.email) = lower(btrim(p_email))
        $$;
        """
    )
    op.execute("REVOKE ALL ON FUNCTION auth_lookup(text) FROM PUBLIC")
    op.execute(f'GRANT EXECUTE ON FUNCTION auth_lookup(text) TO "{APP_ROLE}"')


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS auth_lookup(text)")
    unprotect("savings_types")
    unprotect("users")
    op.drop_table("savings_types")
    op.drop_table("users")
    drop_tenant_function()
