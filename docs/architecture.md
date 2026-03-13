# Architecture

## Overview

VETA is a multi-service trading platform connected by a **Redpanda message bus** (Kafka-compatible). The React frontend talks to a single **API Gateway** — the only service the browser can reach. Everything else communicates via bus topics. The only exceptions are direct HTTP calls the gateway makes to the user-service for auth validation, and the scenario-engine fetching feature vectors from the feature-engine.

## Service Map

```
┌──────────────────────────────────────────────────────────────────┐
│                    React Frontend  (port 3000 dev / 8080 prod)   │
│                    Vite dev server or Nginx in production         │
└──────────────────────────────┬───────────────────────────────────┘
                               │  WebSocket + HTTP
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                   API Gateway / BFF  :5011                        │
│  • WebSocket hub — pushes market prices, order events, signals   │
│  • Proxies all data API endpoints (auth-gated)                   │
│  • Publishes orders.new to the bus when a user submits an order  │
│  • Validates the veta_user session cookie via the user-service   │
│  • Admin-only POST /load-test for bulk order injection           │
└───────────┬──────────────────┬───────────────────────────────────┘
            │ pub: orders.new  │ sub: market.ticks, orders.*,
            ▼                  │     algo.heartbeat, news.feed,
                               │     market.signals, market.features,
                               │     market.recommendations
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Redpanda Message Bus  :9092                      │
│                                                                  │
│  Trading:   market.ticks · orders.new · orders.submitted         │
│             orders.routed · orders.child · orders.filled         │
│             orders.expired · orders.rejected · orders.cancelled  │
│             algo.heartbeat · fix.execution                       │
│  Auth:      user.session · user.access                           │
│  News:      news.feed · news.signal · news.events.normalised     │
│  Intel:     market.external.events · market.features             │
│             market.signals · market.recommendations              │
└──┬───────┬──────┬────────────────────┬──────────┬───────────────┘
   │       │      │                    │          │
   ▼       ▼      ▼                    ▼          ▼
Market   OMS    Algo Strategies    Journal    Intelligence
Sim      :5002  :5003–5006         :5009      Pipeline
:5000           :5021–5026         (orders,   :5016–5023
                                   candles,
                     │             audit)
                     ▼
                   EMS :5001
                (fills + FIX reports)
```

## Service Ports

| Port | Service | Process name |
|---|---|---|
| 5000 | Market Simulator | `market-sim` |
| 5001 | EMS (Execution Management System) | `ems` |
| 5002 | OMS (Order Management System) | `oms` |
| 5003 | Limit Algo | `algo-trader` |
| 5004 | TWAP Algo | `twap-algo` |
| 5005 | POV Algo | `pov-algo` |
| 5006 | VWAP Algo | `vwap-algo` |
| 5007 | Observability | `observability` |
| 5008 | User Service | `user-service` |
| 5009 | Journal | `journal` |
| 5011 | Gateway | `gateway` |
| 5012 | FIX Archive | `fix-archive` |
| 5013 | News Aggregator | `news-aggregator` |
| 5014 | Analytics Service | `analytics-service` |
| 5015 | Market Data Service | `market-data-service` |
| 5016 | Market Data Adapters | `market-data-adapters` |
| 5017 | Feature Engine | `feature-engine` |
| 5018 | Signal Engine | `signal-engine` |
| 5019 | Recommendation Engine | `recommendation-engine` |
| 5020 | Scenario Engine | `scenario-engine` |
| 5021 | Iceberg Algo | `iceberg-algo` |
| 5022 | Sniper Algo | `sniper-algo` |
| 5023 | Arrival Price Algo | `arrival-price-algo` |
| 5024 | LLM Advisory Orchestrator | `llm-advisory` |
| 5025 | Momentum Algo | `momentum-algo` |
| 5026 | IS (Implementation Shortfall) Algo | `is-algo` |
| 9880 | FIX Exchange (TCP) | `fix-exchange` |
| 9881 | FIX Gateway (WebSocket bridge) | `fix-gateway` |

> Port 5010 (candle-store) was removed — candle aggregation is now handled inside the journal service.

## Order Flow

