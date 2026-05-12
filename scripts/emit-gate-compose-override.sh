#!/usr/bin/env bash
set -euo pipefail

TAG="${GATE_TAG:?GATE_TAG is required (e.g. the commit SHA)}"
OUT="${1:-compose.gate.yml}"
SERVICES_FILE="$(dirname -- "$0")/gate-services.txt"

mapfile -t SERVICES < <(grep -v '^\s*$' "$SERVICES_FILE")

{
  echo "services:"
  echo "  traefik:"
  echo "    volumes: !override"
  echo "      - /var/run/docker.sock:/var/run/docker.sock:ro"
  echo "      - ./traefik.gate.yml:/traefik.yml:ro"
  for svc in "${SERVICES[@]}"; do
    echo "  ${svc}:"
    echo "    image: ghcr.io/milesburton/veta-trading-platform/${svc}:${TAG}"
    echo "    build: !reset null"
    echo "    pull_policy: never"
    if [[ "$svc" == "user-service" || "$svc" == "gateway" ]]; then
      echo "    environment:"
      echo "      VETA_ALLOW_DEFAULT_PASSCODE: \"true\""
      echo "      VETA_DEMO_MODE: \"true\""
    fi
  done
} > "$OUT"

echo "Wrote $OUT (tag=${TAG}, ${#SERVICES[@]} services)."
