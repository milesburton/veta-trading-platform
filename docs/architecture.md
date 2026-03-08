# Architecture

## Overview

The VETA Platform is a multi-service backend connected by a **Redpanda message bus** (Kafka-compatible). The React + Vite frontend connects to a single **API Gateway** — the only service reachable from the browser. All inter-service communication flows through bus topics; no service calls another service directly over HTTP (except the gateway→user-service for auth validation and the scenario-engine→feature-engine for feature lookups).

## Service Map

```
┌──────────────────────────────────────────────────────────────────┐
│                    React Frontend  :8080                          │
│                 (Vite dev server / Nginx in prod)                 │
└──────────────────────────────┬───────────────────────────────────┘
                               │  WebSocket + HTTP  (single connection)
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                 API Gateway / BFF  :5011                          │
│  • WebSocket hub — pushes market, order, signal, feature events   │
│  • Proxies all data endpoints (auth-gated)                        │
│  • Publishes orders.new to bus on submitOrder WS message          │
│  • Validates veta_user session cookie via user-service            │
│  • Admin-only POST /load-test for bulk order injection            │
└───────────┬──────────────────┬───────────────────────────────────┘
            │ pub: orders.new  │ sub: market.ticks, orders.*, algo.heartbeat,
            ▼                  │     news.feed, market.signals, market.features,
                               │     market.recommendations
                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        Redpanda Message Bus  :9092                                   │
│                                                                                      │
│  Core:      market.ticks · orders.new · orders.submitted · orders.routed             │
│             orders.child · orders.filled · orders.expired · orders.rejected          │
│             algo.heartbeat · user.session · user.access · fix.execution              │
│  News:      news.feed · news.signal · news.events.normalised                         │
│  Intel:     market.external.events · market.features · market.signals                │
│             market.recommendations                                                   │
└──┬───────┬──────────┬──────────────────┬────────────────┬───────────┬───────────────┘
   │       │          │                  │                │           │
   ▼       ▼          ▼                  ▼                ▼           ▼
Market   OMS      Algo Strategies    Journal :5009   Observability  Intelligence
Sim      :5002    Limit  :5003       (audit trail     :5007          Pipeline
:5000    (route   TWAP   :5004        + candle store)  (events SSE)  :5016–5020
         →        POV    :5005
         orders.  VWAP   :5006
         routed)  Iceberg:5016*
                  Sniper :5017*
                  ArrPx  :5018*
                  → EMS :5001
                  → orders.filled
```

