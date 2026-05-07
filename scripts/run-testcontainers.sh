#!/usr/bin/env bash
set -euo pipefail

# Wrapper for `deno test ...` runs that need Testcontainers.
#
# What this does:
# - Runs a socat sidecar that proxies tcp://<bridge>:2375 → /var/run/docker.sock
#   and points DOCKER_HOST at it. Deno's node:http polyfill cannot write to a
#   Unix socket (Symbol(Deno.internal.rid) gap), so dockerode (used by
#   testcontainers) needs the TCP path on every Linux Docker host — local dev
#   containers, Codespaces, and GitHub Actions runners alike.
# - Sets TESTCONTAINERS_HOST_OVERRIDE to the Docker bridge gateway. On a dev
#   container, 127.0.0.1 doesn't reach Docker-published ports, only the bridge
#   gateway does. On a CI runner, the bridge gateway is also reachable (Docker
#   binds published ports to all interfaces), so the override is safe in both.
# - If ~/.docker/config.json declares a credsStore that exits 1 on
#   public-registry pulls (Codespaces does this), points DOCKER_CONFIG at an
#   empty config dir.
# - Disables Ryuk: our helpers stop containers in finally blocks already, and
#   reaching Ryuk's published port from inside a dev container is its own
#   loopback puzzle.
# - Sets RUN_TESTCONTAINERS=1 so the gated test files actually execute.

SOCAT_NAME="veta-docker-socat"
SOCAT_IMAGE="alpine/socat"
DOCKER_CONFIG_DIR="/tmp/veta-docker-config"

ensure_clean_docker_config_if_needed() {
  local cfg="${HOME}/.docker/config.json"
  if [[ -f "${cfg}" ]] && grep -q '"credsStore"' "${cfg}"; then
    mkdir -p "${DOCKER_CONFIG_DIR}"
    if [[ ! -f "${DOCKER_CONFIG_DIR}/config.json" ]]; then
      printf '{}' > "${DOCKER_CONFIG_DIR}/config.json"
    fi
    export DOCKER_CONFIG="${DOCKER_CONFIG_DIR}"
  fi
}

ensure_socat_sidecar() {
  if docker inspect "${SOCAT_NAME}" >/dev/null 2>&1; then
    if ! docker inspect -f '{{.State.Running}}' "${SOCAT_NAME}" | grep -q true; then
      docker rm -f "${SOCAT_NAME}" >/dev/null
    fi
  fi
  if ! docker inspect "${SOCAT_NAME}" >/dev/null 2>&1; then
    docker run -d --rm \
      --name "${SOCAT_NAME}" \
      -v /var/run/docker.sock:/var/run/docker.sock \
      "${SOCAT_IMAGE}" \
      TCP-LISTEN:2375,fork,reuseaddr UNIX-CONNECT:/var/run/docker.sock >/dev/null
  fi
  docker inspect "${SOCAT_NAME}" --format '{{.NetworkSettings.Networks.bridge.IPAddress}}'
}

bridge_gateway() {
  docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}'
}

ensure_clean_docker_config_if_needed

SOCAT_IP="$(ensure_socat_sidecar)"
GATEWAY_IP="$(bridge_gateway)"

export DOCKER_HOST="tcp://${SOCAT_IP}:2375"
export TESTCONTAINERS_HOST_OVERRIDE="${GATEWAY_IP}"
export TESTCONTAINERS_RYUK_DISABLED=true
export RUN_TESTCONTAINERS=1

exec "$@"
