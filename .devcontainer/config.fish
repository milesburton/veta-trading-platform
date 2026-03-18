# Deno setup
set -gx DENO_INSTALL "$HOME/.deno"
fish_add_path $DENO_INSTALL/bin
set -gx FLYCTL_INSTALL "$HOME/.fly"
fish_add_path $FLYCTL_INSTALL/bin

if status is-interactive
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | lolcat
  echo "  VETA Trading Platform — dev container" | lolcat
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | lolcat
  echo "  Frontend UI  →  http://localhost:8080"
  echo ""
  echo "  Service management:" | lolcat
  echo "    svc-ui                 Live status dashboard (all groups)"
  echo "    start-trading          Start all idle-safe service groups"
  echo "    stop-idle              Stop idle-safe groups (keep core)"
  echo "    svc-status             Raw supervisorctl status"
  echo "    svc-restart <name>     Restart a named service"
  echo "    svc-logs <name>        Tail stdout log for a service"
  echo ""
  echo "  Core (always-on): market-sim  journal  gateway  oms  ems" | lolcat
  echo "  Idle groups: algos  microstructure  analytics  aux" | lolcat
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | lolcat
  echo ""
  # Show a one-shot status snapshot on login (no live loop)
  deno run --allow-run --allow-env /workspaces/virtual-equities-trading-application/scripts/status.ts --once 2>/dev/null; or true
end

# ── Supervisord shortcuts ──────────────────────────────────────────────────────
set -l SVS "supervisorctl -c /home/deno/supervisord.conf"
alias svc-status="supervisorctl -c /home/deno/supervisord.conf status"
alias svc-restart="supervisorctl -c /home/deno/supervisord.conf restart"
alias svc-restart-all="supervisorctl -c /home/deno/supervisord.conf restart all && supervisorctl -c /home/deno/supervisord.conf status"
alias svc-logs="supervisorctl -c /home/deno/supervisord.conf tail -f"

# Live service status dashboard (press q to quit)
alias svc-ui="deno run --allow-run --allow-env /workspaces/virtual-equities-trading-application/scripts/status.ts"

# Idle-safe service group control
alias start-trading="/workspaces/virtual-equities-trading-application/scripts/start-trading.sh"
alias stop-idle="/workspaces/virtual-equities-trading-application/scripts/stop-idle.sh"

# Legacy alias kept for muscle memory
alias restart-services="svc-restart-all"

# ── Individual service run aliases (manual / debug mode) ───────────────────────
set -l WS "/workspaces/virtual-equities-trading-application"

alias run-frontend="cd $WS/frontend && npm run dev"
alias run-gateway="cd $WS && deno run --allow-all backend/src/gateway/gateway.ts"
alias run-market-sim="cd $WS && deno run --allow-all backend/src/market-sim/market-sim.ts"
alias run-ems="cd $WS && deno run --allow-all backend/src/ems/ems-server.ts"
alias run-oms="cd $WS && deno run --allow-all backend/src/oms/oms-server.ts"
alias run-journal="cd $WS && deno run --allow-all backend/src/journal/journal-server.ts"
alias run-user-service="cd $WS && deno run --allow-all backend/src/user-service/user-service.ts"
alias run-observability="cd $WS && deno run --allow-all observability/kafka-relay.ts"
alias run-analytics="cd $WS && deno run --allow-all backend/src/analytics/analytics-server.ts"
alias run-market-data="cd $WS && deno run --allow-all backend/src/market-data/market-data-service.ts"
alias run-news="cd $WS && deno run --allow-all backend/src/news/news-aggregator.ts"
alias run-feature-engine="cd $WS && deno run --allow-all backend/src/feature-engine/feature-engine.ts"
alias run-signal-engine="cd $WS && deno run --allow-all backend/src/signal-engine/signal-engine.ts"
alias run-recommendation="cd $WS && deno run --allow-all backend/src/recommendation-engine/recommendation-server.ts"
alias run-scenario-engine="cd $WS && deno run --allow-all backend/src/scenario-engine/scenario-server.ts"
alias run-llm-advisory="cd $WS && deno run --allow-all backend/src/llm-advisory/orchestrator.ts"
alias run-fix-archive="cd $WS && deno run --allow-all backend/src/fix/fix-archive.ts"

# Algo strategies
alias run-limit-algo="cd $WS && deno run --allow-all backend/src/algo/limit-strategy.ts"
alias run-twap-algo="cd $WS && deno run --allow-all backend/src/algo/twap-strategy.ts"
alias run-pov-algo="cd $WS && deno run --allow-all backend/src/algo/pov-strategy.ts"
alias run-vwap-algo="cd $WS && deno run --allow-all backend/src/algo/vwap-strategy.ts"
alias run-iceberg-algo="cd $WS && deno run --allow-all backend/src/algo/iceberg-strategy.ts"
alias run-sniper-algo="cd $WS && deno run --allow-all backend/src/algo/sniper-strategy.ts"
alias run-arrival-price-algo="cd $WS && deno run --allow-all backend/src/algo/arrival-price-strategy.ts"
alias run-momentum-algo="cd $WS && deno run --allow-all backend/src/algo/momentum-strategy.ts"
alias run-is-algo="cd $WS && deno run --allow-all backend/src/algo/is-strategy.ts"
