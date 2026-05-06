#!/usr/bin/env bash
set -euo pipefail

SOCAT_NAME="veta-docker-socat"
SOCAT_IMAGE="alpine/socat"
DOCKER_CONFIG_DIR="/tmp/veta-docker-config"

ensure_clean_docker_config() {
  mkdir -p "${DOCKER_CONFIG_DIR}"
  if [[ ! -f "${DOCKER_CONFIG_DIR}/config.json" ]]; then
    printf '{}' > "${DOCKER_CONFIG_DIR}/config.json"
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

ensure_clean_docker_config
SOCAT_IP="$(ensure_socat_sidecar)"
GATEWAY_IP="$(bridge_gateway)"

export DOCKER_HOST="tcp://${SOCAT_IP}:2375"
export DOCKER_CONFIG="${DOCKER_CONFIG_DIR}"
export TESTCONTAINERS_RYUK_DISABLED=true
export TESTCONTAINERS_HOST_OVERRIDE="${GATEWAY_IP}"
export RUN_TESTCONTAINERS=1

exec "$@"
