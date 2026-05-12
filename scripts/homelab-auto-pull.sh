#!/usr/bin/env bash
# Polls origin/main and runs deploy.sh when a new commit lands.
# Designed to be invoked by a systemd timer (or cron) on the homelab,
# every 5 minutes. Idempotent and safe to run concurrently — uses an
# advisory flock so overlapping invocations bail.
#
# Why this exists: GitHub Actions runners can't reach the homelab's
# private LAN (192.168.0.0/24). Inverting the direction — the homelab
# polls GitHub — sidesteps the network problem entirely without a
# tunnel.
#
# State file:  $STATE_DIR/last-deployed-sha   (full 40-char SHA)
# Lock file:   $STATE_DIR/auto-pull.lock
#
# Logs to journald via stdout when invoked under systemd; falls back
# to the calling shell's stdout otherwise.

set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/stacks/veta}"
STATE_DIR="${STATE_DIR:-$STACK_DIR/state}"
REPO_URL="${REPO_URL:-https://github.com/milesburton/veta-trading-platform.git}"
REPO_REF="${REPO_REF:-main}"
DEPLOY_SCRIPT="${DEPLOY_SCRIPT:-$STACK_DIR/deploy.sh}"

LAST_DEPLOYED_FILE="$STATE_DIR/last-deployed-sha"
LOCK_FILE="$STATE_DIR/auto-pull.lock"

mkdir -p "$STATE_DIR"

log() { echo "[auto-pull] $(date -u +%H:%M:%S) $*"; }
fail() { echo "[auto-pull] ERROR: $*" >&2; exit 1; }

# Single-instance guard. Returns 1 (and exits 0) if another invocation holds the lock.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "another invocation is already running; exiting"
  exit 0
fi

[[ -x "$DEPLOY_SCRIPT" ]] || fail "$DEPLOY_SCRIPT not found or not executable"

remote_sha() {
  git ls-remote "$REPO_URL" "refs/heads/$REPO_REF" 2>/dev/null | awk '{print $1}' | head -c 40
}

last_sha() {
  if [[ -f "$LAST_DEPLOYED_FILE" ]]; then
    cat "$LAST_DEPLOYED_FILE"
  fi
}

REMOTE=$(remote_sha)
if [[ -z "$REMOTE" ]]; then
  log "could not fetch remote SHA — network problem? exiting without deploying"
  exit 0
fi

LAST=$(last_sha)
if [[ "$REMOTE" == "$LAST" ]]; then
  log "already at $REMOTE — nothing to do"
  exit 0
fi

log "remote=${REMOTE:0:7} last-deployed=${LAST:0:7} — running deploy"

# Self-update deploy.sh from the freshly-fetched repo before running it.
# Otherwise a fix to deploy.sh in main is unreachable: the script can't
# update itself.
checkout=$(mktemp -d)
# shellcheck disable=SC2064
trap "rm -rf '$checkout'" EXIT
if git clone --depth 1 --branch "$REPO_REF" --filter=blob:none "$REPO_URL" "$checkout" >/dev/null 2>&1; then
  if [[ -f "$checkout/scripts/homelab-deploy.sh" ]]; then
    install -m 0755 "$checkout/scripts/homelab-deploy.sh" "$DEPLOY_SCRIPT"
    log "refreshed $DEPLOY_SCRIPT from main"
  fi
else
  log "could not refresh $DEPLOY_SCRIPT from main; running existing copy"
fi

if GITHUB_SHA="$REMOTE" "$DEPLOY_SCRIPT"; then
  printf '%s' "$REMOTE" > "$LAST_DEPLOYED_FILE"
  log "deployed ${REMOTE:0:7} successfully"
else
  log "deploy failed; leaving $LAST_DEPLOYED_FILE unchanged so we retry next tick"
  exit 1
fi
