#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost}"
TIMEOUT="${TIMEOUT:-180}"

probe() {
  local label="$1"
  local url="$2"
  local match="${3:-}"
  local deadline=$((SECONDS + TIMEOUT))
  while [[ $SECONDS -lt $deadline ]]; do
    local body
    body="$(curl -sS --max-time 5 "$url" 2>/dev/null || true)"
    if [[ -n "$body" ]]; then
      if [[ -z "$match" ]] || grep -q "$match" <<<"$body"; then
        echo "  [ok] $label"
        return 0
      fi
    fi
    sleep 2
  done
  echo "  [FAIL] $label did not become ready within ${TIMEOUT}s (last url=$url)"
  return 1
}

echo "Waiting for stack at $BASE_URL (timeout ${TIMEOUT}s per probe)..."

probe "traefik :80"          "$BASE_URL/"                                      ""
probe "frontend index"       "$BASE_URL/"                                      "<html"
probe "gateway /ready"       "$BASE_URL/api/gateway/ready"                     '"ready"'
probe "user-service /health" "$BASE_URL/api/gateway/api/user-service/health"   '"ok"'
probe "market-sim /health"   "$BASE_URL/api/gateway/api/market-sim/health"     '"ok"'

probe_internal() {
  local label="$1"
  local svc="$2"
  local url="$3"
  local match="$4"
  local deadline=$((SECONDS + TIMEOUT))
  local body="" rc=0 err=""
  while [[ $SECONDS -lt $deadline ]]; do
    rc=0
    body="$(docker compose -f compose.yml -f compose.gate.yml exec -T "$svc" \
      curl -sS --max-time 5 "$url" 2>/tmp/probe-internal.err)" || rc=$?
    if [[ $rc -eq 0 && -n "$body" ]] && grep -q "$match" <<<"$body"; then
      echo "  [ok] $label"
      return 0
    fi
    sleep 2
  done
  err="$(head -c 300 /tmp/probe-internal.err 2>/dev/null || true)"
  echo "  [FAIL] $label did not become ready within ${TIMEOUT}s (svc=$svc url=$url)"
  echo "         last attempt: exit=$rc bytes=${#body} stderr=${err:-<none>}"
  docker compose -f compose.yml -f compose.gate.yml ps "$svc" 2>/dev/null || true
  return 1
}

probe_internal "market-sim prices" market-sim "http://localhost:5000/prices" '"AAPL"'

echo "Stack is ready."
