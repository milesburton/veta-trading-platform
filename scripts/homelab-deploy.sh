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

check_ownership() {
    # rsync as the deploying user cannot overwrite files owned by other
    # users; the failure mode is silent per-file errors that the previous
    # `2>&1 || true` swallowed. The 2026-05-16 LGTM-deploy incident was
    # caused by /opt/stacks/veta/observability/ being root-owned from an
    # earlier setup, leaving the auto-pull unable to sync compose changes
    # for ~3 days.
    local foreign
    foreign=$(find "$STACK_DIR" -not -user "$(id -un)" 2>/dev/null | head -10)
    if [[ -n "$foreign" ]]; then
        log "❌ ERROR: files in $STACK_DIR are not owned by $(id -un):"
        echo "$foreign" | sed 's/^/  /'
        log "  Fix: sudo chown -R $(id -un):$(id -un) $STACK_DIR"
        return 1
    fi
}

sync_configs() {
    local checkout_dir
    checkout_dir=$(mktemp -d)
    # shellcheck disable=SC2064
    trap "rm -rf '$checkout_dir'" RETURN

    log "Fetching $REPO_REF from $REPO_URL..."
    git clone --depth 1 --branch "$REPO_REF" --filter=blob:none "$REPO_URL" "$checkout_dir" >/dev/null 2>&1

    local any_error=0
    for path in "${CONFIG_PATHS[@]}"; do
        local src="$checkout_dir/$path"
        local dst="$STACK_DIR/$path"
        if [[ ! -e "$src" ]]; then
            log "  skip $path (not in repo)"
            continue
        fi
        mkdir -p "$(dirname "$dst")"
        local out
        local rc
        out=$(rsync -ai --delete "$src" "$dst" 2>&1)
        rc=$?
        if [[ -n "$out" ]]; then
            echo "$out" | sed 's/^/  /'
        fi
        if [[ $rc -ne 0 ]]; then
            log "  ❌ rsync $path failed with exit $rc"
            any_error=1
            continue
        fi
        # Detect partial-failure (permission denied) lines that rsync prints
        # to stderr but masks behind exit 0 when other files in the same
        # transfer succeeded.
        if echo "$out" | grep -qE "Permission denied|failed: Permission"; then
            log "  ❌ rsync $path reported permission errors (see above)"
            any_error=1
        fi
    done
    return $any_error
}

CRITICAL_SERVICES="gateway oms ems risk-engine journal market-sim user-service"

log "Checking ownership of $STACK_DIR..."
if ! check_ownership; then
    exit 1
fi

log "Syncing config files from repo..."
if ! sync_configs; then
    log "❌ Config sync failed; aborting deploy. Investigate the rsync errors above."
    exit 1
fi

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

# Detect bind-mount drift on single-file mounts and restart the affected
# container so the new inode takes effect. `docker compose up -d` only
# recreates a container when the *service definition* changes — not
# when a bind-mounted single file is replaced. rsync atomic-replaces
# the file with a new inode, which the container's mount can't follow,
# so the container silently keeps serving the old content.
#
# Input is an associative array. Each entry's key is the host-relative
# path; the value is "<container-or-service>:<in-container-path>".
# The resolver tries the literal name first (works for services that
# set `container_name:` explicitly), then falls back to compose service
# resolution (`docker compose ps -q <svc>`), which handles the default
# `<project>_<service>_<n>` form.
#
# 2026-05-20: disk-monitor.py was stale by this exact mechanism —
# the new /metrics-serving script was on the host but the container
# had the old single-handler version, so Prometheus scrape silently
# failed and the disk fill went undetected. See PR #309 for the
# original observability-stack fix.
resolve_container() {
    local name="$1"
    # Direct hit: explicit container_name or already-running ID/name.
    if docker inspect "$name" >/dev/null 2>&1; then
        echo "$name"
        return 0
    fi
    # Compose-service form: ask compose for the running container ID.
    local cid
    cid=$(docker compose "${COMPOSE_FILES[@]}" ps -q "$name" 2>/dev/null | head -1)
    if [[ -n "$cid" ]]; then
        echo "$cid"
        return 0
    fi
    return 1
}

