#!/usr/bin/env bash
# stop-idle.sh — shut down all idle-safe service groups
# Usage: ./scripts/stop-idle.sh
#
# Stops all non-essential services while keeping the always-on core running:
#   Always-on (NOT stopped): redpanda, postgres, market-sim, journal,
#                            gateway, oms, ems, user-service, frontend, frontend-proxy
#
# Stopped:
#   - algos:          9 algo strategies
#   - microstructure: dark-pool, ccp-service, rfq-service, fix-archive, fix-exchange, fix-gateway
#   - analytics:      7 analytics/ML pipeline services
#   - aux:            kafka-relay, news-aggregator, llm-advisory, llm-worker

set -euo pipefail

SOCK=/tmp/supervisor.sock
CTL="supervisorctl -c /workspaces/virtual-equities-trading-application/supervisord.conf"

if [ ! -S "$SOCK" ]; then
  echo "ERROR: supervisord is not running (no socket at $SOCK)" >&2
  exit 1
fi

echo "Stopping aux/observability services..."
$CTL stop aux:* 2>/dev/null || true

echo "Stopping analytics pipeline..."
$CTL stop analytics:* 2>/dev/null || true

echo "Stopping microstructure services..."
$CTL stop microstructure:* 2>/dev/null || true

echo "Stopping algo strategies..."
$CTL stop algos:* 2>/dev/null || true

echo ""
echo "Idle services stopped. Core platform (market-sim, journal, gateway, oms, ems) still running."
echo "Run './scripts/start-trading.sh' to bring trading services back up."
