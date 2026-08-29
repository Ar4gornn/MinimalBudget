"""AD-24: the schema audits itself.

AD-1 is an obligation. Without this test nothing fails when a future migration ships a
table with three of its four requirements, so the obligation is mechanised here: every
table in the schema must have row-level security enabled, forced, and at least one policy.
A new table is a failing test until it is protected.
"""

from sqlalchemy import text

EXEMPT = {"alembic_version"}  # alembic's own bookkeeping, holds no user data


def _tables(conn) -> list[str]:
    rows = conn.execute(
        text("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
    ).scalars().all()
    return [t for t in rows if t not in EXEMPT]


def test_every_table_has_rls_enabled_and_forced(owner_engine):
    with owner_engine.connect() as conn:
        tables = _tables(conn)
        assert tables, "no tables found — the migration did not run"

        unprotected = conn.execute(
            text(
                """
                SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public'
                  AND c.relkind = 'r'
                  AND c.relname = ANY(:tables)
                  AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
                """
            ),
            {"tables": tables},
        ).all()

    assert unprotected == [], (
        f"tables without ENABLE + FORCE ROW LEVEL SECURITY: {[r[0] for r in unprotected]}"
    )


def test_every_table_has_a_policy_for_the_runtime_role(owner_engine):
    with owner_engine.connect() as conn:
        tables = _tables(conn)
        policed = conn.execute(
            text(
                "SELECT DISTINCT tablename FROM pg_policies "
                "WHERE schemaname = 'public' AND 'moneymap_app' = ANY(roles)"
            )
        ).scalars().all()

    missing = sorted(set(tables) - set(policed))
    assert missing == [], f"tables with no policy for the runtime role: {missing}"


def test_runtime_role_cannot_bypass_rls_and_owns_nothing(owner_engine):
    with owner_engine.connect() as conn:
        bypass = conn.execute(
            text("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'moneymap_app'")
        ).one()
        owned = conn.execute(
            text(
                "SELECT count(*) FROM pg_class c "
                "JOIN pg_namespace n ON n.oid = c.relnamespace "
                "JOIN pg_roles r ON r.oid = c.relowner "
                "WHERE n.nspname = 'public' AND r.rolname = 'moneymap_app'"
            )
        ).scalar_one()

    assert bypass == (False, False), "the runtime role must not be superuser or BYPASSRLS"
    assert owned == 0, "the runtime role must not own any table, or FORCE would not apply to it"


def test_runtime_role_cannot_read_password_hashes(owner_engine):
    """AD-19: write-only column. The grant, not a convention, is what enforces it."""
    with owner_engine.connect() as conn:
        privileges = conn.execute(
            text(
                "SELECT privilege_type FROM information_schema.column_privileges "
                "WHERE grantee = 'moneymap_app' AND table_name = 'users' "
                "AND column_name = 'password_hash'"
            )
        ).scalars().all()

    assert "SELECT" not in privileges
    assert "INSERT" in privileges, "registration still has to be able to write the hash"


def test_runtime_role_cannot_create_tables(owner_engine):
    with owner_engine.connect() as conn:
        can_create = conn.execute(
            text("SELECT has_schema_privilege('moneymap_app', 'public', 'CREATE')")
        ).scalar_one()
    assert can_create is False, "the runtime role has DDL rights it should not have (AD-2)"
