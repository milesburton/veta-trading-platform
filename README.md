# VETA Trading Platform

**Live demo:** https://veta-trading.fly.dev/

A simulated equities trading environment built with Deno microservices and a React frontend. Includes a market price engine, execution and order management systems, seven algorithmic trading strategies, a market intelligence pipeline, FIX 4.4 protocol support, and an optional LLM advisory subsystem. All services run on a single Fly.io machine with Redpanda as the message bus.

## Documentation

- [Architecture & service map](docs/architecture.md)
- [API reference](docs/api/)
- [Deployment](docs/deployment.md)

## Project Structure

```
backend/src/
  market-sim/             Price engine and WebSocket feed
  ems/                    Execution Management System
  oms/                    Order Management System
  algo/                   Limit, TWAP, POV, VWAP, Iceberg, Sniper, Arrival Price strategies
  analytics/              Black-Scholes, Monte Carlo, rule-based recommendations
  feature-engine/         7-feature vector computation per symbol
  signal-engine/          Weighted signal scoring and backtest replay
  recommendation-engine/  Trade recommendations from high-confidence signals
  scenario-engine/        Factor-shock scenario analysis
  llm-advisory/           LLM advisory orchestrator + worker (opt-in)
  market-data/            Per-symbol source overrides (synthetic vs Alpha Vantage)
  market-data-adapters/   Earnings, dividend, and macro event seeding
  news/                   News aggregator with sentiment scoring
  user-service/           Session tokens, user accounts, trading limits
  journal/                Audit trail and candle store
  observability/          Event ingestion and SSE streaming
  fix/                    FIX 4.4 protocol engine and archive
  gateway/                API gateway / BFF (single browser entry point)

frontend/src/
  components/             UI panels (OrderTicket, MarketLadder, OrderBlotter, etc.)
  store/                  Redux Toolkit slices, RTK Query APIs, middleware
  hooks/                  useChannelOut, useChannelIn
  context/                TradingContext, ChannelContext
  tests/                  Playwright E2E tests
```

## Getting Started

The project runs inside a [Dev Container](https://containers.dev/). Open in VS Code with the Dev Containers extension to provision dependencies and start all services automatically.

```
Ctrl+Shift+P → Dev Containers: Rebuild and Reopen in Container
```

Copy the env template before the container starts if you want to customise ports or tuning parameters:

```sh
cp .env.template .env
```

## Backend

All backend services are written in Deno. Tasks are defined in `deno.json`.

```sh
deno task lint          # Lint backend source
deno task check         # Type-check backend source
deno task test          # Run unit tests
deno task test:smoke    # Run smoke tests (requires running services)
```

## Frontend

```sh
cd frontend
npm run dev           # Start dev server on port 8080
npm run build         # Production build
npm run typecheck     # Type-check without emitting
npm run test:unit     # Vitest unit tests
npm run test:ui       # Playwright E2E (headless)
npm run test:ui:headed  # Playwright E2E (headed)
```

## Deployment

See [docs/deployment.md](docs/deployment.md) for full instructions.

The live deployment runs on a single Fly.io machine (2 vCPUs, 4 GB RAM) in `iad`. All 30 services share the machine via supervisord.

## Licence

MIT Licence &copy; 2025 Miles Burton