check_bind_mount_drift() {
    local -n drift_map=$1
    local -A restart_needed=()
    for host_rel in "${!drift_map[@]}"; do
        local host_file="$STACK_DIR/$host_rel"
        [[ -f "$host_file" ]] || continue
        local target="${drift_map[$host_rel]}"
        local container_ref="${target%%:*}"
        local in_container="${target#*:}"
        local container
        if ! container=$(resolve_container "$container_ref"); then
            log "  ⚠ $host_rel: no running container matches '$container_ref' — skipping drift check"
            continue
        fi
        local host_sum cont_sum
        host_sum=$(sha256sum "$host_file" | awk '{print $1}')
        cont_sum=$(docker exec "$container" sha256sum "$in_container" 2>/dev/null | awk '{print $1}')
        if [[ -n "$cont_sum" && "$host_sum" != "$cont_sum" ]]; then
            log "  ⚠ $host_rel differs from $container_ref view — bind-mount went stale"
            restart_needed["$container"]=1
        fi
    done
    if [[ ${#restart_needed[@]} -gt 0 ]]; then
        log "  restarting ${#restart_needed[@]} container(s) to pick up new mount inodes: ${!restart_needed[*]}"
        for container in "${!restart_needed[@]}"; do
            docker restart "$container" >/dev/null \
                && log "    ✅ restarted $container" \
                || log "    ❌ failed to restart $container"
        done
    fi
}

# Single-file bind mounts in the main veta stack. The key on the right
# is whatever resolve_container() can find: an explicit container_name
# (disk-monitor sets one) or a compose service name (traefik doesn't).
declare -A VETA_BIND_MOUNTS=(
    ["scripts/disk-monitor.py"]="veta-disk-monitor:/scripts/disk-monitor.py"
    ["traefik.yml"]="traefik:/traefik.yml"
)
check_bind_mount_drift VETA_BIND_MOUNTS

# Observability (LGTM) is a separate compose project. Recreate it so config
# changes in observability/docker-compose.lgtm.yml take effect — e.g.
# Grafana's sub-path env + Traefik labels for the public /grafana route.
if [[ -f "$STACK_DIR/observability/docker-compose.lgtm.yml" ]]; then
    # Docker compose loads .env from the project directory (which is
    # observability/), so it doesn't see the parent stack's
    # DISCORD_WEBHOOK_URL / ALERT_WEBHOOK_URL by default. Symlink the
    # parent .env into the observability dir so compose-time variable
    # interpolation pulls those values through. Before this symlink
    # existed (2026-05-20 disk-fill postmortem), Grafana's Discord
    # contact point resolved to the REPLACE_ME sentinel and silently
    # dropped every alert.
    # `-e` is false for a broken symlink, so a previous run that left a
    # stale symlink would re-enter the branch and `ln -s` would fail
    # with "File exists". `ln -sfn` replaces whatever's there
    # (file, broken symlink, correct symlink) atomically, and -n stops
    # ln from descending into a target dir if .env happens to already
    # be a symlink to a directory.
    if [[ -f "$STACK_DIR/.env" ]]; then
        if [[ ! -L "$STACK_DIR/observability/.env" || \
              "$(readlink "$STACK_DIR/observability/.env")" != "../.env" ]]; then
            ln -sfn ../.env "$STACK_DIR/observability/.env"
            log "  Ensured observability/.env -> ../.env symlink"
        fi
    fi

    log "Updating observability (LGTM) stack..."
    (cd "$STACK_DIR/observability" && \
        docker compose -f docker-compose.lgtm.yml up -d 2>&1 | sed 's/^/  /') \
        || log "⚠ observability up -d returned non-zero; continuing"

    declare -A LGTM_BIND_MOUNTS=(
        ["observability/prometheus.yml"]="lgtm-prometheus:/etc/prometheus/prometheus.yml"
        ["observability/prometheus-rules.yml"]="lgtm-prometheus:/etc/prometheus/rules.yml"
        ["observability/alloy-config.alloy"]="lgtm-alloy:/etc/alloy/config.alloy"
        ["observability/tempo.yaml"]="lgtm-tempo:/etc/tempo/tempo.yaml"
    )
    check_bind_mount_drift LGTM_BIND_MOUNTS
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

        # `image prune -f` removes the now-dangling images from the
        # previous deploy. Without this, dangling layers accumulate
        # between veta-host-prune runs (disk hit 100% on 2026-05-17).
        PRUNED=$(docker image prune -f 2>/dev/null | tail -1 || true)
        if [[ -n "$PRUNED" ]]; then
            log "🧹 $PRUNED"
        fi

        exit 0
    fi
    sleep 5
done

log "❌ Critical services not healthy after ${MAX_WAIT}s:$UNHEALTHY"
log "  (skipping image-version rollback; rollback only triggers when ALL critical services fail)"
exit 1