```
User submits order in the OrderTicket
  → WebSocket submitOrder → Gateway
  → orders.new published to bus
  → OMS validates: user limits (qty, notional, allowed strategies), rejects admins
  → orders.submitted + orders.routed published
  → Algo strategy picks up orders.routed (matched by strategy tag)
      Supported: LIMIT · TWAP · POV · VWAP · ICEBERG · SNIPER
                 ARRIVAL_PRICE · IS · MOMENTUM
  → orders.child published per execution slice
  → EMS fills the slice against simulated market price
      Picks venue, counterparty, liquidity flag; computes fees and commission
  → orders.filled + fix.execution published
  → Gateway forwards to all connected GUI clients as orderEvent
  → Redux: blotter and executions panel update in real time
```

Orders that fail validation publish `orders.rejected`. Kill-switch commands publish `orders.cancelled`. Expired orders (time-in-force elapsed) publish `orders.expired`.

## Algo Strategies

| Strategy | Port | Description |
|---|---|---|
| Limit | 5003 | Fires when market price crosses the limit price |
| TWAP | 5004 | Splits into equal slices spread evenly over the order lifetime |
| POV | 5005 | Executes a configurable percentage of simulated market volume |
| VWAP | 5006 | Weights slices by volume profile to track the rolling VWAP |
| Iceberg | 5021 | Shows only `visibleQty` at a time; refills until fully executed |
| Sniper | 5022 | Aggressive single-or-few-slice execution targeting best available price |
| Arrival Price | 5023 | Targets the price at order arrival; minimises slippage vs decision price |
| IS (Implementation Shortfall) | 5026 | Geometric decay schedule — front-loads volume to minimise opportunity cost |
| Momentum | 5025 | EMA crossover signal triggers tranches; cooldown prevents overtrading |

All algos subscribe to `orders.routed`, filter by their strategy tag, and publish `orders.child` when it's time to execute a slice.

## Intelligence Pipeline

The intelligence pipeline enriches market data into actionable trade recommendations. It runs independently of the order flow — it can only suggest, not act.

```
market.ticks ────────────────────────────────────┐
news.events.normalised (news-aggregator) ─────────┤→ Feature Engine :5017
market.external.events (market-data-adapters) ────┘  Computes 7 features per symbol
                                                         per tick; stores in SQLite
                                                              │ market.features
                                                              ▼
                                                     Signal Engine :5018
                                                     Weighted scoring → Signal
                                                     Configurable weights per factor
                                                              │ market.signals
                                                              ▼
                                                  Recommendation Engine :5019
                                                  confidence > 0.6 → TradeRecommendation
                                                              │ market.recommendations
                                                              ▼
                                                       Gateway → GUI panels
```

**Scenario Engine** (:5020): REST-only. Accepts `POST /scenario` with factor shocks, fetches the current FeatureVector from the Feature Engine, re-runs the signal scorer, and returns `{ baseline, shocked, delta }`.

**Signal Engine backtest** (:5018): `POST /replay` reconstructs approximate FeatureVectors from historical candles and returns a `ReplayFrame[]` array for the signal history overlay.

### Feature Vectors (7 features per symbol, ~4/s)

| Feature | Description |
|---|---|
| `momentum` | Price change over the last 20 ticks, normalised |
| `relativeVolume` | Current tick volume vs rolling 20-tick average |
| `realisedVol` | Annualised volatility from the last 120 one-minute candles |
| `sectorRelativeStrength` | Symbol return vs its sector average over 20 ticks |
| `eventScore` | Weighted sum of upcoming corporate events in the next 7 days |
| `newsVelocity` | News event count for the symbol in the last 60 seconds |
| `sentimentDelta` | Sentiment score now minus sentiment score 60 seconds ago |

### Signal Weights (admin-configurable via `PUT /intelligence/weights`)

| Factor | Default weight |
|---|---|
| momentum | 0.25 |
| sectorRelativeStrength | 0.20 |
| realisedVol | −0.15 (negative — high vol is penalised) |
| relativeVolume | 0.10 |
| eventScore | 0.10 |
| newsVelocity | 0.10 |
| sentimentDelta | 0.10 |

