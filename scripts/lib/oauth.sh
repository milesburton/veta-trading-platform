#!/usr/bin/env bash
# OAuth PKCE token acquisition for VETA user-service.
# Source this file; do not execute directly.
#
# Required env (with defaults):
#   USER_SERVICE_URL   default http://localhost:5008
#   OAUTH_USERNAME     default admin
#   OAUTH_PASSWORD     default veta-dev-passcode
#   OAUTH_CLIENT_ID    default veta-automation
#
# Optional env:
#   OAUTH_DOCKER_NETWORK   if set, uses curlimages/curl in this network
#                          (e.g. veta_trading-net). Otherwise uses host curl.

oauth_log() { echo "[oauth] $(date -u +%H:%M:%S) $*" >&2; }
oauth_fail() { echo "[oauth] ERROR: $*" >&2; return 1; }

oauth_curl() {
  if [[ -n "${OAUTH_DOCKER_NETWORK:-}" ]]; then
    docker run --rm --network="$OAUTH_DOCKER_NETWORK" curlimages/curl:8.10.1 "$@"
  else
    curl "$@"
  fi
}

oauth_acquire_token() {
  local user_service="${USER_SERVICE_URL:-http://localhost:5008}"
  local username="${OAUTH_USERNAME:-admin}"
  local password="${OAUTH_PASSWORD:-veta-dev-passcode}"
  local client_id="${OAUTH_CLIENT_ID:-veta-automation}"

  local verifier challenge
  verifier="$(openssl rand -base64 64 | tr -d '=+/' | head -c 64)"
  challenge="$(printf '%s' "$verifier" | openssl dgst -sha256 -binary | openssl base64 | tr -d '=' | tr '/+' '_-')"

  local authorize_body token_body authorize_resp token_resp code access_token

  authorize_body=$(
    OAUTH_CLIENT_ID="$client_id" OAUTH_USERNAME="$username" \
    OAUTH_PASSWORD="$password" CHALLENGE="$challenge" \
    python3 -c '
import json, os
print(json.dumps({
    "client_id": os.environ["OAUTH_CLIENT_ID"],
    "username": os.environ["OAUTH_USERNAME"],
    "password": os.environ["OAUTH_PASSWORD"],
    "redirect_uri": "postmessage",
    "response_type": "code",
    "scope": "openid profile",
    "code_challenge": os.environ["CHALLENGE"],
    "code_challenge_method": "S256",
}))')

  authorize_resp=$(oauth_curl -fsS -X POST "$user_service/oauth/authorize" \
    -H "Content-Type: application/json" -d "$authorize_body" 2>&1) \
    || { oauth_fail "authorize failed: $authorize_resp"; return 1; }

  code=$(printf '%s' "$authorize_resp" | python3 -c 'import json, sys; print(json.load(sys.stdin)["code"])' 2>/dev/null) \
    || { oauth_fail "could not parse authorize response: $authorize_resp"; return 1; }

  token_body=$(
    OAUTH_CLIENT_ID="$client_id" CODE="$code" VERIFIER="$verifier" \
    python3 -c '
import json, os
print(json.dumps({
    "client_id": os.environ["OAUTH_CLIENT_ID"],
    "code": os.environ["CODE"],
    "grant_type": "authorization_code",
    "redirect_uri": "postmessage",
    "code_verifier": os.environ["VERIFIER"],
}))')

  token_resp=$(oauth_curl -fsS -X POST "$user_service/oauth/token" \
    -H "Content-Type: application/json" -d "$token_body" 2>&1) \
    || { oauth_fail "token exchange failed: $token_resp"; return 1; }

  access_token=$(printf '%s' "$token_resp" | python3 -c 'import json, sys; print(json.load(sys.stdin)["access_token"])' 2>/dev/null) \
    || { oauth_fail "could not parse token response: $token_resp"; return 1; }

  [[ -n "$access_token" ]] || { oauth_fail "empty access token"; return 1; }
  printf '%s' "$access_token"
}
