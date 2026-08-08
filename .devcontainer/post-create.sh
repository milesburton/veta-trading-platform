#!/usr/bin/env bash
set -euo pipefail

workspace_dir="${CONTAINER_WORKSPACE_FOLDER:-/workspaces/virtual-equities-trading-application}"
frontend_dir="$workspace_dir/frontend"
lockfile="$frontend_dir/package-lock.json"
node_modules_dir="$frontend_dir/node_modules"
marker_file="$frontend_dir/.npm-ci-lock.sha256"

if [[ ! -f "$lockfile" ]]; then
  echo "[devcontainer] Skipping frontend bootstrap: $lockfile was not found."
  exit 0
fi

lock_hash="$(sha256sum "$lockfile" | awk '{print $1}')"
marker_hash=""
if [[ -f "$marker_file" ]]; then
  marker_hash="$(cat "$marker_file" 2>/dev/null || true)"
fi

needs_install=1
if [[ -d "$node_modules_dir" && "$marker_hash" == "$lock_hash" ]]; then
  needs_install=0
fi

if [[ "$needs_install" -eq 1 ]]; then
  echo "[devcontainer] Installing frontend dependencies (npm ci)."
  if (cd "$frontend_dir" && npm ci --ignore-scripts --prefer-offline --no-audit --no-fund); then
    printf '%s\n' "$lock_hash" > "$marker_file"
    echo "[devcontainer] Frontend dependencies are up to date."
  else
    if [[ -d "$node_modules_dir" ]]; then
      echo "[devcontainer] WARNING: npm ci failed, reusing existing node_modules."
    else
      echo "[devcontainer] WARNING: npm ci failed and node_modules is missing."
      echo "[devcontainer] Connect to the internet and run: cd $frontend_dir && npm ci --ignore-scripts"
    fi
  fi
else
  echo "[devcontainer] Frontend dependencies are already in sync with package-lock.json."
fi

if [[ -x "$frontend_dir/node_modules/.bin/husky" ]]; then
  (cd "$workspace_dir" && "$frontend_dir/node_modules/.bin/husky")
else
  echo "[devcontainer] Skipping husky setup: frontend/node_modules/.bin/husky is unavailable."
fi
