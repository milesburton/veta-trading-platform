#!/bin/sh
# Continuous soak runner: runs soak.js back-to-back, reading a fresh token
# from $TOKEN_FILE between each run. soak.js takes its token from K6_TOKEN
# (read once at setup), so we restart the run periodically to pick up rotation.

set -eu

TOKEN_FILE="${TOKEN_FILE:-/loadgen/token}"
BASE_URL="${BASE_URL:-http://gateway:5011}"
SOAK_SCRIPT="${SOAK_SCRIPT:-/scripts/soak.js}"
SOAK_DURATION="${SOAK_DURATION:-50m}"
SOAK_VUS="${SOAK_VUS:-50}"
LOADGEN_ANNOUNCE_TOKEN="${LOADGEN_ANNOUNCE_TOKEN:-}"
RUNNER_NAME="${LOADGEN_RUNNER_NAME:-soak}"
MAX_RUNTIME_MIN="${LOADGEN_MAX_RUNTIME_MIN:-720}"
STARTED_AT="$(date +%s)"

log() { echo "[soak] $(date -u +%H:%M:%S) $*"; }

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

# Fire stop announcement on SIGTERM (compose down) or SIGINT (Ctrl+C).
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

announce start "vus=$SOAK_VUS, duration=$SOAK_DURATION"

while true; do
  if [ "$MAX_RUNTIME_MIN" -gt 0 ]; then
    elapsed_min=$(( ( $(date +%s) - STARTED_AT ) / 60 ))
    if [ "$elapsed_min" -ge "$MAX_RUNTIME_MIN" ]; then
      log "max runtime ${MAX_RUNTIME_MIN}m reached; stopping (set LOADGEN_MAX_RUNTIME_MIN=0 to disable)"
      announce stop "max runtime ${MAX_RUNTIME_MIN}m reached"
      exit 0
    fi
  fi
  TOKEN=$(cat "$TOKEN_FILE")
  log "▶ soak (vus=$SOAK_VUS, duration=$SOAK_DURATION)"
  K6_NO_THRESHOLDS=true \
  K6_NO_SUMMARY=true \
  BASE_URL="$BASE_URL" \
  K6_TOKEN="$TOKEN" \
  SOAK_VUS="$SOAK_VUS" \
  SOAK_DURATION="$SOAK_DURATION" \
  RUN_LABEL=continuous-soak \
  k6 run \
    --quiet \
    --no-summary \
    --out experimental-prometheus-rw \
    --tag run_mode=continuous \
    "$SOAK_SCRIPT" \
    || log "soak run exited non-zero; restarting in 10s"
  sleep 10
done
