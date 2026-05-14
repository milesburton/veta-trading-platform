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
    "compose.swarm.yml"
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
# - compose.loadgen.yml: ONLY included when .env.loadgen exists (otherwise
#   compose interpolation fails on ${LOADGEN_OAUTH_PASSWORD:?...}).
#   Also disables gateway rate limiting so the load gen isn't 429'd.
COMPOSE_FILES=(-f compose.yml -f compose.prod.yml -f compose.observability.yml)
PROFILES=(--profile trading)
LOADGEN_ENV_FILE="$STACK_DIR/.env.loadgen"
if [[ -f "$LOADGEN_ENV_FILE" ]]; then
    log "Loadgen credentials present — including compose.loadgen.yml"
    COMPOSE_FILES+=(-f compose.loadgen.yml)
    PROFILES+=(--profile loadgen)
    set -a
    # shellcheck disable=SC1090
    . "$LOADGEN_ENV_FILE"
    set +a
fi

log "Pulling latest images..."
docker compose "${COMPOSE_FILES[@]}" "${PROFILES[@]}" pull \
    || log "⚠ pull returned non-zero (some images may be unavailable); continuing"

# Horizontal scale — gateway is the CPU bottleneck. Override via env at
# deploy time: GATEWAY_REPLICAS=3 /opt/stacks/veta/deploy.sh
GATEWAY_REPLICAS="${GATEWAY_REPLICAS:-1}"

# Pre-clean: remove any <12hex>_<container> orphans left by a previous
# failed `up -d` recreate. These appear when Docker can't remove the old
# container fast enough before creating the replacement and renames the
# stale one out of the way. Future deploys then fail to recreate cleanly
# until they're gone.
ORPHANS=$(docker ps -a --format "{{.Names}}" | grep -E "^[0-9a-f]{12}_veta-" || true)
if [[ -n "$ORPHANS" ]]; then
    log "Cleaning up $(echo "$ORPHANS" | wc -l) orphan container(s) from a previous failed recreate..."
    echo "$ORPHANS" | xargs -r docker rm -f >/dev/null 2>&1 || true
fi

log "Restarting stack (gateway replicas=$GATEWAY_REPLICAS)..."
# `up -d` exits non-zero if any service fails to start (e.g. unhealthy
# dependency, or the Docker daemon race condition where remove/create
# overlap on container names during a recreate). We retry once after a
# short pause — most race-induced failures clear within seconds.
if ! docker compose "${COMPOSE_FILES[@]}" "${PROFILES[@]}" up -d \
        --scale "gateway=$GATEWAY_REPLICAS"; then
    log "⚠ up -d returned non-zero — pausing 10s and retrying once"
    sleep 10
    # Re-clean orphans in case the failed up created new ones
    ORPHANS=$(docker ps -a --format "{{.Names}}" | grep -E "^[0-9a-f]{12}_veta-" || true)
    if [[ -n "$ORPHANS" ]]; then
        echo "$ORPHANS" | xargs -r docker rm -f >/dev/null 2>&1 || true
    fi
    docker compose "${COMPOSE_FILES[@]}" "${PROFILES[@]}" up -d \
        --scale "gateway=$GATEWAY_REPLICAS" \
        || log "⚠ retry also returned non-zero; per-service verification will decide"
fi

# Observability (LGTM) is a separate compose project. Recreate it so config
# changes in observability/docker-compose.lgtm.yml take effect — e.g.
# Grafana's sub-path env + Traefik labels for the public /grafana route.
if [[ -f "$STACK_DIR/observability/docker-compose.lgtm.yml" ]]; then
    log "Updating observability (LGTM) stack..."
    (cd "$STACK_DIR/observability" && \
        docker compose -f docker-compose.lgtm.yml up -d 2>&1 | sed 's/^/  /') \
        || log "⚠ observability up -d returned non-zero; continuing"
fi

log "Waiting up to ${MAX_WAIT}s for critical services to be healthy..."
DEADLINE=$(( $(date +%s) + MAX_WAIT ))
while [[ $(date +%s) -lt $DEADLINE ]]; do
    UNHEALTHY=""
    for svc in $CRITICAL_SERVICES; do
        # Check ALL replicas, not just the first — a partial scale-out
        # where some replicas are unhealthy should fail the deploy.
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
        # Fail the deploy if any service was created but never started.
        # This is the signature of the recreate race (orphan + Conflict),
        # which used to pass the critical-services-only check because
        # gateway/journal/etc. happened to survive.
        STUCK_CREATED=$(docker compose "${COMPOSE_FILES[@]}" ps -a --format '{{.Service}}|{{.State}}' 2>/dev/null \
            | awk -F'|' '$2 == "created" { print $1 }' \
            | tr '\n' ' ')
        if [[ -n "$STUCK_CREATED" ]]; then
            log "❌ Services in 'created' state (recreate race?):$STUCK_CREATED"
            log "   try: docker ps -a | grep '^[0-9a-f]\\{12\\}_veta-' && docker compose up -d"
            exit 1
        fi

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
