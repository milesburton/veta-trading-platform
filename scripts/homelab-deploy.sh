#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/stacks/veta}"
REPO_URL="${REPO_URL:-https://github.com/milesburton/veta-trading-platform.git}"
REPO_REF="${REPO_REF:-main}"
REGISTRY="ghcr.io/milesburton/veta-trading-platform"
GOOD_SHA_FILE="$STACK_DIR/.good-sha"
SERVICES="frontend market-sim ems oms limit-algo twap-algo pov-algo vwap-algo iceberg-algo sniper-algo arrival-price-algo momentum-algo is-algo observability user-service journal fix-exchange fix-gateway fix-archive analytics market-data market-data-adapters feature-engine signal-engine recommendation-engine scenario-engine llm-advisory news-aggregator gateway dark-pool ccp-service rfq-service"
HEALTH_URL="http://localhost/health"
MAX_WAIT=180

CONFIG_PATHS=(
    "compose.yml"
    "compose.prod.yml"
    "compose.observability.yml"
    "traefik.yml"
    "observability/"
)

cd "$STACK_DIR"

log() { echo "[veta-deploy] $(date -u +%H:%M:%S) $*"; }

sync_configs() {
    local checkout_dir
    checkout_dir=$(mktemp -d)
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
        local out
        out=$(rsync -ai --delete "$src" "$dst" 2>&1 || true)
        if [[ -n "$out" ]]; then
            echo "$out" | sed 's/^/  /'
        fi
    done
}

log "Syncing config files from repo..."
sync_configs

log "Pulling latest images..."
docker compose -f compose.yml -f compose.prod.yml --profile trading pull

log "Restarting stack..."
docker compose -f compose.yml -f compose.prod.yml --profile trading up -d

log "Waiting up to ${MAX_WAIT}s for gateway health..."
DEADLINE=$(( $(date +%s) + MAX_WAIT ))
while [[ $(date +%s) -lt $DEADLINE ]]; do
    VERSION=$(curl -sf "$HEALTH_URL" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('version',''))" 2>/dev/null || echo "")
    LATEST=$(docker inspect "${REGISTRY}/gateway:latest" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null | cut -c1-40 || echo "")
    if [[ -n "$VERSION" && -n "$LATEST" && "$VERSION" == "$LATEST" ]]; then
        log "✅ Live: $VERSION"
        echo "${VERSION:0:7}" > "$GOOD_SHA_FILE"
        exit 0
    fi
    sleep 5
done

PREV=$(cat "$GOOD_SHA_FILE" 2>/dev/null || echo "")
if [[ -z "$PREV" ]]; then
    log "❌ Health check failed and no previous good SHA recorded — manual intervention required"
    exit 1
fi

log "❌ Health check failed — rolling back to $PREV..."
cp compose.prod.yml compose.prod.yml.bak
for SVC in $SERVICES; do
    sed -i "s|$REGISTRY/$SVC:latest|$REGISTRY/$SVC:$PREV|g" compose.prod.yml
done
docker compose -f compose.yml -f compose.prod.yml --profile trading pull
docker compose -f compose.yml -f compose.prod.yml --profile trading up -d
log "⏪ Rolled back to $PREV"
exit 1
