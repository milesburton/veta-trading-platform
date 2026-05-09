#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/stacks/veta}"
REPO_URL="${REPO_URL:-https://github.com/milesburton/veta-trading-platform.git}"
REPO_REF="${REPO_REF:-main}"
GOOD_SHA_FILE="$STACK_DIR/.good-sha"
MAX_WAIT=180

CONFIG_PATHS=(
    "compose.yml"
    "compose.prod.yml"
    "compose.observability.yml"
    "compose.loadgen.yml"
    "compose.loadtest.yml"
    "traefik.yml"
    "observability/"
    "scripts/load.sh"
    "scripts/lib/"
    "scripts/loadgen/"
    "k6/"
)

cd "$STACK_DIR"

log() { echo "[veta-deploy] $(date -u +%H:%M:%S) $*"; }

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
        local out
        out=$(rsync -ai --delete "$src" "$dst" 2>&1 || true)
        if [[ -n "$out" ]]; then
            echo "$out" | sed 's/^/  /'
        fi
    done
}

CRITICAL_SERVICES="gateway oms ems risk-engine journal market-sim user-service"

log "Syncing config files from repo..."
sync_configs

# Compose files in load order (later overlays merge on top of earlier ones).
# - compose.yml: base service definitions
# - compose.prod.yml: homelab-specific overrides (image tags, Traefik labels)
# - compose.observability.yml: OTEL env vars for trace/metric/log emission
COMPOSE_FILES=(-f compose.yml -f compose.prod.yml -f compose.observability.yml)

log "Pulling latest images..."
docker compose "${COMPOSE_FILES[@]}" --profile trading pull \
    || log "⚠ pull returned non-zero (some images may be unavailable); continuing"

log "Restarting stack..."
# `up -d` exits non-zero if any service fails to start (e.g. unhealthy
# dependency). We tolerate that — the per-service verification below
# decides whether the deploy is actually broken.
docker compose "${COMPOSE_FILES[@]}" --profile trading up -d \
    || log "⚠ up -d returned non-zero; checking which services are actually up"

log "Waiting up to ${MAX_WAIT}s for critical services to be healthy..."
DEADLINE=$(( $(date +%s) + MAX_WAIT ))
while [[ $(date +%s) -lt $DEADLINE ]]; do
    UNHEALTHY=""
    for svc in $CRITICAL_SERVICES; do
        cid=$(docker compose "${COMPOSE_FILES[@]}" ps -q "$svc" 2>/dev/null | head -1)
        if [[ -z "$cid" ]]; then
            UNHEALTHY="$UNHEALTHY $svc(missing)"
            continue
        fi
        state=$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "no-healthcheck")
        if [[ "$state" != "healthy" && "$state" != "no-healthcheck" ]]; then
            UNHEALTHY="$UNHEALTHY $svc($state)"
        fi
    done
    if [[ -z "$UNHEALTHY" ]]; then
        # Snapshot live commit + record success.
        gateway_cid=$(docker compose "${COMPOSE_FILES[@]}" ps -q gateway | head -1)
        VERSION=$(docker exec "$gateway_cid" sh -c 'curl -sf http://localhost:5011/health' 2>/dev/null \
            | python3 -c "import sys,json; print(json.load(sys.stdin).get('version',''))" 2>/dev/null || echo "")
        if [[ -n "$VERSION" ]]; then
            log "✅ Live: ${VERSION:0:12}"
            printf '%s' "${VERSION:0:40}" > "$GOOD_SHA_FILE"
        else
            log "✅ Critical services healthy (gateway version not readable; .good-sha unchanged)"
        fi
        # Note any non-critical services that are unhealthy, for visibility.
        ALL_UNHEALTHY=$(docker compose "${COMPOSE_FILES[@]}" ps --format json 2>/dev/null \
            | python3 -c "
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        s = json.loads(line)
        if s.get('Health') and s['Health'] not in ('healthy',):
            print(f\"  - {s.get('Service','?')}: {s['Health']}\")
    except Exception:
        pass
" 2>/dev/null)
        if [[ -n "$ALL_UNHEALTHY" ]]; then
            log "ℹ Non-critical services in non-healthy state:"
            echo "$ALL_UNHEALTHY"
        fi
        exit 0
    fi
    sleep 5
done

log "❌ Critical services not healthy after ${MAX_WAIT}s:$UNHEALTHY"
log "  (skipping image-version rollback; rollback only triggers when ALL critical services fail)"
exit 1
