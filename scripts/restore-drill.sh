#!/usr/bin/env bash
#
# Grihasti — restore drill. Proves a backup can actually be restored.
#
# An untested backup is a hypothesis. This restores the newest dump into a
# throwaway database and asserts the ledger matches the manifest recorded at
# backup time — row count AND net balance, because a partial restore can
# preserve the count while corrupting the sum.
#
# MUST be run and pass before go-live, and after any schema migration.
#
# Usage: ADMIN_DATABASE_URL=postgres://...  BACKUP_DIR=/var/backups/grihasti \
#        ./scripts/restore-drill.sh

set -Eeuo pipefail

: "${ADMIN_DATABASE_URL:?ADMIN_DATABASE_URL is required (needs CREATEDB)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/grihasti}"
SCRATCH_DB="grihasti_restore_drill_$(date -u +%s)"

log()  { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { printf 'DRILL FAILED: %s\n' "$*" >&2; exit 1; }

DUMP=$(ls -t "${BACKUP_DIR}"/grihasti-*.dump 2>/dev/null | head -1) \
  || fail "no dumps found in ${BACKUP_DIR}"
[[ -n "$DUMP" ]] || fail "no dumps found in ${BACKUP_DIR}"
MANIFEST="${DUMP}.manifest"
[[ -f "$MANIFEST" ]] || fail "manifest missing for ${DUMP}"

EXPECT_ROWS=$(grep -o '"ledger_rows":[0-9]*' "$MANIFEST" | cut -d: -f2)
EXPECT_SUM=$(grep -o '"ledger_sum_inr":"[^"]*"' "$MANIFEST" | cut -d'"' -f4)

log "Drilling ${DUMP}"
log "Expecting ${EXPECT_ROWS} ledger rows, net ₹${EXPECT_SUM}"

cleanup() {
  psql "$ADMIN_DATABASE_URL" -q -c "drop database if exists ${SCRATCH_DB}" || true
}
trap cleanup EXIT

psql "$ADMIN_DATABASE_URL" -q -c "create database ${SCRATCH_DB}"
SCRATCH_URL="${ADMIN_DATABASE_URL%/*}/${SCRATCH_DB}"

log "Restoring…"
pg_restore --no-owner --no-privileges --dbname="$SCRATCH_URL" "$DUMP" \
  || fail "pg_restore errored"

ACTUAL_ROWS=$(psql "$SCRATCH_URL" -tAc "select count(*) from points_ledger")
ACTUAL_SUM=$(psql "$SCRATCH_URL" -tAc "select coalesce(sum(amount_inr),0) from points_ledger")

[[ "$ACTUAL_ROWS" == "$EXPECT_ROWS" ]] \
  || fail "ledger row count ${ACTUAL_ROWS} != expected ${EXPECT_ROWS}"

# Numeric compare, tolerant of trailing-zero formatting differences.
python3 - "$ACTUAL_SUM" "$EXPECT_SUM" <<'PY' || fail "ledger balance mismatch"
import sys
from decimal import Decimal
sys.exit(0 if Decimal(sys.argv[1]) == Decimal(sys.argv[2]) else 1)
PY

# The guard from migration 0004 must survive the round-trip, or the restored
# database is silently vulnerable to double-crediting again.
HAS_GUARD=$(psql "$SCRATCH_URL" -tAc \
  "select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid
    where c.relname = 'idx_ledger_idempotent' and i.indnullsnotdistinct")
[[ "$HAS_GUARD" == "1" ]] \
  || fail "restored DB is missing the NULLS NOT DISTINCT ledger guard"

log "PASS — ${ACTUAL_ROWS} ledger rows, net ₹${ACTUAL_SUM}, idempotency guard intact"
log "Restore drill succeeded. Record the date; re-run after every migration."
