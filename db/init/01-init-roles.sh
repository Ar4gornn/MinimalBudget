#!/bin/sh
# Runs once, on first boot of an empty data directory.
#
# Creates the two roles AD-2 requires:
#   - the owner, which owns the schema and runs migrations
#   - the runtime role, which the API connects as: DML only, no DDL, no BYPASSRLS
#
# Neither role is created by a migration, because creating a role needs privileges the
# owner is deliberately not given.
#
# Values reach SQL through psql variables (:'name' for literals, :"name" for identifiers),
# never by shell expansion into the statement. The heredoc is quoted for the same reason.
# This runs as the Postgres superuser, so a password containing a quote would otherwise be
# a privilege-escalation vector rather than merely a broken first boot.
set -e

psql -v ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    -v owner="$DB_OWNER" \
    -v owner_pw="$DB_OWNER_PASSWORD" \
    -v app="$DB_APP_USER" \
    -v app_pw="$DB_APP_PASSWORD" \
    -v dbname="$POSTGRES_DB" <<-'EOSQL'
    -- CREATEDB so the test suite can build and drop its own throwaway database.
    -- Still NOBYPASSRLS: the owner is subject to FORCE ROW LEVEL SECURITY like everyone else.
    CREATE ROLE :"owner" LOGIN PASSWORD :'owner_pw' NOBYPASSRLS CREATEDB;
    CREATE ROLE :"app" LOGIN PASSWORD :'app_pw' NOBYPASSRLS NOCREATEDB NOCREATEROLE;

    ALTER DATABASE :"dbname" OWNER TO :"owner";
    ALTER SCHEMA public OWNER TO :"owner";

    -- The runtime role may use the schema but may not create anything in it.
    GRANT USAGE ON SCHEMA public TO :"app";
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    REVOKE CREATE ON SCHEMA public FROM :"app";

    -- Table-level grants are issued by the migration that creates each table,
    -- so a new table is unreachable until its grants and policies exist.
EOSQL
