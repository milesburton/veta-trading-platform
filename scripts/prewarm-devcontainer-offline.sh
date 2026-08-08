#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: ./scripts/prewarm-devcontainer-offline.sh [--commit <sha>] [--channel <stable|insider>]

Pre-warms local caches required to open this repository in a dev container without internet:
1. Downloads and caches the VS Code Server tarball for the selected commit
2. Installs the server into ~/.vscode-server/bin/<commit>
3. On WSL, also seeds the Windows cache used by Dev Containers at
  %LOCALAPPDATA%\\Temp\\vsch\\serverCache\\<commit>
4. Pulls the devcontainer base image
5. Builds the project devcontainer Dockerfile once to populate local layer cache

Examples:
  ./scripts/prewarm-devcontainer-offline.sh
  ./scripts/prewarm-devcontainer-offline.sh --commit df53daabb18cd157bdb08c7f01c34df936cf12f4
EOF
}

commit="${VSCODE_COMMIT:-}"
channel="${VSCODE_CHANNEL:-stable}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit)
      commit="${2:-}"
      shift 2
      ;;
    --channel)
      channel="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$commit" ]] && command -v code >/dev/null 2>&1; then
  commit="$(code --version 2>/dev/null | awk 'NR==2 { print $1; exit }')"
fi

if [[ -z "$commit" ]]; then
  echo "Could not determine VS Code commit automatically." >&2
  echo "Pass --commit <sha> or set VSCODE_COMMIT." >&2
  exit 1
fi

arch="$(uname -m)"
case "$arch" in
  x86_64)
    platform="linux-x64"
    ;;
  aarch64|arm64)
    platform="linux-arm64"
    ;;
  armv7l)
    platform="linux-armhf"
    ;;
  *)
    echo "Unsupported architecture: $arch" >&2
    exit 1
    ;;
esac

cache_dir="$HOME/.cache/vscode-server"
server_tarball="$cache_dir/vscode-server-${commit}-${platform}.tar.gz"
server_dir="$HOME/.vscode-server/bin/$commit"
server_url="https://update.code.visualstudio.com/commit:${commit}/server-${platform}/${channel}"

mkdir -p "$cache_dir"

if [[ -x "$server_dir/bin/code-server" ]]; then
  echo "[prewarm] VS Code Server already installed for commit $commit"
else
  if [[ ! -f "$server_tarball" ]]; then
    echo "[prewarm] Downloading VS Code Server: $server_url"
    curl -fL --retry 3 --retry-delay 2 --connect-timeout 10 "$server_url" -o "$server_tarball"
  else
    echo "[prewarm] Reusing cached server tarball: $server_tarball"
  fi

  mkdir -p "$server_dir"
  tar -xzf "$server_tarball" -C "$server_dir" --strip-components=1
  echo "[prewarm] Installed VS Code Server to $server_dir"
fi

if [[ -n "${WSL_DISTRO_NAME:-}" ]] && command -v cmd.exe >/dev/null 2>&1 && command -v wslpath >/dev/null 2>&1; then
  win_localappdata="$(cmd.exe /c "echo %LOCALAPPDATA%" 2>/dev/null | tr -d '\r')"
  if [[ -n "$win_localappdata" && "$win_localappdata" != "%LOCALAPPDATA%" ]]; then
    win_localappdata_unix="$(wslpath -u "$win_localappdata")"
    win_server_cache_dir="$win_localappdata_unix/Temp/vsch/serverCache/$commit"
    win_server_tarball="$win_server_cache_dir/vscode-server-${platform}.tar.gz"
    mkdir -p "$win_server_cache_dir"
    cp "$server_tarball" "$win_server_tarball"
    echo "[prewarm] Seeded Windows server cache: $win_server_tarball"
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[prewarm] Docker is not available on PATH, skipping image prewarm." >&2
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  echo "[prewarm] Docker daemon is not reachable, skipping image prewarm." >&2
  exit 0
fi

base_image="ghcr.io/milesburton/veta-trading-platform-base:latest"

if docker image inspect "$base_image" >/dev/null 2>&1; then
  echo "[prewarm] Base image already present: $base_image"
else
  echo "[prewarm] Pulling base image: $base_image"
  docker pull "$base_image"
fi

echo "[prewarm] Building .devcontainer/Dockerfile once to prime local layer cache"
docker build -f "$WORKSPACE_ROOT/.devcontainer/Dockerfile" "$WORKSPACE_ROOT" >/dev/null

echo "[prewarm] Done. You can now open this repo in a dev container offline with the same VS Code commit."
