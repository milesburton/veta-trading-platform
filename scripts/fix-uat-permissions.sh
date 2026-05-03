#!/usr/bin/env bash
# UAT migration helper: run this once on the UAT VM before pulling the
# hardened image set. The trading services now run as UID 1000 inside their
# containers; existing Docker volumes that were created by root-running
# containers must be re-owned so the non-root services can write to them.
#
# Run as a user that can sudo:
#   ssh miles@<uat-ip>
#   cd /opt/stacks/veta
#   ./scripts/fix-uat-permissions.sh
#
# After this, restart the stack:
#   docker compose -f compose.yml -f compose.prod.yml down
#   docker compose -f compose.yml -f compose.prod.yml pull
#   docker compose -f compose.yml -f compose.prod.yml up -d

set -euo pipefail

VOLUMES_TO_OWN_AS_DENO=(
  "veta_market-data-state"
  "veta_feature-engine-data"
  "veta_signal-engine-data"
  "veta_llm-advisory-data"
)

for vol in "${VOLUMES_TO_OWN_AS_DENO[@]}"; do
  if ! docker volume inspect "${vol}" >/dev/null 2>&1; then
    echo "[skip] Volume ${vol} does not exist; will be created with correct ownership on first run"
    continue
  fi
  MOUNTPOINT="$(docker volume inspect "${vol}" --format '{{ .Mountpoint }}')"
  echo "[fix] ${vol}  ->  ${MOUNTPOINT}"
  sudo chown -R 1000:1000 "${MOUNTPOINT}"
done

echo "Done."
