#!/usr/bin/env bash
# Out-of-band Docker prune. Replaces the pruning role previously held by the
# disk-monitor container, which is now a passive disk-usage reporter with no
# Docker socket access.
#
# Schedule on UAT via systemd timer or cron, e.g.:
#   0 4 * * 0  /opt/stacks/veta/scripts/host-prune.sh >> /var/log/veta-prune.log 2>&1

set -euo pipefail

THRESHOLD_PCT="${THRESHOLD_PCT:-90}"

USED_PCT="$(df -P / | awk 'NR==2 {gsub("%",""); print $5}')"

if [ "${USED_PCT}" -ge "${THRESHOLD_PCT}" ]; then
  echo "[$(date -Iseconds)] Disk at ${USED_PCT}% (threshold ${THRESHOLD_PCT}%) — pruning"
  docker image prune -f
  docker container prune -f
  docker builder prune -f
else
  echo "[$(date -Iseconds)] Disk at ${USED_PCT}% — no prune needed"
fi
