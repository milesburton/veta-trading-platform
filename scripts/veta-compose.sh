#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/stacks/veta}"

# shellcheck source=lib/openbao-env.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/openbao-env.sh"

if openbao_configured; then
    openbao_export platform
    openbao_export_if_present loadgen
else
    openbao_log "no AppRole credentials at $OPENBAO_APPROLE_FILE; compose falls back to .env"
fi

CHAIN=compose.yml:compose.prod.yml:compose.observability.yml
if [[ -n "${GITHUB_TICKETING_TOKEN_SECRET:-}" ]]; then
    CHAIN+=:deploy/openbao/compose.secrets.yml
fi
export COMPOSE_FILE="${COMPOSE_FILE:-$CHAIN}"

cd "$STACK_DIR"
exec docker compose "$@"