## Services

### API Gateway / BFF (port 5011)
The only service the browser talks to. Maintains a WebSocket hub and fans out all bus events to every connected GUI client in real time. Enforces authentication on all routes by validating the `veta_user` cookie against the User Service (cached for 10 seconds). Injects `userId` and `userRole` into every order before it reaches the bus. Debounces `market.signals` and `market.features` broadcasts at 500 ms.

Source: [backend/src/gateway/gateway.ts](../backend/src/gateway/gateway.ts)

### Market Simulator (port 5000)
Generates simulated prices for ~80 S&P 500 assets using Geometric Brownian Motion. Publishes `market.ticks` at 4 ticks/second with current prices, volumes, and order book snapshots. Consults the market-data-service every 30 seconds for per-symbol source overrides (synthetic vs Alpha Vantage).

Source: [backend/src/market-sim/market-sim.ts](../backend/src/market-sim/market-sim.ts)

### OMS — Order Management System (port 5002)
Subscribes to `orders.new`. Validates each order against the user's trading limits (max quantity, max daily notional, allowed strategies). Admin users are blocked from trading entirely. Accepted orders are enriched with an `orderId`, time-in-force, and routing metadata, then published as `orders.submitted` + `orders.routed`. On startup (and every 15 seconds) it sweeps the journal for any orders that expired while the OMS was offline and publishes `orders.expired` for them.

Source: [backend/src/oms/oms-server.ts](../backend/src/oms/oms-server.ts)

### EMS — Execution Management System (port 5001)
Subscribes to `orders.child`. Simulates real market microstructure: selects a venue (XNAS, XNYS, ARCX, …), a counterparty MPID, and a liquidity flag (MAKER/TAKER/CROSS). Computes fill price with market impact, SEC Section 31 fee, FINRA TAF, and commission. Publishes `orders.filled` and `fix.execution`.

Source: [backend/src/ems/ems-server.ts](../backend/src/ems/ems-server.ts)

### Journal (port 5009)
Dual-purpose SQLite service. As an **audit trail** it subscribes to all order and user topics and persists every event with 90-day retention, exposing `POST /grid/query` for filtered, sorted, paginated queries. As a **candle store** it subscribes to `market.ticks` and aggregates OHLCV candles at 1-minute and 5-minute intervals (capped at 120 per symbol), exposing `GET /candles`.

Source: [backend/src/journal/journal-server.ts](../backend/src/journal/journal-server.ts)

### Observability (port 5007)
Subscribes to all bus topics except high-frequency market ticks. Persists events to SQLite with 24-hour retention. Streams events to the frontend via SSE (`GET /stream`). Also accepts `POST /events/batch` for client-side events (login, logout, order attempts).

Source: [backend/src/observability/observability-server.ts](../backend/src/observability/observability-server.ts)

### User Service (port 5008)
Manages user accounts, session tokens, and per-user trading limits. Used internally by the Gateway (token validation) and OMS (limit lookup). Not reachable from the browser — all access is proxied through the Gateway.

Source: [backend/src/user-service/user-service.ts](../backend/src/user-service/user-service.ts)

### News Aggregator (port 5013)
Polls configured news sources, extracts ticker mentions, scores sentiment, and publishes to three bus topics: `news.feed` (forwarded to the GUI), `news.signal` (for algo consumption), and `news.events.normalised` (typed events consumed by the Feature Engine).

Source: [backend/src/news/news-aggregator.ts](../backend/src/news/news-aggregator.ts)

### FIX Archive (port 5012)
Subscribes to `fix.execution` and persists execution reports to SQLite in FIX 4.4 format. Exposes `GET /executions` for historical execution report queries.

Source: [backend/src/fix-archive/fix-archive.ts](../backend/src/fix-archive/fix-archive.ts)

### Analytics Service (port 5014)
REST-only quantitative analysis service:
- `POST /quote` — Black-Scholes option pricing
- `POST /scenario` — Monte Carlo scenario grid (vol/price shocks)
- `POST /recommend` — Rule-based trade recommendations

Source: [backend/src/analytics/analytics-service.ts](../backend/src/analytics/analytics-service.ts)

