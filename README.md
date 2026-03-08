# VETA Trading Platform

**Virtual Equities Trading Application** — **Live demo:** https://virtual-equities-trading.fly.dev/

A simulated equities trading environment comprising a market price engine, execution and order management systems, algorithmic trading strategies, a market intelligence pipeline with LLM advisory, and a React frontend.

## Documentation

- [Architecture & service map](docs/architecture.md)
- [API reference](docs/api/)
- [Deployment](docs/deployment.md)

## Project Structure

```
backend/
  src/
    market-sim/             Price engine and WebSocket feed
    ems/                    Execution Management System
    oms/                    Order Management System
    algo/                   Limit, TWAP, POV, VWAP, Iceberg, Sniper, Arrival Price strategies
    analytics/              Black-Scholes, Monte Carlo, rule-based recommendations
    feature-engine/         7-feature FeatureVector computation per symbol
    signal-engine/          Weighted signal scoring and backtest replay
    recommendation-engine/  Trade recommendations from high-confidence signals
    scenario-engine/        Factor-shock scenario analysis
    llm-advisory/           LLM advisory orchestrator + worker (opt-in, local-only)
    market-data/            Per-symbol source overrides (synthetic vs Alpha Vantage)
    market-data-adapters/   Earnings, dividend, and macro event seeding
    news/                   News aggregator with sentiment scoring
    user-service/           Session tokens, user accounts, trading limits
    journal/                Audit trail + candle store (SQLite)
    observability/          Event ingestion and SSE streaming
    fix/                    FIX 4.4 protocol engine and archive
    gateway/                API Gateway / BFF (single browser entry point)
    lib/                    Shared utilities (messaging, time scale)
    types/                  Shared type definitions
    tests/                  Unit, integration, algo, and smoke tests
  .env.template             Environment variable reference

frontend/                   React + Vite + TypeScript trading UI
  src/
    components/             UI panels (OrderTicket, MarketLadder, OrderBlotter, etc.)
    store/                  Redux Toolkit slices, RTK Query APIs, and middleware
    hooks/                  useChannelOut, useChannelIn
    context/                TradingContext (DOM focus), ChannelContext
    tests/                  Playwright E2E tests

docs/
  architecture.md
  deployment.md
  api/

.devcontainer/              Dev Container definition
```

## Getting Started

The project is designed to run inside a [Dev Container](https://containers.dev/). Opening it in VS Code with the Dev Containers extension will provision all dependencies and start all services automatically.

```
Ctrl+Shift+P → Dev Containers: Rebuild and Reopen in Container
```

To configure ports or tuning parameters, copy the template before the container starts:

```sh
cp .env.template .env
```

## Backend

All backend services are written in Deno. Tasks are defined in `deno.json` at the repository root.

```sh
deno task lint          # Lint backend source
deno task check         # Type-check backend source
deno task test          # Run unit tests
deno task test:smoke    # Run smoke tests (requires running services)
deno task all           # lint → check → test → test:smoke
```

## Frontend

The frontend is a React + Vite application in `frontend/`.

```sh
cd frontend
npm run dev           # Start dev server on port 8080
npm run build         # Type-check and build for production
npm run typecheck     # Type-check without emitting
npm run lint          # Run Biome linter
npm run test:unit     # Run Vitest unit tests
```

### Playwright UI tests

```sh
npm run test:ui           # Headless
npm run test:ui:headed    # With visible browser
```

## Deployment

See [docs/deployment.md](docs/deployment.md) for Fly.io deployment instructions.

## Built with

[![Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-orange?logo=anthropic&logoColor=white)](https://claude.ai/claude-code)

This project was developed with [Claude Code](https://claude.ai/claude-code), Anthropic's AI coding assistant.

## Licence

MIT Licence &copy; 2025 Miles Burton
