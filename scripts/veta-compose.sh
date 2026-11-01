#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/stacks/veta}"

# shellcheck source=lib/openbao-env.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/openbao-env.sh"

if ! openbao_configured; then
    openbao_log "no AppRole credentials at $OPENBAO_APPROLE_FILE; run scripts/openbao-bootstrap.py"
    exit 1
fi
openbao_export platform
openbao_export_if_present loadgen

export COMPOSE_FILE="${COMPOSE_FILE:-compose.yml:compose.prod.yml:compose.observability.yml}"

cd "$STACK_DIR"
exec docker compose "$@"