### Market Data Service (port 5015)
Manages per-symbol data source overrides (synthetic GBM vs Alpha Vantage). Polls Alpha Vantage GLOBAL_QUOTE round-robin every 5 minutes and seeds intraday time series to the journal on startup.

Source: [backend/src/market-data-service/market-data-service.ts](../backend/src/market-data-service/market-data-service.ts)

### Market Data Adapters (port 5016)
Seeds earnings calendar, dividend, and macro economic events for ~80 S&P 500 symbols. Publishes `market.external.events` consumed by the Feature Engine. Events are spread across a 90-day window for realistic scheduling.

Source: [backend/src/market-data-adapters/adapter-server.ts](../backend/src/market-data-adapters/adapter-server.ts)

### Feature Engine (port 5017)
Subscribes to `market.ticks`, `news.events.normalised`, and `market.external.events`. Computes the 7-feature `FeatureVector` per symbol on every tick and publishes to `market.features` (batched at 250 ms). Stores the last 500 vectors per symbol in SQLite. Exposes `GET /features/:symbol` and `GET /features/:symbol/history`.

Source: [backend/src/feature-engine/feature-engine.ts](../backend/src/feature-engine/feature-engine.ts)

### Signal Engine (port 5018)
Subscribes to `market.features`. Applies configurable weighted scoring across all 7 features (weights stored in SQLite, admin-configurable via `PUT /weights`). Publishes `Signal` objects to `market.signals`. Exposes `POST /replay` for backtest signal replay against historical candle data.

Source: [backend/src/signal-engine/signal-engine.ts](../backend/src/signal-engine/signal-engine.ts)

### Recommendation Engine (port 5019)
Subscribes to `market.signals`. Generates `TradeRecommendation` objects for signals with confidence > 0.6, including suggested quantity, direction, and the top two contributing factors as rationale. Publishes to `market.recommendations`.

Source: [backend/src/recommendation-engine/recommendation-server.ts](../backend/src/recommendation-engine/recommendation-server.ts)

### Scenario Engine (port 5020)
REST-only. Accepts `POST /scenario` with a symbol and a list of factor shocks. Fetches the current FeatureVector from the Feature Engine, applies the shocks, re-runs the signal scorer, and returns `{ baseline, shocked, delta }`.

Source: [backend/src/scenario-engine/scenario-server.ts](../backend/src/scenario-engine/scenario-server.ts)

---

## LLM Advisory Subsystem

An **advisory-only** layer that reads signal and recommendation data and produces natural-language commentary. It has no write path to the order bus — it cannot submit, modify, or cancel orders. The deterministic engines are always the source of truth.

Key principles:
- The LLM worker runs **locally within the container** using Ollama (default model: `qwen2.5:3b`). No external inference APIs are called by default.
- **Fully isolated from execution** — the worker only reads from the intelligence pipeline and writes to its own SQLite store.
- Safe defaults: `LLM_ENABLED=false`, `LLM_WORKER_ENABLED=false`.
- The worker **never auto-restarts** — it is launched on-demand and exits after hitting its job limit or idle timeout.

