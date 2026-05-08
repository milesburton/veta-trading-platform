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
    authorize_resp=$(
        VERIFIER="$verifier" CHALLENGE="$challenge" \
        OAUTH_CLIENT_ID="$OAUTH_CLIENT_ID" OAUTH_USERNAME="$OAUTH_USERNAME" OAUTH_PASSWORD="$OAUTH_PASSWORD" \
        python3 -c "
import json, os, sys, urllib.request
body = json.dumps({
    'client_id': os.environ['OAUTH_CLIENT_ID'],
    'username': os.environ['OAUTH_USERNAME'],
    'password': os.environ['OAUTH_PASSWORD'],
    'redirect_uri': 'postmessage',
    'response_type': 'code',
    'scope': 'openid profile',
    'code_challenge': os.environ['CHALLENGE'],
    'code_challenge_method': 'S256',
}).encode()
req = urllib.request.Request('$USER_SERVICE_URL/oauth/authorize', data=body, headers={'Content-Type': 'application/json'}, method='POST')
try:
    with urllib.request.urlopen(req, timeout=10) as r:
        sys.stdout.write(r.read().decode())
except urllib.error.HTTPError as e:
    sys.stderr.write(f'HTTP {e.code}: {e.read().decode()[:300]}\n')
    sys.exit(1)
" ) || fail "OAuth authorize failed (check user-service is reachable + credentials are correct)"

    code=$(printf '%s' "$authorize_resp" | python3 -c "import json, sys; print(json.load(sys.stdin)['code'])")
    log "Code acquired (expires in 60s); exchanging for access token"

    token_resp=$(
        VERIFIER="$verifier" CODE="$code" OAUTH_CLIENT_ID="$OAUTH_CLIENT_ID" \
        python3 -c "
import json, os, sys, urllib.request
body = json.dumps({
    'client_id': os.environ['OAUTH_CLIENT_ID'],
    'code': os.environ['CODE'],
    'grant_type': 'authorization_code',
    'redirect_uri': 'postmessage',
    'code_verifier': os.environ['VERIFIER'],
}).encode()
req = urllib.request.Request('$USER_SERVICE_URL/oauth/token', data=body, headers={'Content-Type': 'application/json'}, method='POST')
try:
    with urllib.request.urlopen(req, timeout=10) as r:
        sys.stdout.write(r.read().decode())
except urllib.error.HTTPError as e:
    sys.stderr.write(f'HTTP {e.code}: {e.read().decode()[:300]}\n')
    sys.exit(1)
" ) || fail "OAuth token exchange failed"

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

    docker compose --profile loadtest run --rm \
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
    docker compose -f compose.yml -f compose.prod.yml -f compose.loadtest.yml up -d gateway >/dev/null 2>&1 \
      || docker compose -f compose.yml -f compose.loadtest.yml up -d gateway >/dev/null 2>&1 \
      || fail "Could not apply load-test overlay (gateway recreate failed)"
    sleep 3
}

revert_loadtest_overlay() {
    if [[ "$DRY_RUN" = "1" ]]; then return 0; fi
    log "Reverting compose.loadtest.yml overlay (RATE_LIMIT_ENABLED back to default)"
    docker compose -f compose.yml -f compose.prod.yml up -d gateway >/dev/null 2>&1 \
      || docker compose -f compose.yml up -d gateway >/dev/null 2>&1 \
      || log "WARNING: gateway revert failed; check it manually"
}

trap revert_loadtest_overlay EXIT
apply_loadtest_overlay

for script in $SCENARIOS; do
    run_scenario "$script"
done

summarize

log "All done. Per-run JSON in $OUTPUT_DIR"
