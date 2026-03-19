# ── Environment ───────────────────────────────────────────────────────────────
set -gx DENO_INSTALL "$HOME/.deno"
fish_add_path $DENO_INSTALL/bin
set -gx FLYCTL_INSTALL "$HOME/.fly"
fish_add_path $FLYCTL_INSTALL/bin

# ── Login banner — live service status snapshot ───────────────────────────────
if status is-interactive
  echo ""
  echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | lolcat
  echo "  VETA Trading Platform  •  http://localhost:8080" | lolcat
  echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | lolcat
  deno run --allow-run --allow-env /workspaces/virtual-equities-trading-application/scripts/status.ts --once 2>/dev/null; or true
  echo ""
  echo "  svc-ui · start-trading · stop-idle · svc-restart <name> · svc-logs <name>"
  echo ""
end

# ── Supervisord shortcuts ─────────────────────────────────────────────────────
alias svc-status="supervisorctl -c /home/deno/supervisord.conf status"
alias svc-restart="supervisorctl -c /home/deno/supervisord.conf restart"
alias svc-restart-all="supervisorctl -c /home/deno/supervisord.conf restart all"
alias svc-logs="supervisorctl -c /home/deno/supervisord.conf tail -f"
alias svc-ui="deno run --allow-run --allow-env /workspaces/virtual-equities-trading-application/scripts/status.ts"
alias start-trading="/workspaces/virtual-equities-trading-application/scripts/start-trading.sh"
alias stop-idle="/workspaces/virtual-equities-trading-application/scripts/stop-idle.sh"

# Legacy
alias restart-services="svc-restart-all"

# ── Per-service run aliases (debug / manual mode) ─────────────────────────────
set -l WS "/workspaces/virtual-equities-trading-application"

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