### LLM Advisory Orchestrator (port 5024)
Manages job scheduling, runtime configuration, and worker lifecycle. Admin REST endpoints (all require admin role):

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/state` | Current subsystem status, pending jobs, effective policy |
| `PUT` | `/admin/state` | Patch runtime config (enable/disable, change trigger mode) |
| `POST` | `/admin/watchlist-brief` | Queue one advisory job for every tracked symbol |
| `POST` | `/admin/trigger-worker` | Start the LLM worker process |

### Subsystem States

| State | Condition |
|---|---|
| `disabled` | `LLM_ENABLED = false` |
| `armed` | Enabled, no pending jobs, cooldown elapsed |
| `active` | Enabled, jobs in queue |
| `cooldown` | Enabled, no jobs, last activity too recent |
| `error` | Enabled, last error within 30 s |

Source: [backend/src/llm-advisory/](../backend/src/llm-advisory/)

---

## Frontend Architecture

The React frontend (Vite + Redux Toolkit) uses a single `gatewayMiddleware` for all backend communication. On startup it opens a WebSocket to the gateway and keeps it alive with exponential-backoff reconnection.

### Redux Slices

| Slice | What it holds |
|---|---|
| `authSlice` | Logged-in user + trading limits (set by `authIdentity` WS event) |
| `ordersSlice` | Full order tree with children; updated by every `orderEvent` |
| `marketSlice` | Latest price per symbol; updated by `marketUpdate` events |
| `observabilitySlice` | Bus event log; updated by SSE stream |
| `newsSlice` | Latest news per symbol; updated by `newsUpdate` events |
| `intelligenceSlice` | Signals, features, recommendations keyed by symbol |
| `llmSubsystemSlice` | LLM Advisory Subsystem status; updated by `llmStateUpdate` events |
| `killSwitchSlice` | Active kill-switch state; blocks order submission when held |
| `alertsSlice` | In-app alert feed (service down, fill rate degraded, order flood) |

### Dashboard Panels

The FlexLayout-based dashboard supports 20+ panel types registered in `panelRegistry.ts`. Layout templates are defined in `layoutModels.ts`.

| Panel | Description | Singleton |
|---|---|---|
| `market-ladder` | Live bid/ask/price table for all symbols | ✓ |
| `order-ticket` | Order entry form — equities, options, and bonds | — |
| `order-blotter` | Order and fill history grid | ✓ |
| `candle-chart` | OHLCV candlestick chart | — |
| `executions` | FIX execution report viewer | ✓ |
| `algo-monitor` | Algo heartbeat and strategy status | ✓ |
| `observability` | Bus event stream viewer | ✓ |
| `decision-log` | Rejected and expired order log | ✓ |
| `news-feed` | News feed with sentiment indicators | ✓ |
| `market-depth` | Level-2 order book depth chart | — |
| `market-data-sources` | Alpha Vantage source override (admin only) | ✓ |
| `option-pricing` | Black-Scholes option pricer | ✓ |
| `scenario-matrix` | Monte Carlo vol/price scenario grid | ✓ |
| `trade-recommendation` | Rule-based trade suggestions | ✓ |
| `research-radar` | Signal score × confidence bubble chart | ✓ |
| `instrument-analysis` | Per-symbol feature bars, signal gauge, and backtest | — |
| `signal-explainability` | Factor contribution waterfall chart | ✓ |
| `service-health` | Service health grid with version polling | ✓ |
| `throughput-gauges` | Orders/min, fills/min, fill rate, bus events (last 60 s) | ✓ |
| `algo-leaderboard` | Fill rate and slippage comparison by strategy | ✓ |
| `load-test` | Admin-only bulk order injection form | ✓ |
| `llm-subsystem` | LLM Advisory operator controls (admin only) | ✓ |
| `demo-day` | Pre-built demo scenarios for presentations | ✓ |
| `estate-overview` | Service health + throughput gauges + alert feed | ✓ |

### Layout Templates

| Template | Description |
|---|---|
| Default (Trading) | 4-column workstation — market ladder, order ticket, blotter, chart |
| Analysis | Market ladder + candle chart + analytics panels |
| Research | Signal radar + instrument analysis + explainability |
| Market Overview | 3-column price-focused layout |
| Mission Control (Admin) | Service health + throughput + algo leaderboard + load test + LLM subsystem |
| AI Advisory | Signal radar → instrument analysis + price chart + order entry |
| Intelligence Hub | Signal radar + heatmap → feature deep-dive + recommendations → news |
| FI Analysis | Fixed income panels — spread analysis, duration ladder, vol surface |

## Authentication

Sessions are stored as `veta_user` HTTP-only cookies set by the User Service at login. The Gateway validates this cookie on every WebSocket connection and every HTTP proxy request (cached 10 seconds). Admin users can view all panels but cannot submit orders — blocked at both the OMS (bus) and UI (OrderTicket hidden) levels.

Four built-in personas:

| User | Role | Default strategies |
|---|---|---|
| alice | trader (high-touch) | All strategies |
| bob | trader (algo) | TWAP, POV, VWAP, ICEBERG, SNIPER, ARRIVAL_PRICE, IS, MOMENTUM |
| carol | trader (fixed income) | LIMIT |
| david | read-only analyst | None (no order submission) |

## Testing

| Suite | Command | What it covers |
|---|---|---|
| Backend smoke | `deno test --allow-all backend/src/tests/smoke.test.ts` | Health checks, WS pipeline, order submission, journal, news |
| Backend integration | `deno test --allow-all backend/src/tests/integration.test.ts` | End-to-end order fill, algo slice counts, fill rates |
| Algo integration | `deno test --allow-all backend/src/tests/algo.integration.test.ts` | LIMIT/TWAP/ICEBERG/SNIPER/ARRIVAL_PRICE fill + performance assertions |
| Load test | `deno test --allow-all backend/src/tests/load.test.ts` | Bulk injection, pipeline throughput, fill rate under load |
| Frontend unit | `cd frontend && npm run test:unit` | Redux slices, components, panel registry, layout models (570+ tests) |
| Frontend E2E | `cd frontend && npx playwright test` | Auth, market data, order placement, fixed income (34 tests, mocked gateway) |

## Process Management

All services run under **supervisord**. In the Dev Container they start automatically on launch.

```bash
# Check all services
supervisorctl -c /home/deno/supervisord.conf status

