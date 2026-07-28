#!/usr/bin/env bash
#
# Grihasti — nightly logical backup.
#
# The points ledger is money owed to customers. If it is lost, the liability
# does not disappear — you simply can no longer compute it. Treat this script
# as production code, not ops garnish.
#
# Usage:  DATABASE_URL=... BACKUP_DIR=/var/backups/grihasti ./scripts/backup.sh
# Cron:   15 3 * * *  /opt/grihasti/scripts/backup.sh >> /var/log/grihasti-backup.log 2>&1
#
# Offsite: set B2_BUCKET / S3_TARGET (rclone remote) to push away from the DB
# host. A backup that lives only on the machine it backs up is not a backup.

set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/grihasti}"
RETAIN_DAYS="${RETAIN_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="${BACKUP_DIR}/grihasti-${STAMP}.dump"

mkdir -p "$BACKUP_DIR"

log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { log "FAILED: $*"; exit 1; }
trap 'fail "line $LINENO"' ERR

log "Dumping to ${DUMP}"
pg_dump --format=custom --compress=9 --no-owner --no-privileges \
        --file="$DUMP" "$DATABASE_URL"

# Verify the dump is readable before we trust it. A truncated dump that nobody
# opened until restore day is the classic way to lose a database.
log "Verifying dump is listable"
pg_restore --list "$DUMP" > /dev/null || fail "dump is unreadable"

SIZE=$(du -h "$DUMP" | cut -f1)
log "Dump OK (${SIZE})"

# Record ledger row count alongside the dump, so a restore can be checked
# against a known-good number rather than eyeballed.
LEDGER_ROWS=$(psql "$DATABASE_URL" -tAc "select count(*) from points_ledger")
LEDGER_SUM=$(psql "$DATABASE_URL" -tAc "select coalesce(sum(amount_inr),0) from points_ledger")
cat > "${DUMP}.manifest" <<EOF
{"taken_at":"${STAMP}","ledger_rows":${LEDGER_ROWS},"ledger_sum_inr":"${LEDGER_SUM}","dump":"$(basename "$DUMP")"}
EOF
log "Ledger at backup time: ${LEDGER_ROWS} rows, net ₹${LEDGER_SUM}"

# ── Offsite ──────────────────────────────────────────────────────────────
if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  log "Pushing offsite to ${RCLONE_REMOTE}"
  rclone copy "$DUMP" "$RCLONE_REMOTE" --no-traverse
  rclone copy "${DUMP}.manifest" "$RCLONE_REMOTE" --no-traverse
  log "Offsite copy done"
else
  log "WARNING: RCLONE_REMOTE unset — backup is LOCAL ONLY and does not protect"
  log "         against losing the host. Configure before go-live."
fi

find "$BACKUP_DIR" -name 'grihasti-*.dump*' -mtime "+${RETAIN_DAYS}" -delete
log "Pruned backups older than ${RETAIN_DAYS} days"
log "Done"
