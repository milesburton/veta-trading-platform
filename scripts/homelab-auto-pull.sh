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
REPO_SLUG="${REPO_SLUG:-milesburton/veta-trading-platform}"
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

# ls-remote reports a SHA the instant a commit lands on main — often
# well before the CI workflow that builds and publishes GHCR images for
# that commit has finished. Deploying immediately means `docker compose
# pull` finds nothing new (the image tag hasn't been re-pushed yet),
# `up -d` silently keeps the old container running, and last-deployed-sha
# still gets marked as this SHA — so no later tick ever retries it.
# 2026-07-04: this exact race left the frontend a week+ stale in
# production while auto-pull kept reporting "already at <sha>".
#
# Guard against it by requiring every "Publish ... :latest (gated)"
# check-run for the target SHA to be `completed` before deploying. If
# none exist yet, or any are still queued/in_progress, the commit's
# publish step hasn't caught up — skip this tick and let the next one
# re-check. This does not require a GitHub token: check-runs are
# readable anonymously on a public repo.
publish_checks_ready() {
  local sha="$1"
  local page=1
  local total_gated=0
  local incomplete=0
  while :; do
    local resp
    resp=$(curl -sf --max-time 10 \
      "https://api.github.com/repos/$REPO_SLUG/commits/$sha/check-runs?per_page=100&page=$page") \
      || { log "check-runs API request failed (network/rate-limit?) — treating as not ready"; return 1; }
    local page_gated page_incomplete count
    page_gated=$(echo "$resp" | python3 -c '
import json,sys
d=json.load(sys.stdin)
runs=[c for c in d.get("check_runs",[]) if c["name"].startswith("Publish ") and c["name"].endswith(":latest (gated)")]
print(len(runs))
print(sum(1 for c in runs if c["status"] != "completed"))
')
    count=$(echo "$page_gated" | sed -n '1p')
    page_incomplete=$(echo "$page_gated" | sed -n '2p')
    total_gated=$((total_gated + count))
    incomplete=$((incomplete + page_incomplete))
    local returned
    returned=$(echo "$resp" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("check_runs",[])))')
    [[ "$returned" -lt 100 ]] && break
    page=$((page + 1))
  done
  if [[ "$total_gated" -eq 0 ]]; then
    log "no 'Publish ... :latest (gated)' check-runs found for ${sha:0:7} yet — not ready"
    return 1
  fi
  if [[ "$incomplete" -gt 0 ]]; then
    log "$incomplete/$total_gated publish check-runs still in progress for ${sha:0:7} — not ready"
    return 1
  fi
  return 0
}

# [skip ci] commits (release-please screenshot updates, etc.) never get
# Publish check-runs — CI doesn't run for them at all — so
# publish_checks_ready would block on them forever. They also carry no
# new images to wait for, so it's safe to deploy immediately (mainly to
# pick up any config-file changes via sync_configs).
is_skip_ci() {
  local sha="$1"
  local msg
  msg=$(curl -sf --max-time 10 \
    "https://api.github.com/repos/$REPO_SLUG/commits/$sha" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("commit",{}).get("message",""))' 2>/dev/null) \
    || return 1
  [[ "$msg" == *"[skip ci]"* ]]
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

if is_skip_ci "$REMOTE"; then
  log "remote=${REMOTE:0:7} last-deployed=${LAST:0:7} — [skip ci] commit, no publish to wait for, running deploy"
elif ! publish_checks_ready "$REMOTE"; then
  log "remote=${REMOTE:0:7} last-deployed=${LAST:0:7} — publish not confirmed complete; deferring to next tick"
  exit 0
else
  log "remote=${REMOTE:0:7} last-deployed=${LAST:0:7} — publish confirmed complete, running deploy"
fi

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
