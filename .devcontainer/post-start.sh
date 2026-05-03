#!/usr/bin/env bash
set -euo pipefail

workspace_dir="/workspaces/project"

# Keep SSH mount permissions sane for tools that require strict key perms.
chmod 700 /home/deno/.ssh 2>/dev/null || true
chmod 600 /home/deno/.ssh/* 2>/dev/null || true

cd "$workspace_dir"

# flyctl: warn if the runtime binary drifts from the version baked into the image.
# $FLYCTL_VERSION is set in the Dockerfile (ENV) so any deviation almost certainly
# means the host-mounted ~/.fly/bin is shadowing the system binary.
if command -v flyctl >/dev/null 2>&1; then
  baked="${FLYCTL_VERSION:-unknown}"
  running="$(flyctl version 2>/dev/null | awk '{print $3}' || echo unknown)"
  if [ "$baked" != "unknown" ] && [ "${running#v}" != "${baked#v}" ]; then
    echo "[devcontainer] WARNING: flyctl version mismatch — image=$baked, runtime=$running"
    echo "[devcontainer]   Bump FLYCTL_VERSION in .devcontainer/Dockerfile and rebuild,"
    echo "[devcontainer]   or remove ~/.fly/bin/flyctl on the host if it is shadowing the system binary."
  fi
  if flyctl auth whoami >/dev/null 2>&1; then
    echo "[devcontainer] flyctl: $(flyctl auth whoami) (version $running)"
  else
    echo "[devcontainer] flyctl $running installed; run 'flyctl auth login' on the host to authenticate."
  fi
fi

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
