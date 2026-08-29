#!/bin/sh
# Runs once, on first boot of an empty data directory.
#
# Creates the two roles AD-2 requires:
#   - the owner, which owns the schema and runs migrations
#   - the runtime role, which the API connects as: DML only, no DDL, no BYPASSRLS
#
# Neither role is created by a migration, because creating a role needs privileges
# the owner is deliberately not given.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- CREATEDB so the test suite can build and drop its own throwaway database.
    -- Still NOBYPASSRLS: the owner is subject to FORCE ROW LEVEL SECURITY like everyone else.
    CREATE ROLE "$DB_OWNER" LOGIN PASSWORD '$DB_OWNER_PASSWORD' NOBYPASSRLS CREATEDB;
    CREATE ROLE "$DB_APP_USER" LOGIN PASSWORD '$DB_APP_PASSWORD' NOBYPASSRLS NOCREATEDB NOCREATEROLE;

    ALTER DATABASE "$POSTGRES_DB" OWNER TO "$DB_OWNER";
    ALTER SCHEMA public OWNER TO "$DB_OWNER";

    -- The runtime role may use the schema but may not create anything in it.
    GRANT USAGE ON SCHEMA public TO "$DB_APP_USER";
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    REVOKE CREATE ON SCHEMA public FROM "$DB_APP_USER";

    -- Table-level grants are issued by the migration that creates each table,
    -- so a new table is unreachable until its grants and policies exist.
EOSQL
