#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/stacks/veta-uat}"
REPO_URL="${REPO_URL:-https://github.com/milesburton/veta-trading-platform.git}"
REPO_REF="${REPO_REF:-main}"
GOOD_SHA_FILE="$STACK_DIR/.good-sha"
MAX_WAIT=180

CONFIG_PATHS=(
  "compose.yml"
  "compose.uat.yml"
  "compose.observability.yml"
  "traefik.uat.yml"
  "observability/"
)

cd "$STACK_DIR"

log() { echo "[uat-deploy] $(date -u +%H:%M:%S) $*"; }

sync_configs() {
  local checkout_dir
  checkout_dir=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf '$checkout_dir'" RETURN

  log "Fetching $REPO_REF from $REPO_URL..."
  git clone --depth 1 --branch "$REPO_REF" --filter=blob:none "$REPO_URL" "$checkout_dir" >/dev/null 2>&1

  for path in "${CONFIG_PATHS[@]}"; do
    local src="$checkout_dir/$path"
    local dst="$STACK_DIR/$path"
    if [[ ! -e "$src" ]]; then
      log "  skip $path (not in repo)"
      continue
    fi
    mkdir -p "$(dirname "$dst")"
    rsync -ai --delete "$src" "$dst" 2>&1 | sed 's/^/  /' || true
  done
}

CRITICAL_SERVICES="gateway oms ems risk-engine journal market-sim user-service"

log "Syncing config files from repo..."
sync_configs

COMPOSE_FILES=(-f compose.yml -f compose.uat.yml -f compose.observability.yml)
PROFILES=(--profile trading)

log "Pulling latest images..."
docker compose "${COMPOSE_FILES[@]}" "${PROFILES[@]}" pull \
  || log "⚠ pull returned non-zero; continuing"

ORPHANS=$(docker ps -a --format "{{.Names}}" | grep -E "^[0-9a-f]{12}_veta-uat-" || true)
if [[ -n "$ORPHANS" ]]; then
  log "Cleaning up $(echo "$ORPHANS" | wc -l) orphan container(s)..."
  echo "$ORPHANS" | xargs -r docker rm -f >/dev/null 2>&1 || true
fi

log "Restarting UAT stack..."
if ! docker compose "${COMPOSE_FILES[@]}" "${PROFILES[@]}" up -d; then
  log "⚠ up -d returned non-zero — pausing 10s and retrying once"
  sleep 10
  ORPHANS=$(docker ps -a --format "{{.Names}}" | grep -E "^[0-9a-f]{12}_veta-uat-" || true)
  if [[ -n "$ORPHANS" ]]; then
    echo "$ORPHANS" | xargs -r docker rm -f >/dev/null 2>&1 || true
  fi
  docker compose "${COMPOSE_FILES[@]}" "${PROFILES[@]}" up -d \
    || log "⚠ retry also returned non-zero; per-service verification will decide"
fi

log "Waiting up to ${MAX_WAIT}s for critical services to be healthy..."
DEADLINE=$(( $(date +%s) + MAX_WAIT ))
while [[ $(date +%s) -lt $DEADLINE ]]; do
  UNHEALTHY=""
  for svc in $CRITICAL_SERVICES; do
    cids=$(docker compose "${COMPOSE_FILES[@]}" ps -q "$svc" 2>/dev/null)
    if [[ -z "$cids" ]]; then
      UNHEALTHY="$UNHEALTHY $svc(missing)"
      continue
    fi
    for cid in $cids; do
      state=$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "no-healthcheck")
      if [[ "$state" != "healthy" && "$state" != "no-healthcheck" ]]; then
        UNHEALTHY="$UNHEALTHY $svc:${cid:0:8}($state)"
      fi
    done
  done
  if [[ -z "$UNHEALTHY" ]]; then
    STUCK_CREATED=$(docker compose "${COMPOSE_FILES[@]}" ps -a --format '{{.Service}}|{{.State}}' 2>/dev/null \
      | awk -F'|' '$2 == "created" { print $1 }' \
      | tr '\n' ' ')
    if [[ -n "$STUCK_CREATED" ]]; then
      log "❌ Services in 'created' state:$STUCK_CREATED"
      exit 1
    fi

    gateway_cid=$(docker compose "${COMPOSE_FILES[@]}" ps -q gateway | head -1)
    VERSION=$(docker exec "$gateway_cid" sh -c 'curl -sf http://localhost:5011/health' 2>/dev/null \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('version',''))" 2>/dev/null || echo "")
    if [[ -n "$VERSION" ]]; then
      log "✅ Live: ${VERSION:0:12}"
      printf '%s' "${VERSION:0:40}" > "$GOOD_SHA_FILE"
    else
      log "✅ Critical services healthy"
    fi
    exit 0
  fi
  sleep 5
done

log "❌ Critical services not healthy after ${MAX_WAIT}s:$UNHEALTHY"
exit 1