*Note: Iceberg, Sniper, and Arrival Price algos share port range 5016–5018 with intelligence services in the original plan but are at separate ports in this deployment — see [Service Ports](#service-ports) below.*

## Service Ports

| Port | Service | Supervisord name |
|---|---|---|
| 5000 | Market Simulator | `market-sim` |
| 5001 | EMS | `ems` |
| 5002 | OMS | `oms` |
| 5003 | Limit Algo | `algo-trader` |
| 5004 | TWAP Algo | `twap-algo` |
| 5005 | POV Algo | `pov-algo` |
| 5006 | VWAP Algo | `vwap-algo` |
| 5007 | Observability | `observability` |
| 5008 | User Service | `user-service` |
| 5009 | Journal | `journal` |
| 5010 | Candle Store | `candle-store` |
| 5011 | Gateway | `gateway` |
| 5012 | FIX Archive | `fix-archive` |
| 5013 | News Aggregator | `news-aggregator` |
| 5014 | Analytics Service | `analytics-service` |
| 5015 | Market Data Service | `market-data-service` |
| 5016 | Iceberg Algo | `iceberg-algo` |
| 5017 | Sniper Algo | `sniper-algo` |
| 5018 | Arrival Price Algo | `arrival-price-algo` |
| 5019 | Market Data Adapters | `market-data-adapters` |
| 5020 | Feature Engine | `feature-engine` |
| 5021 | Signal Engine | `signal-engine` |
| 5022 | Recommendation Engine | `recommendation-engine` |
| 5023 | Scenario Engine | `scenario-engine` |
| 5024 | LLM Orchestrator | `llm-advisory` |

## Order Flow

```
GUI (OrderTicket)
  → WS submitOrder → Gateway
  → orders.new (bus)
  → OMS: validates limits, assigns orderId, routes by strategy
  → orders.submitted + orders.routed (bus)
  → Algo (LIMIT / TWAP / POV / VWAP / ICEBERG / SNIPER / ARRIVAL_PRICE)
  → orders.child per slice (bus)
  → EMS: fills against market price, computes fees, publishes FIX report
  → orders.filled (bus)
  → Gateway: forwards to GUI as orderEvent
  → GUI Redux: fillReceived → order blotter + executions panel
```

Rejected orders (limit violation, expired session, admin role) publish `orders.rejected`. The OMS and Gateway both emit rejections.

## Intelligence Pipeline

```
market.ticks ──────────────────────────────────┐
news.events.normalised (from news-aggregator) ──┤→ Feature Engine :5019
market.external.events (from mkt-data-adapters)─┘  (7-feature FeatureVector per symbol)
                                                        │ market.features
                                                        ▼
                                                Signal Engine :5020
                                                (weighted scoring → Signal)
                                                        │ market.signals
                                                        ▼
                                               Recommendation Engine :5021
                                               (confidence > 0.6 → TradeRecommendation)
                                                        │ market.recommendations
                                                        ▼
                                                    Gateway → GUI
```

**Scenario Engine** (:5022): REST-only. Accepts `POST /scenario` with factor shocks, fetches the current FeatureVector from the Feature Engine, re-runs the signal scorer, returns `{ baseline, shocked, delta }`.

**Signal Engine backtest**: `POST /replay` accepts `{ symbol, from, to }`, reconstructs approximate FeatureVectors from historical candles, and returns a `ReplayFrame[]` array for signal history overlays.

### Feature Vectors (7 features per symbol, ~4/s)

| Feature | Description |
|---|---|
| `momentum` | (currentPrice − price20TicksAgo) / price20TicksAgo |
| `relativeVolume` | currentVol / rolling-20-tick average volume |
| `realisedVol` | Annualised std dev from last 120 1-min candles |
| `sectorRelativeStrength` | Symbol return vs sector average over 20 ticks |
| `eventScore` | Sum of upcoming-event impact weights (next 7 days) |
| `newsVelocity` | News event count for symbol in last 60 s |
| `sentimentDelta` | sentimentScore[now] − sentimentScore[60 s ago] |

### Signal Weights (configurable via `PUT /intelligence/weights`, admin only)

| Factor | Default weight |
|---|---|
| momentum | 0.25 |
| sectorRelativeStrength | 0.20 |
| realisedVol | −0.15 |
| relativeVolume | 0.10 |
| eventScore | 0.10 |
| newsVelocity | 0.10 |
| sentimentDelta | 0.10 |

## Services

### API Gateway / BFF (port 5011)
The only service the browser talks to. Maintains a WebSocket hub and fans out all bus events to every connected GUI client. Enforces authentication on all routes via `veta_user` cookie validated against the User Service (10 s cache). Injects `userId` and `userRole` into every order before it reaches the bus. Debounces `market.signals` and `market.features` broadcasts at 500 ms to avoid flooding connected clients.

Source: [backend/src/gateway/gateway.ts](../backend/src/gateway/gateway.ts)

### Market Simulator (port 5000)
Generates simulated prices for ~80 S&P 500 assets using a Geometric Brownian Motion engine. Publishes `market.ticks` to the bus at 4 ticks/second with current prices, volumes, and order book snapshots. Consults market-data-service every 30 s for per-symbol source overrides (synthetic vs Alpha Vantage).

Source: [backend/src/market-sim/market-sim.ts](../backend/src/market-sim/market-sim.ts)

### Order Management System — OMS (port 5002)
Subscribes to `orders.new`. Validates each order against the submitting user's trading limits (max qty, max daily notional, allowed strategies). Rejects admin users from trading. Routes accepted orders to the appropriate algo strategy by publishing `orders.submitted` and `orders.routed`.

Source: [backend/src/oms/oms-server.ts](../backend/src/oms/oms-server.ts)

### Algo Strategies (ports 5003–5006, 5016–5018)
Each strategy subscribes to `orders.routed` and handles orders matching its strategy tag. When it's time to execute a slice it publishes `orders.child` for the EMS to fill.

| Strategy | Port | Logic |
|---|---|---|
| Limit | 5003 | Watches market price; fires when price crosses limit |
| TWAP | 5004 | Equal-sized slices spread evenly over order lifetime |
| POV | 5005 | Executes a % of simulated market volume per interval |
| VWAP | 5006 | Tracks rolling VWAP; slices weighted by volume profile |
| Iceberg | 5016 | Shows only `visibleQty` at a time; re-slices until filled |
| Sniper | 5017 | Aggressive single-or-few slice execution at best price |
| Arrival Price | 5018 | Targets the arrival (decision) price; minimises slippage |

Sources: [backend/src/algo/](../backend/src/algo/)

### Execution Management System — EMS (port 5001)
Subscribes to `orders.child`. Simulates market microstructure: picks a venue (XNAS, XNYS, ARCX, …), counterparty, and liquidity flag (MAKER/TAKER/CROSS). Computes fill price with market impact, SEC fee, FINRA TAF, and commission. Publishes `orders.filled` and `fix.execution`.

Source: [backend/src/ems/ems-server.ts](../backend/src/ems/ems-server.ts)

### Journal (port 5009)
Dual-purpose SQLite service:
- **Audit trail**: Subscribes to all order, user, and access topics; persists every event with 90-day retention. Exposes `POST /grid/query` for filtered, sorted, paginated queries.
- **Candle store**: Subscribes to `market.ticks`; aggregates OHLCV candles at 1-minute and 5-minute intervals (capped at 120 per instrument). Exposes `GET /candles`.

Source: [backend/src/journal/journal-server.ts](../backend/src/journal/journal-server.ts)

### Observability (port 5007)
Subscribes to all bus topics (excluding high-frequency market ticks). Persists events to SQLite with 24-hour retention. Streams events to the frontend Observability panel via SSE (`GET /stream`). Also accepts `POST /events/batch` for client-side events.

Source: [backend/src/observability/observability-server.ts](../backend/src/observability/observability-server.ts)

### User Service (port 5008)
Manages user accounts, session tokens (`veta_user` cookie), and per-user trading limits. Used internally by the Gateway (token validation) and OMS (limit lookup). Not directly reachable from the browser.

Source: [backend/src/user-service/user-service.ts](../backend/src/user-service/user-service.ts)

### News Aggregator (port 5013)
Polls configured news sources, extracts ticker mentions, scores sentiment (positive/negative/neutral), and publishes to three bus topics:
- `news.feed` — forwarded by gateway to GUI as `newsUpdate` WS events
- `news.signal` — scored signal for algo consumption
- `news.events.normalised` — typed `NewsEvent` objects consumed by the Feature Engine

Source: [backend/src/news/news-aggregator.ts](../backend/src/news/news-aggregator.ts)

### FIX Archive (port 5012)
Subscribes to `fix.execution` events and persists them to SQLite in FIX 4.4 format. Exposes `GET /executions` for historical execution report queries.

Source: [backend/src/fix-archive/fix-archive.ts](../backend/src/fix-archive/fix-archive.ts)

### Analytics Service (port 5014)
REST-only service for quantitative analysis:
- `POST /quote` — Black-Scholes option pricing
- `POST /scenario` — Monte Carlo scenario grid (vol/price shocks)
- `POST /recommend` — Rule-based trade recommendations

Source: [backend/src/analytics/analytics-service.ts](../backend/src/analytics/analytics-service.ts)

### Market Data Service (port 5015)
Manages per-symbol data source overrides (synthetic GBM vs Alpha Vantage). Polls Alpha Vantage GLOBAL_QUOTE round-robin every 5 minutes and seeds intraday time series to the journal on startup.

Source: [backend/src/market-data-service/market-data-service.ts](../backend/src/market-data-service/market-data-service.ts)

### Market Data Adapters (port 5019)
Seeds earnings calendar, dividend, and macro economic events for ~80 S&P 500 symbols. Publishes `market.external.events` consumed by the Feature Engine. Events are staggered over a 90-day window to provide realistic scheduling.

Source: [backend/src/market-data-adapters/adapter-server.ts](../backend/src/market-data-adapters/adapter-server.ts)

### Feature Engine (port 5020)
Subscribes to `market.ticks`, `news.events.normalised`, and `market.external.events`. Computes a 7-feature `FeatureVector` per symbol on every tick and publishes to `market.features` (batched at 250 ms). Stores last 500 vectors per symbol in SQLite. Exposes `GET /features/:symbol` and `GET /features/:symbol/history`.

Source: [backend/src/feature-engine/feature-engine.ts](../backend/src/feature-engine/feature-engine.ts)

### Signal Engine (port 5021)
Subscribes to `market.features`. Applies a configurable weighted score across all 7 features (weights stored in SQLite, configurable via `PUT /weights` admin API). Publishes `Signal` objects to `market.signals`. Also exposes `POST /replay` for backtest signal replay against historical candle data.

Source: [backend/src/signal-engine/signal-engine.ts](../backend/src/signal-engine/signal-engine.ts)

### Recommendation Engine (port 5022)
Subscribes to `market.signals`. Generates `TradeRecommendation` objects for signals with confidence > 0.6, including suggested quantity, direction, and rationale from the top two factor contributions. Publishes to `market.recommendations`.

Source: [backend/src/recommendation-engine/recommendation-server.ts](../backend/src/recommendation-engine/recommendation-server.ts)

### Scenario Engine (port 5023)
REST-only. Accepts `POST /scenario` with a symbol and a list of factor shocks (`{ factor, delta }`). Fetches the current FeatureVector from the Feature Engine, applies shocks, re-runs the signal scorer, and returns `{ baseline, shocked, delta }`.

Source: [backend/src/scenario-engine/scenario-server.ts](../backend/src/scenario-engine/scenario-server.ts)

---

## LLM Advisory Subsystem

The LLM Advisory Subsystem is a **strictly advisory layer** — it reads deterministic signal and recommendation data and produces natural-language commentary. It has **no write path** to the order bus and cannot submit, modify, or cancel orders. The deterministic engines remain the source of truth.

### Design Principles

- The LLM worker runs **locally within the container** (no external inference APIs are called unless the operator explicitly configures an external provider key).
- The subsystem is **fully isolated** from execution: the worker only reads from the intelligence pipeline and writes to its own SQLite advisory store.
- Safe defaults: `LLM_ENABLED=false`, `LLM_WORKER_ENABLED=false`, `LLM_TRIGGER_MODE=manual`.
- The worker must **never autostart** or restart indefinitely — it is launched on-demand and exits after completing its job queue or hitting an idle timeout.

### Service: LLM Orchestrator (port 5024)

Manages job scheduling, runtime configuration, and subsystem state. Subscribes to several bus topics to decide when to enqueue advisory jobs.

**Bus subscriptions:**
- `market.signals` — queues a job when a new high-confidence signal arrives (if trigger mode permits)
- `llm.worker.status` — tracks worker lifecycle events to update last-error and last-activity timestamps

**Bus publications:**
- `llm.state.update` — broadcasts the current `LlmSubsystemStatus` payload (consumed by the gateway and forwarded to all WebSocket clients as `llmStateUpdate` events)
- `llm.job.queued` — emitted when a new job is enqueued
- `llm.advisory.ready` — emitted when an advisory note is written to the store

**Admin REST endpoints (all require admin role via gateway):**

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/state` | Returns the full `LlmSubsystemStatus` (state, effective policy, pending jobs, etc.) |
| `PUT` | `/admin/state` | Patches the runtime config (enable/disable advisory, enable/disable worker, change trigger mode) |
| `POST` | `/admin/watchlist-brief` | Enqueues a one-shot advisory job for every tracked symbol |
| `POST` | `/admin/trigger-worker` | Starts the LLM worker process (requires `workerEnabled = true`) |

Source: [backend/src/llm-advisory/orchestrator.ts](../backend/src/llm-advisory/orchestrator.ts)

### Subsystem State Machine

The subsystem state is derived deterministically from the effective policy, pending job count, and timestamps — it is never stored directly.

```
disabled  ←  enabled = false (env or runtime config)
   │
armed     ←  enabled + no pending jobs + cooldown window elapsed
   │
active    ←  enabled + pendingJobs > 0
   │
cooldown  ←  enabled + no pending jobs + last activity < minRefreshMinutes ago
   │
error     ←  enabled + last error < 30 s ago
```

The `deriveSubsystemState()` function in `runtime-config-store.ts` implements this state machine.

### Runtime Config (SQLite)

Operator controls persist to `llm_runtime_config` (SQLite, single row `id=1`). Environment variables define the **base policy**; the SQLite row provides **runtime overrides** that survive service restarts.

| Setting | Env Var | Default | Description |
|---|---|---|---|
| Advisory enabled | `LLM_ENABLED` | `false` | Master switch; `disabled` state when false |
| Worker enabled | `LLM_WORKER_ENABLED` | `false` | Whether the worker process may be started |
| Trigger mode | `LLM_TRIGGER_MODE` | `manual` | `manual` \| `on-demand-ui` \| `scheduled-batch` \| `event-driven` |
| Min refresh | `LLM_MIN_REFRESH_MINUTES` | `15` | Minimum minutes between jobs per symbol (cooldown window) |
| Worker idle timeout | `LLM_WORKER_IDLE_TIMEOUT_SECONDS` | `60` | Worker exits if no new jobs arrive within this window |
| Max jobs per session | `LLM_WORKER_MAX_JOBS_PER_SESSION` | `20` | Worker exits after processing this many jobs |
| Max concurrent jobs | `LLM_MAX_CONCURRENT_JOBS` | `2` | Maximum jobs running simultaneously |
| Allowed hours | `LLM_ALLOWED_HOURS` | *(unrestricted)* | UTC hour range, e.g. `"08-18"` |

`resolveEffectivePolicy()` merges these two sources; the runtime config values take precedence over the env-var base policy.

### Worker Lifecycle

```
operator: PUT /admin/state { workerEnabled: true }
operator: POST /admin/trigger-worker
                │
         orchestrator forks worker subprocess
                │
         worker checks isWorkerAllowed() — exits immediately if false
                │
         worker registers session in llm_worker_sessions
                │
         loop:
           if jobsProcessed >= maxJobsPerSession → exit "max-jobs-per-session"
           claimNextJob()
             found → processJob() → write advisory note → publish llm.advisory.ready
             not found → idle-wait loop (poll every 2 s)
               if idle > workerIdleTimeoutSeconds → exit "idle-timeout"
                │
         worker updates session with exitReason, publishes llm.worker.status "stopped"
```

The worker never restarts itself. Supervisord is configured with `autostart=false` and `autorestart=false` for the `llm-worker` program.

### Provider Abstraction

The `LlmProvider` interface abstracts the inference backend. Two implementations are shipped:

| Provider | Description |
|---|---|
| `MockProvider` | Returns canned responses instantly — used in tests and when no model is configured |
| `OllamaProvider` | Calls a local Ollama server (`OLLAMA_BASE_URL`, default `http://localhost:11434`) |

The active provider is selected at startup via `LLM_PROVIDER` env var (`mock` \| `ollama`).

### Job Store (SQLite)

`JobStore` persists to `llm_advisory.db` and maintains four tables:

| Table | Description |
|---|---|
| `llm_jobs` | Job queue with status, priority, context hash, and retry count |
| `advisory_notes` | Completed advisory notes with token counts and signal snapshot |
| `llm_prompt_audit` | Full prompt text for every job (compliance/audit trail) |
| `llm_response_audit` | Raw LLM response for every job |
| `llm_worker_sessions` | Session records with `exitReason` |

Deduplication: `hasRecentJob(contextHash, windowMs)` prevents re-running identical context within the cooldown window.

Source: [backend/src/llm-advisory/](../backend/src/llm-advisory/)

---

## Frontend Architecture

The React frontend (Vite + Redux Toolkit) uses a single `gatewayMiddleware` for all backend communication. On start it opens a WebSocket to the gateway and keeps it alive with exponential-backoff reconnection.

Key middleware:
- **gatewayMiddleware** — WS connection, dispatches all inbound events, sends orders
- **observabilityMiddleware** — intercepts Redux actions (login, logout, order attempt) and POSTs them to the observability service
- **simulationMiddleware** — local fill simulation for disconnected / demo mode only (gated on `market.connected`)
- **versionWatchMiddleware** — detects backend version changes and notifies the user

### Redux Slices

| Slice | State |
|---|---|
| `authSlice` | `{ user, limits }` — set via `authIdentity` WS event |
| `ordersSlice` | Order tree with children; updated by all `orderEvent` WS messages |
| `marketSlice` | Latest price per symbol; updated by `marketUpdate` WS events |
| `observabilitySlice` | `{ events: ObsEvent[] }` — updated by SSE stream |
| `newsSlice` | Latest news per symbol; updated by `newsUpdate` WS events |
| `intelligenceSlice` | `{ signals, features, recommendations }` keyed by symbol |
| `llmSubsystemSlice` | `{ status: LlmSubsystemStatus \| null }` — updated by `llmStateUpdate` WS events |

### Dashboard Panels

The FlexLayout-based dashboard supports 20+ panel types registered in `panelRegistry.ts`. Layout templates are defined in `layoutModels.ts` (current storage key: `v8`).

| Panel ID | Description | Singleton |
|---|---|---|
| `market-ladder` | Live bid/ask/price table for all symbols | ✓ |
| `order-ticket` | Order entry form (per-symbol channel) | — |
| `order-blotter` | Order & fill history grid | ✓ |
| `candle-chart` | OHLCV candlestick chart | — |
| `executions` | FIX execution report viewer | ✓ |
| `algo-monitor` | Algo heartbeat and strategy status | ✓ |
| `observability` | Bus event stream viewer | ✓ |
| `decision-log` | Rejected / expired order log | ✓ |
| `news-feed` | News feed with sentiment indicators | ✓ |
| `market-depth` | Level-2 order book depth chart | — |
| `market-data-sources` | Alpha Vantage source override (admin) | ✓ |
| `option-pricing` | Black-Scholes option pricer | ✓ |
| `scenario-matrix` | Monte Carlo vol/price scenario grid | ✓ |
| `trade-recommendation` | Rule-based trade suggestions | ✓ |
| `research-radar` | Signal score × confidence bubble chart | ✓ |
| `instrument-analysis` | Per-symbol feature bars + signal gauge + backtest | — |
| `signal-explainability` | Factor contribution waterfall chart | ✓ |
| `service-health` | Service health grid with version polling | ✓ |
| `throughput-gauges` | Orders/min, fills/min, fill rate, bus events (last 60 s) | ✓ |
| `algo-leaderboard` | Fill rate and slippage by strategy | ✓ |
| `load-test` | Admin-only bulk order injection form | ✓ |
| `llm-subsystem` | LLM Advisory Subsystem operator controls (admin) | ✓ |

### Layout Templates

| Template | Description |
|---|---|
| Default | 4-column trading workstation |
| Analysis | Market ladder + candle chart + analytics panels |
| Research | Signal radar + instrument analysis + explainability |
| Market Overview | 3-column price-focused layout |
| Admin / Mission Control | Service health + throughput + algo leaderboard + load test + LLM subsystem |

## Authentication

Session tokens are stored as `veta_user` HTTP-only cookies set by the User Service on login. The Gateway validates the token on every WS connection and every HTTP proxy request. Token lookups are cached for 10 seconds. Admin users can view all panels but are blocked from submitting orders at both the OMS level (bus) and the UI level (OrderTicket hidden for admin role).

## Testing

| Suite | Command | Coverage |
|---|---|---|
| Backend smoke | `deno test --allow-all backend/src/tests/smoke.test.ts` | Health checks, WS pipeline, BUY/SELL order ack, journal, news |
| Backend integration | `deno test --allow-all backend/src/tests/integration.test.ts` | End-to-end order fill, algo slice counts, fill rates |
| Algo integration | `deno test --allow-all backend/src/tests/algo.integration.test.ts` | LIMIT/TWAP/ICEBERG/SNIPER fill + performance assertions |
| Load test | `deno test --allow-all backend/src/tests/load.test.ts` | Bulk injection, pipeline throughput, fill rate under load |
| Frontend unit | `cd frontend && npm run test:unit` | Slices, components, panel registry, layout models (507 tests) |
| Frontend E2E | `cd frontend && npx playwright test` | Auth, market data, order placement (34 tests, mocked gateway) |

**Algo coverage gap**: POV, VWAP, and Arrival Price algos have health-check coverage only — no order-placement integration tests yet.

## Process Management

All services are managed by **supervisord**. In the Dev Container they start automatically on launch.

```bash
supervisorctl -c /home/deno/supervisord.conf status        # check all
supervisorctl -c /home/deno/supervisord.conf restart <svc> # restart one
```

Service names: `market-sim`, `ems`, `oms`, `algo-trader`, `twap-algo`, `pov-algo`, `vwap-algo`, `iceberg-algo`, `sniper-algo`, `arrival-price-algo`, `observability`, `user-service`, `journal`, `candle-store`, `news-aggregator`, `fix-archive`, `analytics-service`, `market-data-service`, `market-data-adapters`, `feature-engine`, `signal-engine`, `recommendation-engine`, `scenario-engine`, `llm-advisory`, `gateway`

The `llm-worker` program is registered separately in supervisord with `autostart=false` and `autorestart=false` — it is launched on-demand by the orchestrator via `POST /admin/trigger-worker`.
