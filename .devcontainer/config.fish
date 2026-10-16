# ── Environment ───────────────────────────────────────────────────────────────
set -gx NPM_CONFIG_PREFIX "$HOME/.npm-global"
fish_add_path $NPM_CONFIG_PREFIX/bin
set -l WS "/workspaces/virtual-equities-trading-application"
set -l _SCONF "$WS/supervisord.conf"

# ── Login banner — live service status snapshot ───────────────────────────────
if status is-interactive
  echo "" | lolcat
  echo "  ╔═══════════════════════════════════════════════════════════╗" | lolcat
  echo "  ║   VETA  ·  Virtual Equities Trading Application          ║" | lolcat
  echo "  ╚═══════════════════════════════════════════════════════════╝" | lolcat
  echo ""
  echo "  Platform"
  echo "    Web UI     →  http://localhost:8080  (Vite + React)"  | lolcat
  echo "    Gateway    →  ws://localhost:5011    (BFF WebSocket)"  | lolcat
  echo "    Redpanda   →  localhost:19092        (Kafka API)"  | lolcat
  echo ""
  echo "  Quick start" | lolcat
  echo "    start-trading          start all core services"
  echo "    stop-idle              stop algos / microstructure / analytics"
  echo "    svc-ui                 live service dashboard (press q to quit)"
  echo "    svc-restart <name>     restart a specific service"
  echo "    svc-logs <name>        tail logs for a service"
  echo ""
  echo "  Electron (desktop app)" | lolcat
  echo "    cd $WS/frontend"
  echo "    npm run electron:dev"
  echo "    (requires start-trading to be running first)"
  echo ""
  echo "  Service status" | lolcat
  node $WS/scripts/status.ts --once 2>/dev/null; or true
  echo ""
end

# ── Supervisord shortcuts ─────────────────────────────────────────────────────
alias svc-status="supervisorctl -c $_SCONF status"
alias svc-restart="supervisorctl -c $_SCONF restart"
alias svc-restart-all="supervisorctl -c $_SCONF restart all"
alias svc-logs="supervisorctl -c $_SCONF tail -f"
alias svc-ui="node $WS/scripts/status.ts"
alias start-trading="$WS/scripts/start-trading.sh"
alias stop-idle="$WS/scripts/stop-idle.sh"

# Legacy
alias restart-services="svc-restart-all"

# ── Per-service run aliases (debug / manual mode) ─────────────────────────────
alias run-frontend="cd $WS/frontend && npm run dev"
alias run-gateway="node --env-file-if-exists=$WS/.env $WS/backend/src/gateway/gateway.ts"
alias run-market-sim="node --env-file-if-exists=$WS/.env $WS/backend/src/market-sim/market-sim.ts"
alias run-ems="node --env-file-if-exists=$WS/.env $WS/backend/src/ems/ems-server.ts"
alias run-oms="node --env-file-if-exists=$WS/.env $WS/backend/src/oms/oms-server.ts"
alias run-journal="node --env-file-if-exists=$WS/.env $WS/backend/src/journal/journal-server.ts"
alias run-user-service="node --env-file-if-exists=$WS/.env $WS/backend/src/user-service/user-service.ts"
alias run-observability="node --env-file-if-exists=$WS/.env $WS/observability/kafka-relay.ts"
alias run-analytics="node --env-file-if-exists=$WS/.env $WS/backend/src/analytics/analytics-server.ts"
alias run-market-data="node --env-file-if-exists=$WS/.env $WS/backend/src/market-data/market-data-service.ts"
alias run-feature-engine="node --env-file-if-exists=$WS/.env $WS/backend/src/feature-engine/feature-engine.ts"
alias run-signal-engine="node --env-file-if-exists=$WS/.env $WS/backend/src/signal-engine/signal-engine.ts"
alias run-recommendation="node --env-file-if-exists=$WS/.env $WS/backend/src/recommendation-engine/recommendation-server.ts"
alias run-scenario-engine="node --env-file-if-exists=$WS/.env $WS/backend/src/scenario-engine/scenario-server.ts"
alias run-llm-advisory="node --env-file-if-exists=$WS/.env $WS/backend/src/llm-advisory/orchestrator.ts"
alias run-news="node --env-file-if-exists=$WS/.env $WS/backend/src/news/news-aggregator.ts"
alias run-fix-archive="node --env-file-if-exists=$WS/.env $WS/backend/src/fix/fix-archive.ts"
alias run-dark-pool="node --env-file-if-exists=$WS/.env $WS/backend/src/dark-pool/dark-pool-server.ts"
alias run-ccp="node --env-file-if-exists=$WS/.env $WS/backend/src/ccp/ccp-service.ts"
alias run-rfq="node --env-file-if-exists=$WS/.env $WS/backend/src/rfq/rfq-service.ts"
alias run-limit-algo="node --env-file-if-exists=$WS/.env $WS/backend/src/algo/limit-strategy.ts"
alias run-twap-algo="node --env-file-if-exists=$WS/.env $WS/backend/src/algo/twap-strategy.ts"
alias run-pov-algo="node --env-file-if-exists=$WS/.env $WS/backend/src/algo/pov-strategy.ts"
alias run-vwap-algo="node --env-file-if-exists=$WS/.env $WS/backend/src/algo/vwap-strategy.ts"
alias run-iceberg-algo="node --env-file-if-exists=$WS/.env $WS/backend/src/algo/iceberg-strategy.ts"
alias run-sniper-algo="node --env-file-if-exists=$WS/.env $WS/backend/src/algo/sniper-strategy.ts"
alias run-arrival-price-algo="node --env-file-if-exists=$WS/.env $WS/backend/src/algo/arrival-price-strategy.ts"
alias run-momentum-algo="node --env-file-if-exists=$WS/.env $WS/backend/src/algo/momentum-strategy.ts"
alias run-is-algo="node --env-file-if-exists=$WS/.env $WS/backend/src/algo/is-strategy.ts"
