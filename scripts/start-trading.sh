#!/usr/bin/env bash
# start-trading.sh — bring up all idle-safe service groups
# Usage: ./scripts/start-trading.sh [--wait]
#
# After running, the full platform is active:
#   - algos:         9 algo strategies (limit, twap, pov, vwap, iceberg, sniper, arrival-price, is, momentum)
#   - microstructure: dark-pool, ccp-service, rfq-service, fix-archive, fix-exchange, fix-gateway
#   - analytics:     analytics, market-data-service, market-data-adapters, feature-engine,
#                    signal-engine, recommendation-engine, scenario-engine
#   - aux:           kafka-relay, news-aggregator, llm-advisory-orchestrator, llm-worker
#
# The always-on core (redpanda, postgres, market-sim, journal, gateway, oms, ems, user-service)
# is unaffected — it runs continuously.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
SOCK=/tmp/supervisor.sock
CTL="supervisorctl -c $WORKSPACE_ROOT/supervisord.conf"

if [ ! -S "$SOCK" ]; then
  echo "ERROR: supervisord is not running (no socket at $SOCK)" >&2
  exit 1
fi

echo "Starting algo strategies..."
$CTL start algos:*

echo "Starting microstructure services..."
$CTL start microstructure:*

echo "Starting analytics pipeline..."
$CTL start analytics:*

echo "Starting aux/observability services..."
$CTL start aux:*

if [[ "${1:-}" == "--wait" ]]; then
  echo ""
  echo "Waiting for services to become healthy..."
  PORTS=(5003 5004 5005 5006 5007 5012 5014 5015 5017 5018 5019 5020 5021 5022 5023 5024 5025 5026 5027 5028 5029)
  for port in "${PORTS[@]}"; do
    for i in $(seq 1 30); do
      if curl -sf "http://localhost:$port/health" >/dev/null 2>&1; then
        echo "  port $port: ready"
        break
      fi
      sleep 1
    done
  done
fi

echo ""
echo "All trading services started. Run 'supervisorctl status' to check."
