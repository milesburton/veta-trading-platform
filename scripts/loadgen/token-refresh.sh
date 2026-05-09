#!/usr/bin/env bash
# Continuous OAuth token refresh sidecar.
# Writes the current access token to $TOKEN_FILE and refreshes every $REFRESH_INTERVAL.
# k6 containers read $TOKEN_FILE on each iteration.

set -euo pipefail

REFRESH_INTERVAL="${REFRESH_INTERVAL:-3000}"
TOKEN_FILE="${TOKEN_FILE:-/loadgen/token}"

# Library is mounted at /scripts/lib/oauth.sh
# shellcheck source=/dev/null
. /scripts/lib/oauth.sh

mkdir -p "$(dirname "$TOKEN_FILE")"

log() { echo "[token-refresh] $(date -u +%H:%M:%S) $*"; }

while true; do
  if token=$(oauth_acquire_token); then
    printf '%s' "$token" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
    log "refreshed token (length=${#token}, next refresh in ${REFRESH_INTERVAL}s)"
  else
    log "refresh FAILED — leaving previous token in place"
  fi
  sleep "$REFRESH_INTERVAL"
done
