#!/bin/sh
# Continuous matrix runner: cycles baseline → mixed → burst-open → risk-stress
# forever. Reads token from $TOKEN_FILE on each iteration.
# Designed to run inside the grafana/k6 image (Alpine /bin/sh, no bash).

set -eu

TOKEN_FILE="${TOKEN_FILE:-/loadgen/token}"
BASE_URL="${BASE_URL:-http://gateway:5011}"
SCENARIOS="${SCENARIOS:-baseline-limit.js mixed-strategy.js burst-open.js risk-stress.js}"
SLEEP_BETWEEN="${SLEEP_BETWEEN:-30}"
LOADGEN_ANNOUNCE_TOKEN="${LOADGEN_ANNOUNCE_TOKEN:-}"
RUNNER_NAME="${LOADGEN_RUNNER_NAME:-matrix}"
MAX_RUNTIME_MIN="${LOADGEN_MAX_RUNTIME_MIN:-720}"
STARTED_AT="$(date +%s)"

log() { echo "[matrix] $(date -u +%H:%M:%S) $*"; }

announce() {
  event="$1"
  note="${2:-}"
  if [ -z "$LOADGEN_ANNOUNCE_TOKEN" ]; then return 0; fi
  body=$(printf '{"event":"%s","runner":"%s","note":"%s"}' "$event" "$RUNNER_NAME" "$note")
  # k6 image ships busybox wget, not curl. -q silences output, -O- discards
  # the response body, --post-data is the busybox POST form.
  wget -q -O- --timeout=5 \
    --header="Content-Type: application/json" \
    --header="X-Loadgen-Token: $LOADGEN_ANNOUNCE_TOKEN" \
    --post-data="$body" \
    "$BASE_URL/loadgen-announce" >/dev/null 2>&1 || \
    log "loadgen-announce failed (continuing)"
}

trap 'announce stop "container stopping"; exit 0' TERM INT

wait_for_token() {
  i=0
  while [ ! -s "$TOKEN_FILE" ]; do
    if [ "$i" -ge 60 ]; then
      log "token never appeared at $TOKEN_FILE; exiting"
      exit 1
    fi
    log "waiting for token..."
    sleep 5
    i=$((i + 5))
  done
}

wait_for_token

announce start "scenarios=$SCENARIOS"

while true; do
  if [ "$MAX_RUNTIME_MIN" -gt 0 ]; then
    elapsed_min=$(( ( $(date +%s) - STARTED_AT ) / 60 ))
    if [ "$elapsed_min" -ge "$MAX_RUNTIME_MIN" ]; then
      log "max runtime ${MAX_RUNTIME_MIN}m reached; stopping (set LOADGEN_MAX_RUNTIME_MIN=0 to disable)"
      announce stop "max runtime ${MAX_RUNTIME_MIN}m reached"
      exit 0
    fi
  fi
  for script in $SCENARIOS; do
    if [ ! -f "/scripts/$script" ]; then
      log "missing /scripts/$script — skipping"
      continue
    fi
    TOKEN=$(cat "$TOKEN_FILE")
    log "▶ $script"
    K6_NO_THRESHOLDS=true \
    K6_NO_SUMMARY=true \
    BASE_URL="$BASE_URL" \
    K6_TOKEN="$TOKEN" \
    RUN_LABEL="continuous-${script%.js}" \
    k6 run \
      --quiet \
      --no-summary \
      --out experimental-prometheus-rw \
      --tag run_mode=continuous \
      "/scripts/$script" \
      || log "$script exited non-zero — continuing loop"
    log "✓ $script complete; sleeping ${SLEEP_BETWEEN}s"
    sleep "$SLEEP_BETWEEN"
  done
done
