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

log() { echo "[soak] $(date -u +%H:%M:%S) $*"; }

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

while true; do
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
