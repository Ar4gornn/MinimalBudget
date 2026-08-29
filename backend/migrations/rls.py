"""Helpers that make the row-level-security boilerplate of AD-1 impossible to get subtly wrong.

Every user-scoped table goes through :func:`protect`, which does all four of the things
AD-1 requires — enable, force, policy, grants — so a migration cannot accidentally ship a
table with three of the four. The schema audit test (AD-24) checks the result independently.
"""

import os

from alembic import op

APP_ROLE = os.environ.get("DB_APP_USER", "moneymap_app")
OWNER_ROLE = os.environ.get("DB_OWNER", "moneymap_owner")

_DML = "SELECT, INSERT, UPDATE, DELETE"


def create_tenant_function() -> None:
    """The single expression every policy is written in terms of.

    ``NULLIF`` matters: an unset setting yields NULL, and so does an empty one, and
    ``user_id = NULL`` is NULL — which is not true, so the row is not visible. An unset
    tenant therefore sees nothing rather than everything (AD-3).
    """
    # Make the migration self-sufficient on any fresh database (the test database is
    # created and dropped per run, and never sees the container's init script).
    op.execute(f'GRANT USAGE ON SCHEMA public TO "{APP_ROLE}"')
    op.execute(f'REVOKE CREATE ON SCHEMA public FROM "{APP_ROLE}"')
    op.execute(
        """
        CREATE FUNCTION app_current_user_id() RETURNS uuid
        LANGUAGE sql STABLE
        AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
        """
    )


def drop_tenant_function() -> None:
    op.execute("DROP FUNCTION IF EXISTS app_current_user_id()")


def protect(table: str, *, owning_column: str = "user_id", grants: str = _DML) -> None:
    """Enable and force RLS on ``table``, add its policies, and grant the runtime role."""
    op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
    # FORCE matters even though the app connects as a non-owner: without it, the owner
    # role silently bypasses these policies, and the owner is what SECURITY DEFINER
    # functions and migrations run as.
    op.execute(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY')

    op.execute(
        f"""
        CREATE POLICY {table}_tenant ON "{table}"
            FOR ALL TO "{APP_ROLE}"
            USING ({owning_column} = app_current_user_id())
            WITH CHECK ({owning_column} = app_current_user_id());
        """
    )
    # The owner is subject to FORCE too, so it needs an explicit policy to run migrations,
    # backfills, and the SECURITY DEFINER login lookup. The runtime role never uses it:
    # a policy applies only to the role it names.
    op.execute(
        f"""
        CREATE POLICY {table}_owner ON "{table}"
            FOR ALL TO "{OWNER_ROLE}"
            USING (true) WITH CHECK (true);
        """
    )
    op.execute(f'GRANT {grants} ON "{table}" TO "{APP_ROLE}"')


def unprotect(table: str) -> None:
    op.execute(f'REVOKE ALL ON "{table}" FROM "{APP_ROLE}"')
    op.execute(f'DROP POLICY IF EXISTS {table}_owner ON "{table}"')
    op.execute(f'DROP POLICY IF EXISTS {table}_tenant ON "{table}"')
    op.execute(f'ALTER TABLE "{table}" NO FORCE ROW LEVEL SECURITY')
    op.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')
