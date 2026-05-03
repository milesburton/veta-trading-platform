#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# REQUIRED MIGRATION STEP — read this before running.
# ─────────────────────────────────────────────────────────────────────────────
# Commit d4e9fb6 ("chore(security): container hardening pass") moves all Deno
# trading services to non-root execution (UID 1000). Existing named volumes on
# UAT were created by root-running containers and contain root-owned files.
#
# WITHOUT THIS SCRIPT being run before the hardened images are pulled, four
# stateful services will enter CrashLoopBackOff on first start because they
# cannot write to their root-owned volumes:
#
#   - market-data         (volume: veta_market-data-state)
#   - feature-engine      (volume: veta_feature-engine-data)
#   - signal-engine       (volume: veta_signal-engine-data)
#   - llm-advisory        (volume: veta_llm-advisory-data)
#
# Watchtower polls GHCR every 5 minutes and will roll the new images
# automatically. The safest sequence is to PAUSE Watchtower first, migrate,
# then resume:
#
#   ssh miles@<uat-ip>
#   cd /opt/stacks/veta
#   git pull
#   docker stop veta-watchtower
#   ./scripts/fix-uat-permissions.sh
#   docker compose -f compose.yml -f compose.prod.yml down
#   docker compose -f compose.yml -f compose.prod.yml pull
#   docker compose -f compose.yml -f compose.prod.yml up -d
#   docker start veta-watchtower
#
# Symptom of skipping this step: the four services above show "Restarting"
# in `docker ps`. Their logs will contain a "Permission denied" or
# "Read-only file system" message. Recovery is to run this script and
# restart the affected services.
# ─────────────────────────────────────────────────────────────────────────────

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
