#!/usr/bin/env bash
# Alert handler for veta-synthetic-probe failures.
# Invoked via systemd OnFailure= when veta-synthetic-probe.service exits
# non-zero. Maintains a counter in $STATE_DIR/consecutive_failures so we
# alert on the Nth failure (default 3) and again on recovery, but not on
# every individual failure.
#
# Notification delivery is via webhook — set ALERT_WEBHOOK_URL in the
# systemd service env. If unset, the script logs to journald only.

set -euo pipefail

STATE_DIR="${STATE_DIR:-/var/lib/veta-probe}"
COUNTER_FILE="${STATE_DIR}/consecutive_failures"
FAIL_THRESHOLD="${FAIL_THRESHOLD:-3}"
WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"

mkdir -p "$STATE_DIR"

log() { echo "[probe-alert] $(date -Iseconds) $*"; }

post_webhook() {
  local payload="$1"
  if [[ -z "$WEBHOOK_URL" ]]; then
    log "ALERT_WEBHOOK_URL unset; alert dropped: $payload"
    return 0
  fi
  if ! curl -sS --max-time 10 -X POST -H "Content-Type: application/json" \
      -d "$payload" "$WEBHOOK_URL" > /dev/null; then
    log "webhook POST failed (network?); alert lost"
  fi
}

case "${1:-failure}" in
  failure)
    count=0
    [[ -f "$COUNTER_FILE" ]] && count=$(cat "$COUNTER_FILE")
    count=$((count + 1))
    echo "$count" > "$COUNTER_FILE"
    log "probe failed (consecutive=$count)"
    if [[ "$count" -eq "$FAIL_THRESHOLD" ]]; then
      log "threshold reached — sending alert"
      hostname=$(hostname -f 2>/dev/null || hostname)
      payload=$(cat <<EOF
{
  "service": "veta-synthetic-probe",
  "alert": "veta.mnetcs.com probe failing",
  "consecutive_failures": $count,
  "host": "$hostname",
  "ts": "$(date -Iseconds)",
  "hint": "journalctl -u veta-synthetic-probe.service -n 20"
}
EOF
)
      post_webhook "$payload"
    fi
    ;;
  recovery)
    if [[ -f "$COUNTER_FILE" ]]; then
      prev=$(cat "$COUNTER_FILE")
      if [[ "$prev" -ge "$FAIL_THRESHOLD" ]]; then
        log "recovered after $prev failures"
        hostname=$(hostname -f 2>/dev/null || hostname)
        payload=$(cat <<EOF
{
  "service": "veta-synthetic-probe",
  "alert": "veta.mnetcs.com probe RECOVERED",
  "after_failures": $prev,
  "host": "$hostname",
  "ts": "$(date -Iseconds)"
}
EOF
)
        post_webhook "$payload"
      fi
    fi
    rm -f "$COUNTER_FILE"
    ;;
  *)
    log "unknown mode: ${1:-}"
    exit 2
    ;;
esac
