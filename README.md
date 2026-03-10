# VETA Trading Platform

**Live demo:** https://veta-trading.fly.dev/

A simulated equities trading environment built with Deno microservices and a React frontend. Includes a market price engine, execution and order management systems, seven algorithmic trading strategies, a market intelligence pipeline, FIX 4.4 protocol support, an optional LLM advisory subsystem, and a native desktop app (Electron). All services run on a single Fly.io machine with Redpanda as the message bus.

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
  llm-advisory/           LLM advisory orchestrator + worker (opt-in, local Ollama)
  market-data/            Per-symbol source overrides (synthetic vs Alpha Vantage)
  market-data-adapters/   Earnings, dividend, and macro event seeding
  news/                   News aggregator with sentiment scoring
  user-service/           Session tokens, user accounts, trading limits
  journal/                Audit trail and candle store (90-day retention)
  observability/          Event ingestion and SSE streaming
  fix/                    FIX 4.4 protocol engine and archive
  gateway/                API gateway / BFF (single browser entry point)

frontend/src/
  components/             UI panels (OrderTicket, MarketLadder, OrderBlotter, etc.)
  store/                  Redux Toolkit slices, RTK Query APIs, middleware
  hooks/                  useChannelOut, useChannelIn
  context/                TradingContext, ChannelContext
  tests/                  Playwright E2E tests

frontend/electron/
  main.ts                 Electron main process (tray, deep links, single-instance lock)
  preload.ts              Context-bridge API exposed to renderer
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

## Running the Frontend

There are three modes:

### Browser (default)

```sh
cd frontend
npm run dev          # Vite dev server on :5173, proxies to local backend
```

Open http://localhost:5173 in a browser. Backend services must already be running (started automatically by the Dev Container via supervisord).

### Electron — development

```sh
cd frontend
npm run electron:dev # Vite + vite-plugin-electron, launches Electron with hot reload
```

Requires the backend to be running. The Electron window connects to the same local backend as browser mode. DevTools open automatically in a detached window.

### Electron — production build

```sh
cd frontend
npm run electron:build  # tsc → vite build → electron-builder → dist-app/
```

Produces platform-specific distributable:

| Platform | Output |
|---|---|
| macOS | `dist-app/VETA Trading Platform-1.0.0-universal.dmg` |
| Windows | `dist-app/VETA Trading Platform Setup 1.0.0.exe` |
| Linux | `dist-app/VETA Trading Platform-1.0.0.AppImage` |

Pre-built desktop releases are published on the [GitHub Releases page](../../releases) for each version tag.

### Desktop app features

- **System tray**: Closing the window hides to tray; double-click to restore. WebSocket connection to the backend is preserved while hidden.
- **Deep links**: `veta://` protocol registered at OS level. Click a `veta://` link to bring the app to the foreground (single-instance lock on Windows/Linux; `open-url` event on macOS).
- **Version in title bar**: Displays `VETA Trading Platform v1.0.0`.
- **Native file save**: Export dialog for layout/data exports via OS file picker.

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
npm run dev             # Start browser dev server on :5173
npm run build           # Production browser build
npm run electron:dev    # Start Electron in dev mode (hot reload)
npm run electron:build  # Build distributable Electron app
npm run typecheck       # Type-check without emitting
npm run test:unit       # Vitest unit tests
npm run test:ui         # Playwright E2E (headless)
npm run test:ui:headed  # Playwright E2E (headed)
```

## LLM Advisory

The LLM advisory subsystem uses a local [Ollama](https://ollama.com/) instance — no external API key is required. The model (`qwen2.5:3b`, ~2 GB) is pulled automatically on first startup.

To disable it entirely, set `LLM_ENABLED=false` in `.env`.

## Deployment

See [docs/deployment.md](docs/deployment.md) for full instructions.

The live deployment runs on a single Fly.io machine (2 vCPUs, 4 GB RAM) in `iad`. All services share the machine via supervisord. The machine is kept warm (`min_machines_running = 1`, `auto_stop_machines = suspend`) to avoid Redpanda state loss on cold start.

## Licence

MIT Licence &copy; 2025 Miles Burton
