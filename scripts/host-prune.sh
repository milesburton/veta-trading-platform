#!/usr/bin/env bash
# Out-of-band Docker prune. Replaces the pruning role previously held by the
# disk-monitor container, which is now a passive disk-usage reporter with no
# Docker socket access.
#
# Two modes:
#   - Preventive (default): always prune dangling images, exited containers,
#     and build cache older than PRUNE_AGE (default 24h). Run weekly to keep
#     image churn from accumulating.
#   - Aggressive: when disk is at THRESHOLD_PCT (default 90%), also prune
#     images that have no running container, regardless of age. This is the
#     "we're about to fail" emergency mode.
#
# Schedule via systemd timer in scripts/homelab-systemd/veta-host-prune.{service,timer}.

set -euo pipefail

THRESHOLD_PCT="${THRESHOLD_PCT:-90}"
PRUNE_AGE="${PRUNE_AGE:-24h}"

USED_PCT="$(df -P / | awk 'NR==2 {gsub("%",""); print $5}')"

echo "[$(date -Iseconds)] Disk at ${USED_PCT}% (threshold ${THRESHOLD_PCT}%)"
echo "[$(date -Iseconds)] Preventive prune: dangling images, exited containers, builder cache older than ${PRUNE_AGE}"
docker image prune --filter "until=${PRUNE_AGE}" -f
docker container prune --filter "until=${PRUNE_AGE}" -f
docker builder prune --filter "until=${PRUNE_AGE}" -f

if [ "${USED_PCT}" -ge "${THRESHOLD_PCT}" ]; then
  echo "[$(date -Iseconds)] Disk above ${THRESHOLD_PCT}% — running aggressive prune (untagged images, all builder cache)"
  docker image prune -a -f
  docker builder prune -af
fi

echo "[$(date -Iseconds)] Done. New disk usage: $(df -P / | awk 'NR==2 {print $5}')"