# Restart a single service
supervisorctl -c /home/deno/supervisord.conf restart <name>
```

Service names: `market-sim`, `ems`, `oms`, `algo-trader`, `twap-algo`, `pov-algo`, `vwap-algo`, `iceberg-algo`, `sniper-algo`, `arrival-price-algo`, `is-algo`, `momentum-algo`, `observability`, `user-service`, `journal`, `fix-archive`, `news-aggregator`, `analytics-service`, `market-data-service`, `market-data-adapters`, `feature-engine`, `signal-engine`, `recommendation-engine`, `scenario-engine`, `llm-advisory`, `gateway`

The `llm-worker` is registered separately with `autostart=false` and `autorestart=false`. It is started on-demand via `POST /admin/trigger-worker` and exits after hitting its job or idle-timeout limit.

## Deployment

### Fly.io (cloud demo)

The entire platform runs as a **single VM** on Fly.io. All services start under supervisord inside one container. The Fly.io load balancer exposes a single HTTPS endpoint on port 443 (internally 8080) — this is where Nginx serves the built frontend and the gateway runs behind it.

There is no Traefik on Fly.io — it isn't needed because there's only one public endpoint. Fly's built-in layer-7 proxy handles HTTPS termination.

```
fly.toml
  internal_port = 8080   → Fly load balancer → HTTPS on veta-trading.fly.dev
  force_https = true
  auto_stop_machines = "suspend"   (suspends when idle, resumes on first request)
  min_machines_running = 1
```

Data is persisted to a 10 GB Fly volume mounted at `/app/backend/data`.

Deploy command:
```bash
flyctl deploy --remote-only \
  --build-arg VITE_COMMIT_SHA=$(git rev-parse --short HEAD) \
  --build-arg VITE_BUILD_DATE=$(date -u +%Y-%m-%d)
```

### Homelab (self-hosted)

The homelab runs the same Docker image pulled from GHCR, orchestrated by Docker Compose with **Traefik** as the reverse proxy.

```
docker-compose.homelab.yml
  veta-traefik     :8888 (dashboard) + :80/:443 (routing)
  veta-app         the main container (all services inside)
  veta-disk-monitor :8099 (disk health endpoint for Uptime Kuma)
```

Traefik routes by path prefix:
- `/ws/gateway` → gateway WebSocket (port 5011)
- `/api/gateway` → gateway HTTP (port 5011, strips prefix)

Watchtower watches for new images tagged `:latest` on GHCR and automatically restarts the stack. When a new commit lands on `main` and CI passes, the updated image is live within ~5 minutes.

The disk monitor (`scripts/disk-monitor.py`) runs on port 8099, returns 200 when disk < 85%, 503 when critical, and auto-prunes dangling Docker images when disk exceeds 90%.

URL: `http://veta.home` (add `192.168.1.245 veta.home` to `/etc/hosts`)
