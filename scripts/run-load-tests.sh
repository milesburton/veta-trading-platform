#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_SERVICE_URL="${USER_SERVICE_URL:-http://localhost:5008}"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:5011}"
OAUTH_USERNAME="${OAUTH_USERNAME:-admin}"
OAUTH_PASSWORD="${OAUTH_PASSWORD:-veta-dev-passcode}"
OAUTH_CLIENT_ID="${OAUTH_CLIENT_ID:-veta-automation}"
OUTPUT_DIR="$REPO_ROOT/docs/site/src/data/loadtest"
SCENARIOS="${SCENARIOS:-baseline-limit.js mixed-strategy.js burst-open.js soak.js risk-stress.js}"
SOAK_DURATION="${SOAK_DURATION:-5m}"
SOAK_VUS="${SOAK_VUS:-25}"
DRY_RUN="${DRY_RUN:-0}"

log() { echo "[load-tests] $(date -u +%H:%M:%S) $*" >&2; }
fail() { echo "[load-tests] ERROR: $*" >&2; exit 1; }

require() {
    command -v "$1" >/dev/null 2>&1 || fail "$1 is required (install or add to PATH)"
}

require curl
require docker
require python3
require openssl

acquire_token() {
    local verifier challenge code authorize_resp token_resp access_token
    verifier="$(openssl rand -base64 64 | tr -d '=+/' | head -c 64)"
    challenge="$(printf '%s' "$verifier" | openssl dgst -sha256 -binary | openssl base64 | tr -d '=' | tr '/+' '_-')"

    log "Acquiring OAuth code for user '$OAUTH_USERNAME' against $USER_SERVICE_URL"

    local authorize_body token_body
    authorize_body=$(
        OAUTH_CLIENT_ID="$OAUTH_CLIENT_ID" OAUTH_USERNAME="$OAUTH_USERNAME" \
        OAUTH_PASSWORD="$OAUTH_PASSWORD" CHALLENGE="$challenge" \
        python3 -c "
import json, os
print(json.dumps({
    'client_id': os.environ['OAUTH_CLIENT_ID'],
    'username': os.environ['OAUTH_USERNAME'],
    'password': os.environ['OAUTH_PASSWORD'],
    'redirect_uri': 'postmessage',
    'response_type': 'code',
    'scope': 'openid profile',
    'code_challenge': os.environ['CHALLENGE'],
    'code_challenge_method': 'S256',
}))")

    authorize_resp=$(docker run --rm --network=veta_trading-net curlimages/curl:8.10.1 \
        -fsS -X POST "$USER_SERVICE_URL/oauth/authorize" \
        -H "Content-Type: application/json" \
        -d "$authorize_body" 2>&1) \
      || fail "OAuth authorize failed: $authorize_resp"

    code=$(printf '%s' "$authorize_resp" | python3 -c "import json, sys; print(json.load(sys.stdin)['code'])")
    log "Code acquired (expires in 60s); exchanging for access token"

    token_body=$(
        OAUTH_CLIENT_ID="$OAUTH_CLIENT_ID" CODE="$code" VERIFIER="$verifier" \
        python3 -c "
import json, os
print(json.dumps({
    'client_id': os.environ['OAUTH_CLIENT_ID'],
    'code': os.environ['CODE'],
    'grant_type': 'authorization_code',
    'redirect_uri': 'postmessage',
    'code_verifier': os.environ['VERIFIER'],
}))")

    token_resp=$(docker run --rm --network=veta_trading-net curlimages/curl:8.10.1 \
        -fsS -X POST "$USER_SERVICE_URL/oauth/token" \
        -H "Content-Type: application/json" \
        -d "$token_body" 2>&1) \
      || fail "OAuth token exchange failed: $token_resp"

    access_token=$(printf '%s' "$token_resp" | python3 -c "import json, sys; print(json.load(sys.stdin)['access_token'])")
    [[ -n "$access_token" ]] || fail "Empty access token in token response"
    log "Access token acquired"
    printf '%s' "$access_token"
}

run_scenario() {
    local script="$1"
    local label
    label="${script%.js}"
    log "▶ $script"

    if [[ "$DRY_RUN" = "1" ]]; then
        log "  (DRY_RUN=1; skipping actual run)"
        return 0
    fi

    local extra_env=()
    if [[ "$script" = "soak.js" ]]; then
        extra_env+=(-e "SOAK_DURATION=$SOAK_DURATION" -e "SOAK_VUS=$SOAK_VUS")
    fi

    K6_SCRIPT="$script" docker compose --profile loadtest run --rm \
        -e "K6_SCRIPT=$script" \
        -e "K6_TOKEN=$K6_TOKEN" \
        -e "RUN_LABEL=$label" \
        -e "BASE_URL=$GATEWAY_URL" \
        "${extra_env[@]}" \
        k6 \
        || fail "k6 run failed for $script (see output above + thresholdsBreached)"
    log "✓ $script complete"
}

summarize() {
    local date
    date="$(date -u +%Y-%m-%d)"
    log "Summary of today's runs ($date):"
    python3 - <<PY
import glob, json, os, sys

paths = sorted(glob.glob(f"$OUTPUT_DIR/$date-*.json"))
if not paths:
    print("  (no results files found in $OUTPUT_DIR)", file=sys.stderr)
    sys.exit(0)

print(f"{'scenario':<22} {'iter':>8} {'fail%':>7} {'p50ms':>8} {'p95ms':>8} {'p99ms':>8}  thresholds")
print("-" * 90)
for path in paths:
    with open(path) as f:
        d = json.load(f)
    label = os.path.basename(path).replace(f"$date-", "").replace(".json", "")
    sd = d.get("stages", {}).get("submitDurationMs") or {}
    fr = d.get("failureRate", 0) * 100
    breached = d.get("thresholdsBreached") or []
    breach_marker = "BREACHED " + ", ".join(breached) if breached else "ok"
    print(f"{label:<22} {d.get('iterations', 0):>8} {fr:>7.2f} {sd.get('p50','—'):>8} {sd.get('p95','—'):>8} {sd.get('p99','—'):>8}  {breach_marker}")
PY
}

cd "$REPO_ROOT"

if [[ -z "${K6_TOKEN:-}" ]]; then
    K6_TOKEN="$(acquire_token)"
fi
export K6_TOKEN

mkdir -p "$OUTPUT_DIR"

apply_loadtest_overlay() {
    if [[ "$DRY_RUN" = "1" ]]; then return 0; fi
    log "Applying compose.loadtest.yml overlay (RATE_LIMIT_ENABLED=false on gateway)"
    docker compose -f compose.yml -f compose.prod.yml -f compose.loadtest.yml up -d --force-recreate gateway 2>&1 | tail -3 \
      || docker compose -f compose.yml -f compose.loadtest.yml up -d --force-recreate gateway 2>&1 | tail -3 \
      || fail "Could not apply load-test overlay (gateway recreate failed)"
    log "Waiting up to 60s for gateway /health to return ok..."
    local deadline=$(( $(date +%s) + 60 ))
    while [[ $(date +%s) -lt $deadline ]]; do
        if curl -fsS -m 2 "${USER_SERVICE_URL%/*}/gateway/health" >/dev/null 2>&1 \
           || curl -fsS -m 2 "${GATEWAY_URL}/health" >/dev/null 2>&1; then
            log "Gateway ready"
            return 0
        fi
        sleep 2
    done
    log "WARNING: gateway readiness probe didn't succeed in 60s; continuing anyway"
}

revert_loadtest_overlay() {
    if [[ "$DRY_RUN" = "1" ]]; then return 0; fi
    log "Reverting compose.loadtest.yml overlay (RATE_LIMIT_ENABLED back to default)"
    docker compose -f compose.yml -f compose.prod.yml up -d --force-recreate gateway >/dev/null 2>&1 \
      || docker compose -f compose.yml up -d --force-recreate gateway >/dev/null 2>&1 \
      || log "WARNING: gateway revert failed; check it manually"
}

trap revert_loadtest_overlay EXIT
apply_loadtest_overlay

for script in $SCENARIOS; do
    run_scenario "$script"
done

summarize

log "All done. Per-run JSON in $OUTPUT_DIR"
