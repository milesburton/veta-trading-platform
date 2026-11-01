#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_HOUR_UTC="${BACKUP_HOUR_UTC:-03}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_MIN_KEEP="${BACKUP_MIN_KEEP:-3}"
BACKUP_RETRY_SECONDS="${BACKUP_RETRY_SECONDS:-900}"
BACKUP_CHECK_SECONDS="${BACKUP_CHECK_SECONDS:-60}"
BACKUP_METRICS_PORT="${BACKUP_METRICS_PORT:-8101}"
BACKUP_MAX_AGE_SECONDS="${BACKUP_MAX_AGE_SECONDS:-72000}"

METRICS_DIR="${BACKUP_DIR}/metrics"
METRICS_FILE="${METRICS_DIR}/metrics"
STATE_FILE="${BACKUP_DIR}/.state"

log() {
  echo "[postgres-backup] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
}

read_state() {
  LAST_SUCCESS=0
  LAST_ATTEMPT=0
  LAST_STATUS=0
  LAST_SIZE=0
  if [ -f "$STATE_FILE" ]; then
    # shellcheck disable=SC1090
    . "$STATE_FILE"
  fi
}

write_state() {
  printf 'LAST_SUCCESS=%s\nLAST_ATTEMPT=%s\nLAST_STATUS=%s\nLAST_SIZE=%s\n' \
    "$LAST_SUCCESS" "$LAST_ATTEMPT" "$LAST_STATUS" "$LAST_SIZE" >"${STATE_FILE}.tmp"
  mv "${STATE_FILE}.tmp" "$STATE_FILE"
}

backup_count() {
  find "$BACKUP_DIR" -maxdepth 1 -name 'veta-*.dump' -type f | wc -l | tr -d ' '
}

write_metrics() {
  mkdir -p "$METRICS_DIR"
  {
    echo "# TYPE veta_postgres_backup_last_success_timestamp_seconds gauge"
    echo "veta_postgres_backup_last_success_timestamp_seconds ${LAST_SUCCESS}"
    echo "# TYPE veta_postgres_backup_last_attempt_timestamp_seconds gauge"
    echo "veta_postgres_backup_last_attempt_timestamp_seconds ${LAST_ATTEMPT}"
    echo "# TYPE veta_postgres_backup_last_status gauge"
    echo "veta_postgres_backup_last_status ${LAST_STATUS}"
    echo "# TYPE veta_postgres_backup_last_size_bytes gauge"
    echo "veta_postgres_backup_last_size_bytes ${LAST_SIZE}"
    echo "# TYPE veta_postgres_backup_files gauge"
    echo "veta_postgres_backup_files $(backup_count)"
  } >"${METRICS_FILE}.tmp"
  mv "${METRICS_FILE}.tmp" "$METRICS_FILE"
}

prune() {
  now=$(date -u +%s)
  cutoff=$((BACKUP_RETENTION_DAYS * 86400))
  ls -1t "$BACKUP_DIR"/veta-*.dump 2>/dev/null | tail -n +$((BACKUP_MIN_KEEP + 1)) | while read -r file; do
    modified=$(stat -c %Y "$file")
    if [ $((now - modified)) -gt "$cutoff" ]; then
      rm -f "$file"
      log "pruned $(basename "$file")"
    fi
  done
}

run_backup() {
  read_state
  LAST_ATTEMPT=$(date -u +%s)
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="${BACKUP_DIR}/veta-${stamp}.dump"
  partial="${target}.partial"

  if pg_dump -Fc -f "$partial" && pg_restore --list "$partial" >/dev/null 2>&1 && [ -s "$partial" ]; then
    mv "$partial" "$target"
    LAST_SUCCESS=$LAST_ATTEMPT
    LAST_STATUS=1
    LAST_SIZE=$(stat -c %s "$target")
    log "wrote $(basename "$target") (${LAST_SIZE} bytes)"
    write_state
    prune
    write_metrics
    return 0
  fi

  rm -f "$partial"
  LAST_STATUS=0
  log "backup failed"
  write_state
  write_metrics
  return 1
}

is_due() {
  read_state
  now=$(date -u +%s)
  if [ "$LAST_STATUS" -eq 0 ] && [ "$LAST_ATTEMPT" -gt 0 ]; then
    [ $((now - LAST_ATTEMPT)) -ge "$BACKUP_RETRY_SECONDS" ]
    return
  fi
  age=$((now - LAST_SUCCESS))
  if [ "$LAST_SUCCESS" -eq 0 ] || [ "$age" -ge $((BACKUP_MAX_AGE_SECONDS + 14400)) ]; then
    return 0
  fi
  [ "$(date -u +%H)" = "$BACKUP_HOUR_UTC" ] && [ "$age" -ge "$BACKUP_MAX_AGE_SECONDS" ]
}

mkdir -p "$BACKUP_DIR" "$METRICS_DIR"

if [ "${BACKUP_ONCE:-0}" = "1" ]; then
  run_backup
  exit $?
fi

read_state
write_metrics
httpd -f -p "$BACKUP_METRICS_PORT" -h "$METRICS_DIR" &

while true; do
  if is_due; then
    run_backup || true
  fi
  sleep "$BACKUP_CHECK_SECONDS"
done
