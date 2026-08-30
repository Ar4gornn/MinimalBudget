#!/bin/sh
# Take a backup of the MinimalBudget database (Story 7.4).
#
#   ./ops/backup.sh [destination-directory]
#
# Safe to run on a schedule. Writes one timestamped file per run and prunes anything older
# than RETENTION_DAYS.
#
# A backup on the same disk as the database is not a backup. It survives a mistake — a bad
# migration, a wrong DELETE — and it does not survive the disk dying or the machine being
# lost. Copy the output somewhere else. The README says so too, because it is the step
# people skip.
#
# --format=custom is compressed and lets pg_restore be selective. It is not a .sql file and
# cannot be piped into psql; use ops/restore.sh.
#
# Runs as the POSTGRES SUPERUSER, and that is not laziness. Every table has FORCE ROW LEVEL
# SECURITY, so policies apply even to the schema owner. pg_dump sets row_security=off,
# which per the Postgres manual does not bypass RLS — it raises an error if a policy would
# filter the output, exactly so a backup cannot come out silently incomplete. Dumping as
# the owner therefore fails outright:
#
#   ERROR: query would be affected by row-level security policy for table "budgets"
#
# The tempting fix is --enable-row-security. Do not. That dumps only the rows visible under
# current policies, so the day a policy is tightened the backups quietly start missing data
# and nothing complains. A superuser bypasses RLS by definition, so the dump is complete by
# construction.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

[ -f "$ROOT/.env" ] || { echo "No .env at $ROOT" >&2; exit 1; }
# shellcheck disable=SC1091
. "$ROOT/.env"

: "${POSTGRES_DB:?POSTGRES_DB is not set}"
: "${POSTGRES_SUPERUSER:?POSTGRES_SUPERUSER is not set}"

COMPOSE="docker compose -f $ROOT/docker-compose.yml"

mkdir -p "$DEST"
STAMP="$(date -u +%Y%m%d-%H%M%SZ)"
TARGET="$DEST/${POSTGRES_DB}-${STAMP}.dump"
# Written under a temporary name first: a crashed or half-written dump must never be left
# sitting there looking like a valid backup.
TMP="$TARGET.partial"

ENTRIES="$($COMPOSE exec -T db psql --username "$POSTGRES_SUPERUSER" --dbname "$POSTGRES_DB" -tAc "SELECT count(*) FROM entries" | tr -d '[:space:]')"

$COMPOSE exec -T db pg_dump --username "$POSTGRES_SUPERUSER" --dbname "$POSTGRES_DB" --format=custom --compress=6 > "$TMP"

if [ ! -s "$TMP" ]; then
    rm -f "$TMP"
    echo "Backup produced an empty file — refusing to keep it." >&2
    exit 1
fi

# A custom-format dump starts with the magic string "PGDMP". Cheap, and it catches the
# realistic failure: a truncated or error-text file that is non-empty and useless.
#
# It is deliberately not a full restore. That would double the cost of every scheduled
# backup, and a restore into a scratch database is a thing you should do periodically and
# deliberately — `ops/restore.sh <dump> minimalbudget_verify` — rather than continuously
# and inattentively.
if [ "$(head -c 5 "$TMP")" != "PGDMP" ]; then
    rm -f "$TMP"
    echo "Dump is not a valid custom-format archive — refusing to keep it." >&2
    exit 1
fi

mv "$TMP" "$TARGET"
SIZE="$(wc -c < "$TARGET" | tr -d '[:space:]')"
echo "Wrote $TARGET"
echo "  $SIZE bytes, $ENTRIES entries at dump time"

PRUNED="$(find "$DEST" -name "${POSTGRES_DB}-*.dump" -type f -mtime "+$RETENTION_DAYS" -print -delete 2>/dev/null | wc -l | tr -d '[:space:]')"
if [ "${PRUNED:-0}" -gt 0 ]; then
    echo "  pruned $PRUNED backup(s) older than $RETENTION_DAYS days"
fi

echo "Now copy it off this machine. A backup beside the database is not a backup."
