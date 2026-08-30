#!/bin/sh
# Restore a MinimalBudget backup (Story 7.4).
#
#   ./ops/restore.sh backups/minimalbudget-20260830-101500Z.dump [target-database]
#
# With no target it restores over the live database, which is destructive and asks first.
# Pass a target to restore into a scratch database instead — which is how you should be
# checking, periodically, that your backups actually restore. A backup you have never
# restored is a hypothesis, not a backup.
#
# Runs as the superuser for the same reason backup.sh does: FORCE ROW LEVEL SECURITY
# applies to the owner too, so a restore as the owner would be filtered or refused.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DUMP="${1:-}"
[ -n "$DUMP" ] || { echo "Usage: $0 <dump-file> [target-database]" >&2; exit 1; }
[ -f "$DUMP" ] || { echo "No such file: $DUMP" >&2; exit 1; }

[ -f "$ROOT/.env" ] || { echo "No .env at $ROOT" >&2; exit 1; }
# shellcheck disable=SC1091
. "$ROOT/.env"

: "${POSTGRES_DB:?POSTGRES_DB is not set}"
: "${POSTGRES_SUPERUSER:?POSTGRES_SUPERUSER is not set}"

TARGET="${2:-$POSTGRES_DB}"
COMPOSE="docker compose -f $ROOT/docker-compose.yml"

if [ "$TARGET" = "$POSTGRES_DB" ]; then
    printf 'This overwrites the LIVE database "%s". Type its name to confirm: ' "$TARGET"
    read -r CONFIRM
    [ "$CONFIRM" = "$TARGET" ] || { echo "Aborted." >&2; exit 1; }
else
    echo "Restoring into scratch database \"$TARGET\"."
    $COMPOSE exec -T db psql --username "$POSTGRES_SUPERUSER" --dbname postgres -c "DROP DATABASE IF EXISTS \"$TARGET\" WITH (FORCE)" > /dev/null
    $COMPOSE exec -T db psql --username "$POSTGRES_SUPERUSER" --dbname postgres -c "CREATE DATABASE \"$TARGET\"" > /dev/null
fi

# --clean --if-exists so restoring over a populated database replaces it rather than
# colliding. --no-owner because roles are cluster-level and already exist; the dump should
# not try to recreate or reassign them.
$COMPOSE exec -T db pg_restore --username "$POSTGRES_SUPERUSER" --dbname "$TARGET" --clean --if-exists --no-owner --exit-on-error < "$DUMP"

RESTORED="$($COMPOSE exec -T db psql --username "$POSTGRES_SUPERUSER" --dbname "$TARGET" -tAc "SELECT count(*) FROM entries" | tr -d '[:space:]')"
echo "Restored $DUMP into \"$TARGET\" — $RESTORED entries."
