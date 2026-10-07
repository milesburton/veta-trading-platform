#!/usr/bin/env bash
# Continuous load generator on/off switch.
#
# Usage:
#   load.sh on       # bring up loadgen-token, loadgen-soak, loadgen-matrix
#   load.sh off      # stop them
#   load.sh status   # show current state
#   load.sh logs     # tail logs from all loadgen containers
#
# Reads platform secrets and LOADGEN_OAUTH_PASSWORD from OpenBao
# (veta/platform, veta/loadgen), or from the legacy $STACK_DIR/.env.loadgen
# until scripts/openbao-bootstrap.py has run. Refuses to start without them.

set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/stacks/veta}"
ENV_FILE="$STACK_DIR/.env.loadgen"

COMPOSE_FILES=(
  -f "$STACK_DIR/compose.yml"
  -f "$STACK_DIR/compose.prod.yml"
  -f "$STACK_DIR/compose.loadgen.yml"
)
PROFILE_FLAG=(--profile loadgen --profile trading)

log() { echo "[load] $(date -u +%H:%M:%S) $*"; }
fail() { echo "[load] ERROR: $*" >&2; exit 1; }

# Required by every subcommand because compose.loadgen.yml references
# ${LOADGEN_OAUTH_PASSWORD:?...} which fails interpolation if unset, and
# compose.yml needs the platform secrets or dependencies could be
# recreated with defaults.
load_env() {
  # shellcheck source=lib/openbao-env.sh
  . "$(dirname "${BASH_SOURCE[0]}")/lib/openbao-env.sh"
  if openbao_configured; then
    openbao_export platform || fail "could not load platform secrets from OpenBao"
    openbao_export_if_present loadgen || fail "could not load loadgen secrets from OpenBao"
  elif [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
  [[ -n "${LOADGEN_OAUTH_PASSWORD:-}" ]] \
    || fail "no LOADGEN_OAUTH_PASSWORD in OpenBao veta/loadgen or $ENV_FILE; see scripts/loadgen/README.md"
}

cmd_on() {
  load_env
  log "starting loadgen profile..."
  cd "$STACK_DIR"
  docker compose "${COMPOSE_FILES[@]}" "${PROFILE_FLAG[@]}" up -d \
    loadgen-token loadgen-soak loadgen-matrix
  log "loadgen up; check 'load.sh status' or 'load.sh logs'"
}

cmd_off() {
  load_env
  cd "$STACK_DIR"
  log "stopping loadgen containers..."
  docker compose "${COMPOSE_FILES[@]}" "${PROFILE_FLAG[@]}" stop \
    loadgen-token loadgen-soak loadgen-matrix 2>&1 | tail -10 || true
  docker compose "${COMPOSE_FILES[@]}" "${PROFILE_FLAG[@]}" rm -f \
    loadgen-token loadgen-soak loadgen-matrix 2>&1 | tail -10 || true
  log "loadgen down. Gateway rate limits remain disabled until next 'docker compose up'."
}

cmd_status() {
  load_env
  cd "$STACK_DIR"
  docker compose "${COMPOSE_FILES[@]}" "${PROFILE_FLAG[@]}" ps \
    loadgen-token loadgen-soak loadgen-matrix 2>&1
}

cmd_logs() {
  load_env
  cd "$STACK_DIR"
  docker compose "${COMPOSE_FILES[@]}" "${PROFILE_FLAG[@]}" logs -f --tail=50 \
    loadgen-token loadgen-soak loadgen-matrix
}

case "${1:-}" in
  on) cmd_on ;;
  off) cmd_off ;;
  status) cmd_status ;;
  logs) cmd_logs ;;
  *)
    cat <<EOF
Usage: $0 <on|off|status|logs>

  on      start the continuous load generator (token sidecar + soak + matrix loop)
  off     stop all loadgen containers
  status  show running loadgen container state
  logs    tail logs from all loadgen containers

Reads credentials from OpenBao (veta/loadgen). See scripts/loadgen/README.md for setup.
EOF
    exit 1
    ;;
esac
