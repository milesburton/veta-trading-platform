#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${STACK_NAME:-veta}"
STACK_DIR="${STACK_DIR:-/opt/stacks/veta}"
REPO_URL="${REPO_URL:-https://github.com/milesburton/veta-trading-platform.git}"
REPO_REF="${REPO_REF:-main}"
GOOD_SHA_FILE="$STACK_DIR/.good-sha"
PROBE_TIMEOUT="${PROBE_TIMEOUT:-300}"
PROBE_URL="${PROBE_URL:-http://localhost/api/gateway/ready}"

CONFIG_PATHS=(
  "compose.yml"
  "compose.prod.yml"
  "compose.observability.yml"
  "compose.swarm.yml"
  "traefik.yml"
  "observability/"
)

cd "$STACK_DIR"

log() { echo "[swarm-deploy] $(date -u +%H:%M:%S) $*"; }
fail() { log "ERROR: $*"; exit 1; }

if ! docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -q active; then
  fail "Docker Swarm is not active on this host. Run 'docker swarm init' first (see docs/incidents/runbooks/swarm-bootstrap.md)."
fi

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
    mkdir -p "$(dirname "$dst")"
    rsync -ai --delete "$src" "$dst" 2>&1 | sed 's/^/  /' || true
  done
}

if [[ -f "$STACK_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$STACK_DIR/.env"
  set +a
fi

log "Syncing config files from repo..."
sync_configs

log "Logging in to GHCR for image pulls..."
if [[ -n "${GHCR_USER:-}" && -n "${GHCR_TOKEN:-}" ]]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
fi

log "Resolving compose to a Swarm bundle..."
RESOLVED_COMPOSE=$(mktemp)
trap 'rm -f "$RESOLVED_COMPOSE"' EXIT
docker compose \
  -f compose.yml \
  -f compose.prod.yml \
  -f compose.observability.yml \
  -f compose.swarm.yml \
  config > "$RESOLVED_COMPOSE"

log "Deploying stack '$STACK_NAME'..."
docker stack deploy \
  --detach=true \
  --resolve-image=always \
  --with-registry-auth \
  -c "$RESOLVED_COMPOSE" \
  "$STACK_NAME"

log "Polling /api/gateway/ready for up to ${PROBE_TIMEOUT}s..."
DEADLINE=$(( $(date +%s) + PROBE_TIMEOUT ))
while [[ $(date +%s) -lt $DEADLINE ]]; do
  if curl -sf --max-time 5 "$PROBE_URL" | grep -q '"ready"[[:space:]]*:[[:space:]]*true'; then
    log "Stack is ready."
    if [[ -n "${GITHUB_SHA:-}" ]]; then
      printf '%s' "${GITHUB_SHA:0:40}" > "$GOOD_SHA_FILE"
    fi
    log "Service summary:"
    docker stack services "$STACK_NAME" | sed 's/^/  /'
    exit 0
  fi
  sleep 5
done

log "Probe never returned ready={true} within ${PROBE_TIMEOUT}s."
log "Current service state:"
docker stack services "$STACK_NAME" | sed 's/^/  /'
log "Failed tasks (last 5):"
docker stack ps "$STACK_NAME" --no-trunc --filter desired-state=shutdown 2>/dev/null | head -10 | sed 's/^/  /' || true
exit 1
