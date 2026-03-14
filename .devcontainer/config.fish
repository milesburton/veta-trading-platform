# Deno setup
set -gx DENO_INSTALL "$HOME/.deno"
fish_add_path $DENO_INSTALL/bin
set -gx FLYCTL_INSTALL "$HOME/.fly"
fish_add_path $FLYCTL_INSTALL/bin

if status is-interactive
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | lolcat
  echo "  VETA Trading Platform" | lolcat
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | lolcat
  echo "  All 32 services start automatically via supervisord."
  echo "  Frontend UI → http://localhost:8080"
  echo ""
  echo "  Service quick-start aliases:" | lolcat
  echo "    run-frontend           Vite dev server   :5173 → proxied :8080"
  echo "    run-market-sim         GBM price engine            :5000"
  echo "    run-gateway            BFF / WebSocket hub         :5011"
  echo "    run-ems                Execution Mgmt System       :5001"
  echo "    run-oms                Order Mgmt System           :5002"
  echo "    run-journal            Trade journal / grid        :5009"
  echo "    run-user-service       Auth & session service      :5008"
  echo ""
  echo "  Algo strategies:" | lolcat
  echo "    run-limit-algo         LIMIT                       :5003"
  echo "    run-twap-algo          TWAP                        :5004"
  echo "    run-pov-algo           POV                         :5005"
  echo "    run-vwap-algo          VWAP                        :5006"
  echo "    run-iceberg-algo       ICEBERG                     :5021"
  echo "    run-sniper-algo        SNIPER                      :5022"
  echo "    run-arrival-price-algo ARRIVAL_PRICE               :5023"
  echo "    run-momentum-algo      MOMENTUM                    :5025"
  echo "    run-is-algo            IS (Impl. Shortfall)        :5026"
  echo ""
  echo "  Platform services:" | lolcat
  echo "    run-observability      Event store / Kafka relay   :5007"
  echo "    run-analytics          Black-Scholes / MC          :5014"
  echo "    run-market-data        Alpha Vantage adapter       :5015"
  echo "    run-news               News aggregator             :5013"
  echo "    run-feature-engine     ML feature pipeline         :5017"
  echo "    run-signal-engine      Signal scoring              :5018"
  echo "    run-recommendation     Trade recommendations       :5019"
  echo "    run-scenario-engine    Scenario analysis           :5020"
  echo "    run-llm-advisory       LLM advisory orchestrator   :5024"
  echo "    run-fix-archive        FIX execution archive       :5012"
  echo ""
  echo "  Supervisord:" | lolcat
  echo "    svc-status             Show all service statuses"
  echo "    svc-restart <name>     Restart a named service"
  echo "    svc-restart-all        Restart every service"
  echo "    svc-logs <name>        Tail stdout log for a service"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | lolcat
end

# ── Supervisord shortcuts ──────────────────────────────────────────────────────
set -l SVS "supervisorctl -c /home/deno/supervisord.conf"
alias svc-status="supervisorctl -c /home/deno/supervisord.conf status"
alias svc-restart="supervisorctl -c /home/deno/supervisord.conf restart"
alias svc-restart-all="supervisorctl -c /home/deno/supervisord.conf restart all && supervisorctl -c /home/deno/supervisord.conf status"
alias svc-logs="supervisorctl -c /home/deno/supervisord.conf tail -f"

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
