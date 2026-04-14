# ── Environment ───────────────────────────────────────────────────────────────
set -gx DENO_INSTALL "$HOME/.deno"
fish_add_path $DENO_INSTALL/bin
set -gx FLYCTL_INSTALL "$HOME/.fly"
fish_add_path $FLYCTL_INSTALL/bin
set -l WS "/workspaces/project"
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
  deno run --allow-run --allow-env $WS/scripts/status.ts --once 2>/dev/null; or true
  echo ""
end

# ── Supervisord shortcuts ─────────────────────────────────────────────────────
alias svc-status="supervisorctl -c $_SCONF status"
alias svc-restart="supervisorctl -c $_SCONF restart"
alias svc-restart-all="supervisorctl -c $_SCONF restart all"
alias svc-logs="supervisorctl -c $_SCONF tail -f"
alias svc-ui="deno run --allow-run --allow-env $WS/scripts/status.ts"
alias start-trading="$WS/scripts/start-trading.sh"
alias stop-idle="$WS/scripts/stop-idle.sh"

# Legacy
alias restart-services="svc-restart-all"

# ── Per-service run aliases (debug / manual mode) ─────────────────────────────
alias run-frontend="cd $WS/frontend && npm run dev"
alias run-gateway="deno run --allow-all $WS/backend/src/gateway/gateway.ts"
alias run-market-sim="deno run --allow-all $WS/backend/src/market-sim/market-sim.ts"
alias run-ems="deno run --allow-all $WS/backend/src/ems/ems-server.ts"
alias run-oms="deno run --allow-all $WS/backend/src/oms/oms-server.ts"
alias run-journal="deno run --allow-all $WS/backend/src/journal/journal-server.ts"
alias run-user-service="deno run --allow-all $WS/backend/src/user-service/user-service.ts"
alias run-observability="deno run --allow-all $WS/observability/kafka-relay.ts"
alias run-analytics="deno run --allow-all $WS/backend/src/analytics/analytics-server.ts"
alias run-market-data="deno run --allow-all $WS/backend/src/market-data/market-data-service.ts"
alias run-feature-engine="deno run --allow-all $WS/backend/src/feature-engine/feature-engine.ts"
alias run-signal-engine="deno run --allow-all $WS/backend/src/signal-engine/signal-engine.ts"
alias run-recommendation="deno run --allow-all $WS/backend/src/recommendation-engine/recommendation-server.ts"
alias run-scenario-engine="deno run --allow-all $WS/backend/src/scenario-engine/scenario-server.ts"
alias run-llm-advisory="deno run --allow-all $WS/backend/src/llm-advisory/orchestrator.ts"
alias run-news="deno run --allow-all $WS/backend/src/news/news-aggregator.ts"
alias run-fix-archive="deno run --allow-all $WS/backend/src/fix/fix-archive.ts"
alias run-dark-pool="deno run --allow-all $WS/backend/src/dark-pool/dark-pool-server.ts"
alias run-ccp="deno run --allow-all $WS/backend/src/ccp/ccp-service.ts"
alias run-rfq="deno run --allow-all $WS/backend/src/rfq/rfq-service.ts"
alias run-limit-algo="deno run --allow-all $WS/backend/src/algo/limit-strategy.ts"
alias run-twap-algo="deno run --allow-all $WS/backend/src/algo/twap-strategy.ts"
alias run-pov-algo="deno run --allow-all $WS/backend/src/algo/pov-strategy.ts"
alias run-vwap-algo="deno run --allow-all $WS/backend/src/algo/vwap-strategy.ts"
alias run-iceberg-algo="deno run --allow-all $WS/backend/src/algo/iceberg-strategy.ts"
alias run-sniper-algo="deno run --allow-all $WS/backend/src/algo/sniper-strategy.ts"
alias run-arrival-price-algo="deno run --allow-all $WS/backend/src/algo/arrival-price-strategy.ts"
alias run-momentum-algo="deno run --allow-all $WS/backend/src/algo/momentum-strategy.ts"
alias run-is-algo="deno run --allow-all $WS/backend/src/algo/is-strategy.ts"
