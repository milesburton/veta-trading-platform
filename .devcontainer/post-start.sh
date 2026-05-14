#!/usr/bin/env bash
set -euo pipefail

workspace_dir="/workspaces/project"

# Keep SSH mount permissions sane for tools that require strict key perms.
chmod 700 /home/deno/.ssh 2>/dev/null || true
chmod 600 /home/deno/.ssh/* 2>/dev/null || true

cd "$workspace_dir"

if docker info >/dev/null 2>&1; then
  echo "[devcontainer] Docker is available; starting compose services..."
  docker compose up -d
else
  echo "[devcontainer] WARNING: Docker socket is not accessible from inside the dev container."
  echo "[devcontainer] Services were not started."
  echo "[devcontainer]"
  echo "[devcontainer] Fix on host:"
  echo "[devcontainer]   sudo usermod -aG docker \"$USER\""
  echo "[devcontainer]   log out/in fully, then Rebuild Container"
  echo "[devcontainer]"
  echo "[devcontainer] Diagnostic info:"
  id || true
  ls -l /var/run/docker.sock || true
fi
