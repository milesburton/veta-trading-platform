# VETA Trading Platform — Operator & Developer Manual

> **Version**: current `main` branch
> **Last updated**: 2026-03-26

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Quick Start](#2-quick-start)
3. [Service Reference](#3-service-reference)
4. [Message Bus Topics](#4-message-bus-topics)
5. [Order Flow](#5-order-flow)
6. [Algorithm Strategies](#6-algorithm-strategies)
7. [Intelligence Pipeline](#7-intelligence-pipeline)
8. [Authentication & RBAC](#8-authentication--rbac)
9. [API Reference — Gateway](#9-api-reference--gateway)
10. [Analytics Endpoints](#10-analytics-endpoints)
11. [Fixed Income Endpoints](#11-fixed-income-endpoints)
12. [Frontend — Dashboard & Panels](#12-frontend--dashboard--panels)
13. [Workspace Layout Templates](#13-workspace-layout-templates)
14. [Desktop App (Electron)](#14-desktop-app-electron)
15. [LLM Advisory Subsystem](#15-llm-advisory-subsystem)
16. [Data Stores](#16-data-stores)
17. [Process Management](#17-process-management)
18. [Deployment](#18-deployment)
19. [CI / CD](#19-ci--cd)
20. [Testing Reference](#20-testing-reference)
21. [Configuration Reference](#21-configuration-reference)
22. [Troubleshooting](#22-troubleshooting)

---

## 1. System Overview

VETA (**Virtual Equities Trading Application**) is a full-stack simulated trading platform built to demonstrate realistic financial market microstructure. It models:

- A live equities market with ~80 S&P 500 instruments generating prices via Geometric Brownian Motion
- A complete order lifecycle: GUI → Gateway → OMS → Algo → EMS → FIX execution
- Nine algorithmic execution strategies (LIMIT, TWAP, POV, VWAP, ICEBERG, SNIPER, ARRIVAL_PRICE, IS, MOMENTUM)
- Fixed income (bonds): RFQ workflow, DCF pricing, spread analysis, duration laddering, vol surface
- An intelligence pipeline: feature extraction → signal scoring → trade recommendations
- An LLM advisory layer (Ollama, advisory-only, no order submission)
- Role-based access control with four built-in personas
- A React frontend with 54 configurable dashboard panels across 22 workspace templates
- An Electron desktop app for Windows, macOS, and Linux

All inter-service communication uses a **Redpanda** (Kafka-compatible) message bus. The browser never speaks directly to any service other than the **API Gateway** (port 5011).

```
Browser / Electron App
        │  WebSocket + HTTP
        ▼
  API Gateway :5011  ──────────────────────── Redpanda :9092
        │                                          │
        │  auth cookie validation                  │  all topics
        ▼                                          ▼
  User Service :5008            OMS · EMS · Algos · Journal · ...
```

---

## 2. Quick Start

### Dev Container (recommended)

The Dev Container starts all services automatically via **supervisord** on launch.

```bash
# Open in VS Code Dev Container, then:

# Check all services are running
supervisorctl -c /home/deno/supervisord.conf status

# Start the frontend dev server
cd frontend && npm run dev          # http://localhost:5173

# Or start the Electron app
cd frontend && npm run electron:dev
```

**Default login**: any of the four built-in users (see [§8](#8-authentication--rbac)).

### Without a Dev Container

```bash
# Prerequisites: Deno ≥ 2.x, Node ≥ 20, Docker (for Redpanda)

# Start Redpanda
docker run -d --name redpanda -p 9092:9092 \
  redpandadata/redpanda:latest redpanda start --overprovisioned --smp 1

# Start all backend services
deno task start     # (or supervisord if configured)

# Start the frontend
cd frontend && npm install && npm run dev
```

---

## 3. Service Reference

All services are written in Deno and expose an HTTP health endpoint at `GET /health`.

| Port | Service | Process Name | Description |
|------|---------|--------------|-------------|
| 5000 | Market Simulator | `market-sim` | Generates live prices for ~80 S&P 500 instruments via GBM (4 ticks/s). Consults `market-data-service` every 30 s for per-symbol source overrides. |
| 5001 | EMS | `ems` | Execution Management System. Fills child orders against the simulated market, picks venue/counterparty/liquidity flag, computes fees, publishes `orders.filled` + `fix.execution`. |
| 5002 | OMS | `oms` | Order Management System. Validates orders (user limits, strategy access, notional caps), routes to the correct algo or direct EMS, handles kill-switch and TTL sweeps. |
| 5003 | Limit Algo | `algo-trader` | Fires a child order when market price crosses the limit price. |
| 5004 | TWAP Algo | `twap-algo` | Splits the parent order into equal slices spread evenly over `durationSecs`. |
| 5005 | POV Algo | `pov-algo` | Participates at a configurable percentage of simulated market volume per tick. |
| 5006 | VWAP Algo | `vwap-algo` | Weights slices by the rolling volume profile to track VWAP. |
| 5007 | Observability | `observability` | Subscribes to all bus topics (except high-frequency ticks). Persists to SQLite with 24-h retention. Streams events via SSE. |
| 5008 | User Service | `user-service` | Manages users, sessions (PostgreSQL-backed), and per-user trading limits. Internal only — never reached directly from the browser. |
| 5009 | Journal | `journal` | Dual-purpose SQLite service: order audit trail (90-day retention) + OHLCV candle aggregation at 1-min and 5-min intervals (120 candles/symbol cap). |
| 5011 | Gateway | `gateway` | API Gateway / BFF. The only service the browser talks to. WebSocket hub, auth middleware, proxy to all downstream services. |
| 5012 | FIX Archive | `fix-archive` | Subscribes to `fix.execution`, persists execution reports to SQLite in FIX 4.4 format. |
| 5013 | News Aggregator | `news-aggregator` | Polls news sources, extracts ticker mentions, scores sentiment. Publishes `news.feed`, `news.signal`, `news.events.normalised`. |
| 5014 | Analytics Service | `analytics-service` | REST-only quant library: Black-Scholes, Monte Carlo, bond DCF, Nelson-Siegel, GBM price fan, SABR-inspired vol surface, Greeks surface. |
| 5015 | Market Data Service | `market-data-service` | Per-symbol data source overrides (synthetic GBM vs Alpha Vantage). Polls Alpha Vantage GLOBAL_QUOTE every 5 minutes. |
| 5016 | Market Data Adapters | `market-data-adapters` | Seeds corporate events (earnings, dividends, macro) for ~80 symbols over a 90-day window. Publishes `market.external.events`. |
| 5017 | Feature Engine | `feature-engine` | Computes 7-feature `FeatureVector` per symbol on every tick. SQLite-backed (last 500 vectors/symbol). |
| 5018 | Signal Engine | `signal-engine` | Applies configurable weighted scoring across features → `Signal`. Supports `POST /replay` for backtesting. |
| 5019 | Recommendation Engine | `recommendation-engine` | Generates `TradeRecommendation` for signals with confidence > 0.6. |
| 5020 | Scenario Engine | `scenario-engine` | REST-only factor-shock scenario analysis. Fetches FeatureVector from Feature Engine, re-scores, returns `{ baseline, shocked, delta }`. |
| 5021 | Iceberg Algo | `iceberg-algo` | Shows only `visibleQty` at a time; refills until fully executed. |
| 5022 | Sniper Algo | `sniper-algo` | Aggressive single-or-few-slice execution targeting best available price. |
| 5023 | Arrival Price Algo | `arrival-price-algo` | Targets the price at order arrival; minimises slippage vs decision price. |
| 5024 | LLM Advisory | `llm-advisory` | Advisory-only LLM orchestrator. Schedules jobs, manages worker lifecycle. Admin REST endpoints only. |
| 5025 | Momentum Algo | `momentum-algo` | EMA crossover signal triggers tranches; cooldown prevents overtrading. |
| 5026 | IS Algo | `is-algo` | Implementation Shortfall: geometric decay schedule front-loads volume to minimise opportunity cost. |
| 9880 | FIX Exchange | `fix-exchange` | TCP FIX 4.4 exchange endpoint. |
| 9881 | FIX Gateway | `fix-gateway` | WebSocket bridge over the FIX exchange. |

> **Port 5010** (candle-store) was removed — candle aggregation is now inside the Journal service.

---

## 4. Message Bus Topics

All inter-service communication uses Redpanda (Kafka-compatible) at port 9092.

| Topic | Producer(s) | Consumer(s) | Description |
|-------|------------|-------------|-------------|
| `market.ticks` | market-sim | gateway, feature-engine, journal, oms | Live price ticks for all symbols |
| `orders.new` | gateway | oms | Raw order submissions from the GUI |
| `orders.submitted` | oms | journal, observability, gateway | Validated + enriched order |
| `orders.routed` | oms | all algo services, ems (direct lit) | Order ready for execution |
| `orders.child` | all algos | ems | Execution slice from an algo |
| `orders.filled` | ems | gateway, journal, observability | Fill confirmation |
| `orders.expired` | oms | gateway, journal, observability | TTL elapsed before full fill |
| `orders.rejected` | oms | gateway, journal, observability | Validation failure |
| `orders.cancelled` | oms (kill-switch) | gateway, journal, observability | Kill-switch cancellation |
| `algo.heartbeat` | all algos | gateway (in-memory ring buffer, 200 slots) | Periodic algo liveness ping |
| `fix.execution` | ems | fix-archive, gateway | FIX 4.4 execution report |
| `user.session` | user-service | observability | Login / logout events |
| `user.access` | gateway | observability (ring buffer, not DB) | Per-request access events |
| `news.feed` | news-aggregator | gateway | Parsed news items for GUI |
| `news.signal` | news-aggregator | (reserved) | Structured signal from news |
| `news.events.normalised` | news-aggregator | feature-engine | Typed news events with ticker + sentiment |
| `market.external.events` | market-data-adapters | feature-engine | Corporate events (earnings, dividends) |
| `market.features` | feature-engine | signal-engine, gateway | FeatureVector per symbol |
| `market.signals` | signal-engine | recommendation-engine, gateway | Scored signal per symbol |
| `market.recommendations` | recommendation-engine | gateway | TradeRecommendation objects |

> `algo.heartbeat` and `user.access` events are **not persisted to SQLite** — they go into in-memory ring buffers (200 slots) to avoid write pressure.

---

## 5. Order Flow

### Equity (Lit Market)

```
1. User submits order in OrderTicket (React)
2. submitOrderThunk → Gateway WebSocket (submitOrder message)
3. Gateway publishes to orders.new (injects userId + userRole)
4. OMS validates:
   a. Role check — admin/compliance cannot trade
   b. Instrument type → derive desk (equity/FI/derivatives)
   c. Desk access check (dark pool requires dark_pool_access=true + qty ≥ 10,000)
   d. Strategy validation against user's allowed_strategies
   e. Quantity ≤ max_order_qty
   f. notional (qty × limitPrice) ≤ max_daily_notional
5. OMS publishes orders.submitted + orders.routed
6. Matching algo service picks up orders.routed (filtered by strategy tag)
7. Algo publishes orders.child when it's time to execute a slice
8. EMS fills the slice:
   - Picks venue (XNAS, XNYS, ARCX, …)
   - Picks counterparty MPID
   - Sets liquidity flag (MAKER / TAKER / CROSS)
   - Computes fill price + market impact
   - Applies SEC §31 fee, FINRA TAF, and commission
9. EMS publishes orders.filled + fix.execution
10. Gateway forwards orderEvent to all connected GUI clients
11. Redux: ordersSlice and blotter update in real time
```

### Equity (Dark Pool)

Same as above but:
- Order must have `qty ≥ 10,000` and user must have `dark_pool_access: true`
- OMS sets `destinationVenue = DARK1` on the routed order
- EMS routes to dark-pool matching engine

### Fixed Income (RFQ)

```
1. User fills OrderTicket with instrumentType=bond + bondSpec (ISIN, coupon, periods, yield)
2. OMS derives desk=FI, validates bondSpec fields
3. OMS publishes to orders.fi.rfq (instead of orders.routed)
4. RFQ service handles negotiation lifecycle
5. User executes via POST /rfq/{rfqId}/execute through the Gateway
```

### Derivatives / Options

```
1. OrderTicket with instrumentType=option + optionSpec (type, strike, expirySecs)
2. OMS derives desk=derivatives
3. Listed options → destinationVenue=XNAS → EMS
4. OTC options → destinationVenue=OTC-OPTIONS → OTC handler
```

### Kill Switch

```
POST /ws (kill message) → Gateway → OMS kill handler
  Scope: "all" | "user" | "algo" | "market" | "symbol"
  Traders: can kill own orders only
  Admins: can kill any user's orders
  → OMS publishes orders.cancelled for each matched order
```

---

## 6. Algorithm Strategies

All algos subscribe to `orders.routed`, filter by their `strategy` tag, and publish `orders.child`.

| Strategy | Port | Key Parameters | Behaviour |
|----------|------|----------------|-----------|
| **LIMIT** | 5003 | `limitPrice` | Polls every tick; fires a full-size child order when `market_price ≤ limitPrice` (buy) or `≥` (sell) |
| **TWAP** | 5004 | `durationSecs`, `numSlices` | Divides quantity into equal slices; sends one slice every `durationSecs / numSlices` seconds |
| **POV** | 5005 | `povPercent` | On every tick, sends `floor(tickVolume × povPercent)` shares |
| **VWAP** | 5006 | `durationSecs` | Builds a 10-bucket volume profile; weights each slice by its bucket's volume fraction |
| **ICEBERG** | 5021 | `visibleQty`, `priceLimit` | Sends `visibleQty` slices; each fill triggers the next until `totalQty` is exhausted |
| **SNIPER** | 5022 | `aggressionPct`, `maxSlices` | Fires up to `maxSlices` slices quickly at `price × aggressionPct`; designed for low-latency crossing |
| **ARRIVAL_PRICE** | 5023 | `durationSecs`, `urgency` | Targets the arrival price; adjusts rate based on `urgency` (0–1) to minimise slippage |
| **IS** | 5026 | `durationSecs`, `riskAversion` | Geometric decay: larger slices early; `riskAversion` controls decay speed |
| **MOMENTUM** | 5025 | `emaPeriods`, `tranchePct`, `cooldownSecs` | EMA crossover triggers tranches; `cooldownSecs` prevents back-to-back execution |

All strategies emit `algo.heartbeat` (in-memory only, not persisted) and log to the `decision-log` panel via the Journal's audit trail.

---

## 7. Intelligence Pipeline

The pipeline enriches market data into actionable trade recommendations. It is **advisory-only** — it can suggest but cannot submit orders.

```
market.ticks ───────────────────────────────────────┐
news.events.normalised ─────────────────────────────┤→ Feature Engine :5017
market.external.events ─────────────────────────────┘   7 features per symbol per tick
                                                               │ market.features
                                                               ▼
                                                      Signal Engine :5018
                                                      Weighted scoring → Signal
                                                      Admin-configurable weights
                                                               │ market.signals
                                                               ▼
                                                   Recommendation Engine :5019
                                                   confidence > 0.6 → TradeRecommendation
                                                               │ market.recommendations
                                                               ▼
                                                        Gateway → GUI panels
```

### Feature Vectors (7 features per symbol, ~4/s)

| Feature | Description |
|---------|-------------|
| `momentum` | Price change over last 20 ticks, normalised |
| `relativeVolume` | Current tick volume vs rolling 20-tick average |
| `realisedVol` | Annualised volatility from last 120 one-minute candles |
| `sectorRelativeStrength` | Symbol return vs sector average over 20 ticks |
| `eventScore` | Weighted sum of upcoming corporate events in next 7 days |
| `newsVelocity` | News event count for the symbol in the last 60 seconds |
| `sentimentDelta` | Sentiment score now minus sentiment score 60 seconds ago |

### Signal Weights (admin-configurable)

```
PUT /intelligence/weights   (admin only)
```

| Factor | Default Weight |
|--------|---------------|
| `momentum` | 0.25 |
| `sectorRelativeStrength` | 0.20 |
| `realisedVol` | −0.15 (penalises high vol) |
| `relativeVolume` | 0.10 |
| `eventScore` | 0.10 |
| `newsVelocity` | 0.10 |
| `sentimentDelta` | 0.10 |

### Scenario Analysis

```
POST /intelligence/scenario
  { symbol, shocks: { momentum: 0.5, realisedVol: -0.3, … } }
Returns: { baseline: Signal, shocked: Signal, delta: FeatureVector }
```

### Signal Backtest

```
POST /intelligence/replay
  { symbol, fromTs, toTs }
Returns: ReplayFrame[] — reconstructed signals from historical candle data
```

---

## 8. Authentication & RBAC

Sessions are stored as `veta_user` HTTP-only cookies set by the User Service at login. The Gateway validates this cookie on **every HTTP request and WebSocket connection** (results cached for 10 seconds). The OMS independently fetches limits from the User Service (cached for 30 seconds).

### Built-in Personas

| Username | Password | Role | Trading Limits |
|----------|----------|------|----------------|
| `alice` | `password123` | `trader` (high-touch) | All strategies; max qty 10,000; max daily notional $1M |
| `bob` | `password123` | `trader` (algo) | TWAP, POV, VWAP, ICEBERG, SNIPER, ARRIVAL_PRICE, IS, MOMENTUM |
| `carol` | `password123` | `trader` (fixed income) | LIMIT only; FI desk access |
| `david` | `password123` | `analyst` (read-only) | No strategies — cannot submit orders |

Admin accounts can view all panels but are blocked from submitting orders at both the OMS (bus-level) and UI (OrderTicket hidden) layers.

### Trading Limit Defaults (when no DB record exists)

```
max_order_qty:       10,000 shares
max_daily_notional:  $1,000,000
allowed_strategies:  LIMIT, TWAP, POV, VWAP
allowed_desks:       equity
dark_pool_access:    false
```

### Auth Flow

```
1. POST /sessions (User Service) → sets veta_user cookie
2. Browser connects to GET /ws (Gateway) → cookie validated → authIdentity WS event sent
3. authSlice stores { user, limits } in Redux
4. Every HTTP proxy request → cookie re-validated (10s cache)
5. OrderTicket reads limits from authSlice → amber warnings if limit exceeded
6. OMS re-validates limits from User Service (30s cache) before routing
```

### Customising Limits

```
PUT /users/{userId}/limits     (admin only, via Gateway proxy)
{
  "maxOrderQty": 50000,
  "maxDailyNotional": 5000000,
  "allowedStrategies": ["LIMIT","TWAP","VWAP"],
  "allowedDesks": ["equity","fi"],
  "darkPoolAccess": true
}
```

---

## 9. API Reference — Gateway

The Gateway (port 5011) is the sole entry point for all browser traffic. All routes require a valid `veta_user` session cookie except `/health` and `/ready`.

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service liveness |
| `GET` | `/ready` | Readiness probe — checks 10 downstream services |
| `GET` | `/system` | Memory and disk usage |
| `GET` | `/me` | Authenticated user profile + limits |

### Market Data

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/assets` | List of tradeable assets |
| `GET` | `/candles` | OHLCV candles (params: `symbol`, `interval`, `limit`) |
| `GET` | `/market-data/sources` | Data source list |
| `GET` | `/market-data/overrides` | Per-symbol source overrides |
| `PUT` | `/market-data/overrides` | Update symbol override |
| `POST` | `/market-data/sources/{symbol}/toggle` | Toggle synthetic/Alpha Vantage |

### Orders & Journal

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/orders` | Order history from Journal |
| `POST` | `/grid/query` | Complex filtered/sorted/paginated grid query |

### Preferences & Workspaces

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/preferences` | User layout preferences (stored in User Service) |
| `PUT` | `/preferences` | Update preferences |
| `GET` | `/shared-workspaces` | List shared layout presets |
| `POST` | `/shared-workspaces` | Save a layout as shared |
| `GET` | `/shared-workspaces/{id}` | Retrieve a shared layout |
| `DELETE` | `/shared-workspaces/{id}` | Delete a shared layout |

### Alerts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/alerts` | User alert list |
| `POST` | `/alerts` | Create alert |
| `PUT` | `/alerts/dismiss-all` | Dismiss all alerts |
| `PUT` | `/alerts/{alertId}/dismiss` | Dismiss specific alert |

### Intelligence

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/intelligence/features` | All symbol FeatureVectors |
| `GET` | `/intelligence/features/{symbol}` | Single-symbol FeatureVector |
| `GET` | `/intelligence/signals` | All signals |
| `GET` | `/intelligence/signals/{symbol}` | Single-symbol signal |
| `GET` | `/intelligence/weights` | Current signal weights |
| `PUT` | `/intelligence/weights` | Update weights (admin) |
| `GET` | `/intelligence/recommendations` | All recommendations |
| `POST` | `/intelligence/scenario` | Factor-shock scenario |
| `POST` | `/intelligence/replay` | Signal backtest |

### Fixed Income

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/rfq/stats` | RFQ statistics |
| `GET` | `/rfq` | User's RFQ list |
| `GET` | `/rfq/{rfqId}` | Single RFQ |
| `POST` | `/rfq/{rfqId}/execute` | Execute RFQ |
| `GET` | `/ccp/stats` | CCP statistics |
| `GET` | `/ccp/settlements` | Settlement records |
| `GET` | `/ccp/settlements/{date}` | Settlements for date |
| `GET` | `/ccp/margin/{userId}` | User margin |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/load-test` | Bulk order injection (admin only) |
| `POST` | `/demo-day` | Trigger demo trading session |

### LLM Advisory

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/advisory/{noteId}` | Get advisory note |
| `POST` | `/advisory/request` | Request advisory analysis |
| `GET` | `/advisory/jobs` | List advisory jobs |
| `GET` | `/advisory/admin/state` | Subsystem state (admin) |
| `PUT` | `/advisory/admin/state` | Update state (admin) |
| `POST` | `/advisory/admin/watchlist-brief` | Queue watchlist summary (admin) |
| `POST` | `/advisory/admin/trigger-worker` | Start LLM worker (admin) |

### WebSocket

| Path | Description |
|------|-------------|
| `/ws` or `/ws/gateway` | Main WebSocket gateway — authenticates on connect, fans out all bus events |

#### WS Message Types (server → client)

| Type | Payload |
|------|---------|
| `authIdentity` | `{ user, limits }` — sent immediately after auth |
| `marketUpdate` | Price tick batch per symbol |
| `orderEvent` | Order lifecycle event (submitted/filled/rejected/expired/cancelled) |
| `newsUpdate` | News item with sentiment score |
| `signalUpdate` | Market signal for a symbol |
| `featureUpdate` | Feature vector for a symbol |
| `recommendationUpdate` | Trade recommendation |
| `algoHeartbeat` | Algo strategy heartbeat |
| `llmStateUpdate` | LLM advisory subsystem state change |
| `killSwitchEvent` | Kill switch engage/disengage |

#### WS Message Types (client → server)

| Type | Payload |
|------|---------|
| `submitOrder` | Order fields — routed to `orders.new` bus topic |
| `killSwitch` | `{ scope, userId?, symbol?, algoType? }` |

---

## 10. Analytics Endpoints

All analytics routes are proxied by the Gateway and require authentication. Actual computation is in **analytics-service** (port 5014).

### Option Pricing (Black-Scholes)

```
POST /analytics/quote
{
  "symbol": "AAPL",
  "optionType": "call" | "put",
  "strike": 185.0,
  "expirySecs": 2592000,
  "riskFreeRate": 0.05          // optional, default 0.05
}
→ { price, delta, gamma, theta, vega, impliedVol, spotPrice }
```

### Monte Carlo Scenario Grid

```
POST /analytics/scenario
{
  "symbol": "AAPL",
  "optionType": "call",
  "strike": 185.0,
  "expirySecs": 2592000,
  "spotShocks": [-0.2, -0.1, 0, 0.1, 0.2],
  "volShocks": [-0.3, 0, 0.3],
  "paths": 1000                 // optional, default 1000
}
→ { matrix: ScenarioCell[][], spotLabels, volLabels }
```

### Trade Recommendations

```
POST /analytics/recommend
{
  "symbol": "AAPL",
  "strikes": [175, 180, 185],   // optional
  "expiries": [30, 60, 90],     // optional (days)
  "signal": 0.75                // optional override
}
→ { recommendations: TradeRecommendation[] }
```

### Volatility Profile (EWMA)

```
GET /analytics/vol-profile/{symbol}
→ { series: [{ ts, vol }], lambda: 0.94 }   // 60-point series
```

### Greeks Surface

```
GET /analytics/greeks-surface/{symbol}?expirySecs=2592000&riskFreeRate=0.05
→ { strikes: number[], greeks: { strike, delta, gamma, theta, vega }[] }
// 25 strike points from 70% to 130% of spot
```

### Price Fan (GBM Projection)

```
GET /analytics/price-fan/{symbol}?steps=24&stepSecs=3600&paths=500
→ { steps: [{ ts, p5, p25, p50, p75, p95 }] }
```

---

## 11. Fixed Income Endpoints

### Bond Pricing (DCF)

```
POST /analytics/bond-price
{
  "couponRate": 0.05,
  "totalPeriods": 20,
  "yieldAnnual": 0.048
}
→ { price, duration, convexity, dv01 }
```

### Yield Curve (Nelson-Siegel)

```
POST /analytics/yield-curve
{
  "params": { "beta0": 0.05, "beta1": -0.02, "beta2": 0.01, "tau": 2.0 }  // optional
}
→ { curve: [{ tenor, spotRate, forwardRate }] }
```

### Spread Analysis

```
POST /analytics/spread-analysis
{
  "couponRate": 0.045,
  "totalPeriods": 10,
  "yieldAnnual": 0.052
}
→ { gSpread, zSpread, oas, benchmarkYield }
```

### Duration Ladder (Key-Rate DV01)

```
POST /analytics/duration-ladder
{
  "positions": [
    { "couponRate": 0.05, "totalPeriods": 10, "yieldAnnual": 0.048, "notional": 1000000 },
    ...
  ]
}
→ { buckets: [{ tenor, dv01 }] }
```

### Vol Surface

```
GET /analytics/vol-surface/{symbol}
→ { expiries: string[], strikes: number[], vols: number[][] }
// 5 expiries × 9 strikes, SABR-inspired smile
```

---

## 12. Frontend — Dashboard & Panels

The React frontend uses **FlexLayout** for a drag-and-drop, tabbed multi-panel layout. Panels are registered in [panelRegistry.ts](../frontend/src/components/dashboard/panelRegistry.ts).

### All Available Panels (54 total)

| Panel ID | Title | Singleton | Description |
|----------|-------|-----------|-------------|
| `market-ladder` | Market Ladder | ✓ | Live bid/ask/last table for all ~80 symbols |
| `order-ticket` | Order Ticket | — | Order entry: equity, option, bond; validates against limits |
| `order-blotter` | Order Blotter | ✓ | Order tree with parent + child rows; fill progress bars |
| `child-orders` | Child Orders | — | Execution slice detail view |
| `algo-monitor` | Algo Monitor | ✓ | Heartbeat status per algo strategy |
| `observability` | Observability | ✓ | Bus event stream with type filters |
| `candle-chart` | Price Chart | — | OHLCV candlestick chart (Lightweight Charts) |
| `market-depth` | Market Depth | — | Level-2 bid/ask depth chart |
| `executions` | Executions | ✓ | FIX execution report viewer |
| `decision-log` | Decision Log | ✓ | Rejected and expired order audit log |
| `market-match` | Market Match | — | Trade tape / time and sales |
| `admin` | Mission Control | ✓ | System configuration panel |
| `news` | News & Signals | ✓ | News feed with sentiment scores |
| `news-sources` | News Sources | ✓ | News feed source configuration (admin) |
| `order-progress` | Order Progress | — | Visual fill tracker for in-flight orders |
| `market-heatmap` | Market Heatmap | — | Sector-grouped performance heatmap |
| `alerts` | Alerts | ✓ | In-app alert feed (service down, order flood, fill rate) |
| `option-pricing` | Option Pricing | ✓ | Black-Scholes pricer with live Greeks |
| `scenario-matrix` | Scenario Matrix | ✓ | Monte Carlo vol/price shock grid |
| `trade-recommendation` | Trade Recommendations | ✓ | Signal-driven recommendation cards |
| `market-data-sources` | Market Data Sources | ✓ | Alpha Vantage source override (admin) |
| `market-feed-control` | Market Feed Control | ✓ | Market feed health and controls |
| `research-radar` | Signal Radar | ✓ | Signal score × confidence bubble chart |
| `instrument-analysis` | Instrument Analysis | — | Per-symbol feature bars, signal gauge, backtest |
| `signal-explainability` | Signal Explainability | ✓ | Factor contribution waterfall chart |
| `service-health` | Service Health | ✓ | Service status grid with version polling |
| `throughput-gauges` | Throughput | ✓ | Orders/min, fills/min, fill rate, bus events (last 60 s) |
| `algo-leaderboard` | Algo Leaderboard | ✓ | Fill rate and slippage comparison by strategy |
| `load-test` | Load Test | ✓ | Admin bulk order injection form |
| `llm-subsystem` | LLM Advisory | ✓ | LLM subsystem operator controls (admin) |
| `greeks-surface` | Greeks Surface | ✓ | Delta/gamma/theta/vega across strikes |
| `vol-profile` | Volatility Profile | ✓ | EWMA volatility trend chart |
| `estate-overview` | Estate Overview | ✓ | Service table + throughput + alert feed |
| `yield-curve` | Yield Curve | ✓ | Nelson-Siegel fitted curve with forward rates |
| `price-fan` | Price Fan | ✓ | GBM Monte Carlo forward projection bands |
| `demo-day` | Demo Day | ✓ | One-click demo scenario launcher |
| `spread-analysis` | Spread Analysis | ✓ | G-spread, Z-spread, OAS vs benchmark |
| `duration-ladder` | Duration Ladder | ✓ | Key-rate DV01 ladder chart |
| `vol-surface` | Vol Surface | ✓ | Implied vol surface heatmap |

### Adding a Panel

```
1. Add entry to PANEL_IDS / PANEL_TITLES in panelRegistry.ts
2. Add a case to the renderPanel switch in DashboardLayout.tsx
3. (Optional) Add to SINGLETON_PANELS if only one instance should exist
4. (Optional) Add to a layout model in layoutModels.ts
```

### Channel Linking

Panels can be linked by colour channel (red, green, blue, yellow). When you click a symbol in a linked Market Ladder, all other panels on the same channel filter to that symbol automatically. Channel assignment is per-tab and stored in the layout model.

---

## 13. Workspace Layout Templates

22 pre-configured templates are defined in [layoutModels.ts](../frontend/src/components/dashboard/layoutModels.ts). The active workspace is stored in `localStorage` under `veta-layout-v5`.

| Template Key | Display Name | Target Persona |
|-------------|--------------|----------------|
| `full` | Full Dashboard | All-purpose high-touch trader |
| `execution` | Execution | Order execution focus |
| `algo` | Algo Trading | Algorithmic trading desk |
| `analysis` | Equities Analysis | Equity research and analytics |
| `options` | Options | Derivatives trading |
| `commodities-trading` | Commodities Trading | Commodities desk |
| `commodities-analysis` | Commodities Analysis | Commodities research |
| `admin` | Mission Control | System administrators |
| `market-feeds` | Market Feeds | Market data operations |
| `system-status` | System Status | Infrastructure monitoring |
| `pipeline-ops` | Pipeline Ops | Backend pipeline operations |
| `administration` | Administration | Platform administration |
| `overview` | Market Overview | Price-focused overview |
| `research` | Research | Signal research workspace |
| `ai-advisory` | AI Advisory | Signal radar → price chart → order entry |
| `intelligence` | Intelligence Hub | Signal radar + heatmap + recommendations + news |
| `fi-analysis` | FI Analysis | Fixed income analytics (yield curve, spread, duration, vol) |
| `fi-trading` | FI Trading | High-touch bond desk with RFQ flow |
| `fi-research` | FI Research | Rates intelligence research |
| `observability` | Observability | Bus event monitoring |
| `algo-pipeline` | Pipeline Monitor | Algo pipeline visibility |
| `clear` | Clear Layout | Empty canvas for custom builds |

> Workspace URL parameter: `?ws=<template-key>` — e.g., `?ws=fi-analysis` to open directly on the FI workspace.

---

## 14. Desktop App (Electron)

The Electron app wraps the frontend in a desktop shell with native window chrome, system tray, deep links, and file-save dialogs. The app connects to the backend at `http://localhost:5011` by default — all services must be running locally.

### Running Locally

```bash
cd frontend

# Development (Vite hot reload + Electron)
npm run electron:dev

# Production build (creates dist/ + dist-electron/)
npm run electron:build

# Run E2E tests against the built app
npm run electron:build-test
npm run test:electron
```

### contextBridge API (`window.electronAPI`)

Available in all renderer pages:

| Method | Description |
|--------|-------------|
| `minimize()` | Minimise the window |
| `maximize()` | Toggle maximise/restore |
| `close()` | Hide to system tray |
| `isMaximized()` → `Promise<boolean>` | Check window state |
| `quit()` | Destroy tray + quit app |
| `platform` | `"darwin"` \| `"win32"` \| `"linux"` |
| `appVersion` | Version string from `package.json` |
| `onDeepLink(cb)` | Subscribe to `veta://` deep link navigation |
| `openExternal(url)` | Open URL in default browser (https only) |
| `showSaveDialog(options)` → `Promise<string \| null>` | Native save-file dialog |
| `writeFile(path, content)` | Write file at `path` with UTF-8 `content` |

### Security Settings

- `contextIsolation: true` — renderer has no access to Node.js APIs
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- External URLs (non-localhost, non-file://) are opened in the default browser, not Electron

### System Tray

Double-click the tray icon to restore the window. Right-click for "Show VETA" and "Quit VETA".

### Deep Links

The app registers the `veta://` protocol. Example:
```
veta://dashboard?symbol=AAPL
```
Received in the renderer via `window.electronAPI.onDeepLink(cb)`.

### Creating a Release

Tag a commit and push — the release workflow builds on all three platforms:

```bash
git tag v1.2.3
git push origin v1.2.3
```

Output: `.dmg` (macOS universal), `.exe` (Windows NSIS), `.AppImage` (Linux x64).

---

## 15. LLM Advisory Subsystem

The LLM advisory layer produces natural-language commentary on signals and recommendations. It is **advisory-only** — it cannot submit, modify, or cancel orders.

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `LLM_ENABLED` | `false` | Enable the subsystem at all |
| `LLM_WORKER_ENABLED` | `false` | Allow the worker process to start |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API endpoint |
| `LLM_MODEL` | `qwen2.5:3b` | Model name |

The LLM worker:
- Runs **locally** within the container using Ollama (no external API calls by default)
- **Never auto-restarts** — started on-demand via the admin panel or REST
- Exits after its job limit or idle timeout

### Subsystem States

| State | Condition |
|-------|-----------|
| `disabled` | `LLM_ENABLED = false` |
| `armed` | Enabled, no pending jobs, cooldown elapsed |
| `active` | Enabled, jobs in queue |
| `cooldown` | Enabled, no jobs, last activity too recent |
| `error` | Enabled, last error within 30 s |

### Admin Operations

```bash
# Check state
GET /advisory/admin/state

# Enable and set trigger mode
PUT /advisory/admin/state  { "enabled": true, "triggerMode": "manual" }

# Queue one advisory job per tracked symbol
POST /advisory/admin/watchlist-brief

# Start the LLM worker
POST /advisory/admin/trigger-worker
```

---

## 16. Data Stores

### PostgreSQL (port 5432)

Used by the **User Service** only.

| Schema | Table | Contents |
|--------|-------|---------|
| `users` | `users` | User accounts (id, username, passwordHash, role) |
| `users` | `sessions` | Active sessions (token, userId, expiresAt) |
| `users` | `trading_limits` | Per-user limit overrides |
| `users` | `preferences` | Per-user layout and UI preferences |
| `users` | `shared_workspaces` | Shared layout presets |
| `users` | `alerts` | User alert records |

### SQLite (per-service)

| Service | File | Contents |
|---------|------|---------|
| Journal | `journal.db` | Order audit trail (90-day) + 1m/5m OHLCV candles |
| Observability | `observability.db` | Bus event log (24-hour, composite index on type+ts) |
| FIX Archive | `fix-archive.db` | FIX 4.4 execution reports |
| Feature Engine | `features.db` | Last 500 FeatureVectors per symbol |
| Signal Engine | `signals.db` | Signal weights |
| LLM Advisory | `llm-advisory.db` | Advisory job queue and note store |
| Market Data | `market_data_overrides.json` | Per-symbol source override config |

### SQLite Performance Settings

All SQLite databases use:
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -16000;
PRAGMA busy_timeout = 10000;
```

High-volume events (`algo.heartbeat`, `user.access`) are **not persisted** — they use in-memory ring buffers (200 slots).

Batched write queue (Journal, FIX Archive): max 50 rows/transaction, 50 ms flush interval.

---

## 17. Process Management

### Dev Container — supervisord

```bash
# Status of all services
supervisorctl -c /home/deno/supervisord.conf status

# Restart a single service (e.g., gateway)
supervisorctl -c /home/deno/supervisord.conf restart gateway

# Restart all services
supervisorctl -c /home/deno/supervisord.conf restart all

# Tail logs for a service
supervisorctl -c /home/deno/supervisord.conf tail -f gateway
```

**All supervisord process names:**

`market-sim`, `ems`, `oms`, `algo-trader` (Limit), `twap-algo`, `pov-algo`, `vwap-algo`, `iceberg-algo`, `sniper-algo`, `arrival-price-algo`, `is-algo`, `momentum-algo`, `observability`, `user-service`, `journal`, `fix-archive`, `news-aggregator`, `analytics-service`, `market-data-service`, `market-data-adapters`, `feature-engine`, `signal-engine`, `recommendation-engine`, `scenario-engine`, `llm-advisory`, `gateway`

> Note: the Limit Algo process is named `algo-trader` in supervisord (not `limit-algo`).

> `llm-worker` is registered with `autostart=false` and `autorestart=false` — start it on-demand only.

### Docker Compose (deployed environments)

```bash
# Start everything
docker compose -f compose.yml -f compose.prod.yml up -d

# Check status
docker compose -f compose.yml -f compose.prod.yml ps

# Restart a service
docker compose -f compose.yml -f compose.prod.yml restart gateway

# Follow logs
docker compose -f compose.yml -f compose.prod.yml logs -f gateway
```

---

## 18. Deployment

### Homelab (self-hosted Proxmox VM)

- **VM**: 8 vCPU / 20 GB RAM, 192.168.1.245
- **URL**: `http://veta.home` (add `192.168.1.245 veta.home` to `/etc/hosts`)
- **Stack location**: `/opt/stacks/veta/` (Dockge-managed)
- **Images**: `ghcr.io/milesburton/veta-trading-platform/<service>:latest`

```bash
# On the homelab VM — first-time setup
mkdir -p /opt/stacks/veta && cd /opt/stacks/veta
cat > .env <<EOF
ACME_EMAIL=miles@mnetcs.com
DOMAIN=veta.home
COMMIT_SHA=latest
EOF

docker compose -f compose.yml -f compose.prod.yml pull
docker compose -f compose.yml -f compose.prod.yml up -d
```

**Auto-updates**: Watchtower polls GHCR every 5 minutes; new images are live within ~5 minutes of CI completing.

**Traefik dashboard**: `http://veta.home:8888/dashboard/`

**Disk monitor**: `http://veta.home:8099/health` — keyword `ok`, prunes dangling images at >90% disk.

### Fly.io (cloud demo)

- **URL**: `https://veta-trading.fly.dev`
- **Deploy**: GitHub Actions → `workflow_dispatch` on the Deploy workflow; or manually:

```bash
flyctl deploy --remote-only \
  --build-arg VITE_COMMIT_SHA=$(git rev-parse --short HEAD) \
  --build-arg VITE_BUILD_DATE=$(date -u +%Y-%m-%d)
```

Fly.io terminates TLS at the edge. `min_machines_running=1`, `auto_stop_machines=suspend`.

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `DOMAIN` | Primary domain for Traefik `Host()` matchers |
| `ACME_EMAIL` | Let's Encrypt registration email |
| `COMMIT_SHA` | Git SHA (set by CI) — appears in `/health` version field |
| `VITE_DEPLOYMENT` | `local` \| `homelab` \| `fly` — controls which services appear in Estate Overview |
| `LLM_ENABLED` | `true` to activate LLM advisory (requires Ollama) |
| `ALPHA_VANTAGE_API_KEY` | Optional — enables live Alpha Vantage price feeds |

---

## 19. CI / CD

GitHub Actions workflows are in [.github/workflows/](../.github/workflows/).

### CI Pipeline (`ci.yml`)

Triggered on every push to `main` and all pull requests.

| Job | What it runs |
|-----|-------------|
| `lint-and-typecheck` | `deno lint` + `deno check` + `cd frontend && npm run typecheck` |
| `unit-tests` | `deno task test` (backend unit tests) |
| `smoke-tests` | `deno test --allow-all smoke.test.ts` (requires live services in Docker) |
| `frontend-unit` | `cd frontend && npm run test:unit` (Vitest, 570+ tests) |
| `frontend-e2e` | `cd frontend && npx playwright test` (34 Playwright tests, mocked gateway) |
| `electron-build` | `npm run electron:build-test` → Playwright Electron E2E tests (xvfb, `continue-on-error: true`) |
| `docker-build` | Build and push all service images to GHCR |
| `screenshots` | Playwright screenshot capture → committed to `docs/screenshots/` |

### Deploy Workflow (`deploy.yml`)

Manual trigger (`workflow_dispatch`). Builds and deploys to Fly.io.

### Release Workflow

Triggered on `v*` tags. Builds Electron installers on `macos-latest`, `windows-latest`, `ubuntu-latest` and publishes to GitHub Releases.

---

## 20. Testing Reference

### Backend

```bash
# All backend unit tests
deno task test

# Smoke tests (requires live services)
deno task test:smoke

# Integration tests (requires live services)
deno task test:integration

# Type check
deno task check

# Lint
deno task lint
```

**Backend test files:**

| File | Coverage |
|------|---------|
| `smoke.test.ts` | 29 tests — health checks, WS pipeline, order submission, journal |
| `integration.test.ts` | End-to-end order fill, algo slice counts, fill rates |
| `algo.integration.test.ts` | LIMIT, TWAP, POV, VWAP, ICEBERG, SNIPER, ARRIVAL_PRICE (9 tests) |
| `intelligence.integration.test.ts` | Feature engine → signal engine → recommendations |
| `load.test.ts` | Bulk injection, pipeline throughput, fill rate under load |
| `oms.test.ts` | OMS validation and routing logic |
| `journal.test.ts` | Journal in-memory store and order reconstruction |
| `journal.http.test.ts` | Journal HTTP endpoints |
| `analytics.unit.test.ts` | Black-Scholes, Monte Carlo, bond pricing |
| `feature-engine.test.ts` | Feature vector computation |
| `signal-engine.test.ts` | Signal scoring and weights |
| `fixParser.test.ts` | FIX message parsing |
| `gridQuery.test.ts` | Journal grid query filters |
| `unit.test.ts` | Miscellaneous utility functions |
| `test-helpers.ts` | Shared fixtures and Kafka setup utilities |

### Frontend

```bash
cd frontend

# Unit tests (Vitest)
npm run test:unit

# Playwright E2E (mocked gateway)
npx playwright test

# Playwright with UI
npx playwright test --headed

# Electron E2E
npm run test:electron   # requires: npm run electron:build-test first

# Type check
npm run typecheck

# Lint / autofix
npm run lint
npm run lint:fix
```

**Frontend test files:**
- `tests/auth.spec.ts` — Login, session, RBAC
- `tests/market-data.spec.ts` — Price ladder, candle chart, market depth
- `tests/orders.spec.ts` — Order ticket, blotter, fill flow
- `tests/fixed-income.spec.ts` — FI panels, RFQ, yield curve
- `tests-electron/electron.spec.ts` — Window title, contextBridge API, IPC, security
- `tests-electron/screenshots.spec.ts` — Screenshot capture for docs

---

## 21. Configuration Reference

### Deno Tasks (`deno.json`)

```bash
deno task lint          # Lint backend/src/
deno task check         # Type-check all backend service files
deno task test          # Run all unit tests
deno task test:unit     # Same as test
deno task test:integration  # Integration tests (live services required)
deno task test:smoke    # Smoke tests (live services required)
deno task all           # lint + check + test + smoke
```

### Frontend npm Scripts (`frontend/package.json`)

```bash
npm run dev             # Vite dev server on port 5173
npm run build           # tsc + vite build → dist/
npm run preview         # Preview production build
npm run typecheck       # tsc --noEmit
npm run lint            # Biome lint
npm run lint:fix        # Biome lint + auto-fix
npm run test:unit       # Vitest (all *.test.ts files in src/)
npm run test:ui         # Playwright E2E
npm run electron:dev    # Electron with hot reload
npm run electron:build  # Production Electron build
npm run electron:build-test  # Test build (bakes localhost:7777 URLs)
npm run electron:dist   # Full distribution build (creates installers)
npm run test:electron   # Playwright Electron E2E
```

---

## 22. Troubleshooting

### Service won't start

```bash
# Check supervisord status
supervisorctl -c /home/deno/supervisord.conf status

# View logs
supervisorctl -c /home/deno/supervisord.conf tail -f <name>

# Common fix: Kafka consumer group "not aware of member" — transient after rapid restart; wait 10s
```

### Journal SQLite corruption (`SQLITE_CORRUPT`)

```bash
supervisorctl -c /home/deno/supervisord.conf stop journal
rm /tmp/journal.db /tmp/journal.db-wal /tmp/journal.db-shm 2>/dev/null
supervisorctl -c /home/deno/supervisord.conf start journal
```

### Observability database too large (>1M rows)

Per-instance consumer group IDs avoid replay, so deleting the DB is safe:

```bash
supervisorctl -c /home/deno/supervisord.conf stop observability
rm /tmp/observability.db* 2>/dev/null
supervisorctl -c /home/deno/supervisord.conf start observability
```

### Candle chart shows no data

1. Check journal is healthy: `curl http://localhost:5009/health`
2. Check that `market-sim` is running and publishing `market.ticks`
3. Wait 60 seconds for the first 1-minute candle to close

### OMS rejecting all orders

Check the user's trading limits:
```bash
curl http://localhost:5011/me   # shows role + limits in the response
```
Admin/compliance roles cannot trade. `max_order_qty: 0` or `max_daily_notional: 0` will block all orders.

### Electron: window doesn't appear in CI

The Electron job uses `continue-on-error: true`. The underlying issue is `--disable-gpu` preventing the `ready-to-show` event. The `show: isTest` flag in `main.ts` works around this in most environments. If the window still doesn't appear, check xvfb is running (`DISPLAY=:99`).

### FlexLayout tab not clickable (Playwright tests)

The order ticket dialog has a `fixed inset-0` backdrop that intercepts clicks. `AppPage.panelByTitle()` automatically closes the dialog before switching tabs. If a test fails with pointer interception, check that `AppPage` is being used (not raw Playwright `locator.click()`).

### Alpha Vantage prices not updating

1. Check `ALPHA_VANTAGE_API_KEY` is set
2. `GET /market-data/sources` — verify the symbol has `source: "alpha-vantage"` override set
3. Alpha Vantage free tier: 5 requests/minute, 500/day — round-robin polling every 5 minutes

### LLM advisory not generating notes

1. Check `LLM_ENABLED=true` and `LLM_WORKER_ENABLED=true` are set
2. Check Ollama is running: `curl http://localhost:11434/api/tags`
3. Pull the model if missing: `ollama pull qwen2.5:3b`
4. Trigger worker: `POST /advisory/admin/trigger-worker`
5. Check subsystem state: `GET /advisory/admin/state`

### Homelab: containers not updating

Watchtower polls every 5 minutes. Force immediate update:
```bash
docker pull ghcr.io/milesburton/veta-trading-platform/gateway:latest
docker compose -f compose.yml -f compose.prod.yml up -d gateway
```

### Redpanda not starting (Fly.io)

The `redpanda-start.sh` wrapper calls the binary directly with the bundled `ld.so`:
```bash
/usr/local/lib/redpanda/ld.so --library-path /usr/local/lib/redpanda /usr/local/bin/redpanda ...
```
Do **not** pass `redpanda redpanda` — the binary has no subcommand. Config is written to `/etc/redpanda/redpanda.yaml` by the wrapper.

---

*For architecture diagrams see [architecture.md](architecture.md). For deployment setup see [deployment.md](deployment.md). For individual service API docs see [api/](api/).*
