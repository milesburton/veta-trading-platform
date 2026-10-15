---
title: Shared Modules
description: The #veta/ import map and shared code conventions.
sidebar:
  order: 5
---

All shared backend modules use Node subpath imports (`#veta/...`) defined in the `imports` field of the root `package.json`. Use these instead of relative paths.

## Import map

| Alias | Module | Exports |
| --- | --- | --- |
| `zod` | `npm:zod` | Zod, for runtime validation at I/O boundaries |
| `#veta/primitives` | `shared/primitives.ts` | `STRATEGIES`, `Strategy`, `OrderSide`, `Desk`, `AssetClass`, `OrderStatus`, `LiquidityFlag` |
| `#veta/trader-archetypes` | `shared/traderArchetypes.ts` | `TRADER_ARCHETYPES`, `getTraderArchetype()`, starter limits |
| `#veta/http` | `lib/http.ts` | `CORS_HEADERS`, `json()`, `jsonError()`, `corsOptions()`, `parseBody()`, `parseQuery()`, `serveFetch()`, `upgradeWebSocket()` |
| `#veta/auth` | `lib/auth.ts` | `getCookieToken()`, `hasValidServiceToken()` |
| `#veta/db` | `lib/db.ts` | `Pool`, `journalPool`, `usersPool`, `replayPool`, etc. |
| `#veta/logger` | `lib/logger.ts` | `logger`, `registerLogSink()` |
| `#veta/messaging` | `lib/messaging.ts` | `createProducer()`, `createConsumer()` |
| `#veta/telemetry` | `lib/telemetry.ts` | `withSpan()`, `recordGauge()`, `setupProcessMetrics()` |
| `#veta/bootstrap` | `lib/bootstrap.ts` | Side-effect import that initialises `#veta/telemetry` |
| `#veta/market-client` | `lib/market-sim-client.ts` | `createMarketSimClient()` |
| `#veta/market-hours` | `market-sim/market-hours.ts` | `isUsEquityRegularSession()`, `parseAllowOutOfHours()` |
| `#veta/trading-calendar` | `lib/trading-calendar.ts` | `resolveSession()`, `isAuction()`, `TradingCalendar` |
| `#veta/market-calendars` | `lib/market-calendars.ts` | Per-venue calendars such as `US_EQUITY_CALENDAR` |
| `#veta/grid-query` | `lib/grid-query.ts` | `applyExprGroup()`, `applySort()` |
| `#veta/settlement` | `lib/settlement.ts` | `settlementDate()`, `Desk` type |
| `#veta/time-scale` | `lib/time-scale.ts` | Time conversion utilities |
| `#veta/test` | `test-support/test.ts` | `test()`, a Vitest wrapper that accepts a name and function or an options object and provides `t.step()` |
| `#veta/test-assert` | `test-support/assert.ts` | `assert()`, `assertEquals()` and related assertion helpers over Vitest `expect` |
| `#veta/fake-time` | `test-support/fake-time.ts` | `FakeTime`, a Vitest fake-timer wrapper |
| `#veta/fs-walk` | `test-support/fs-walk.ts` | `walk()`, `readDirEntries()` |
| `#veta/run-node` | `test-support/run-node.ts` | `runNode()`, runs a script in a child Node process |
| `#veta/test-server` | `test-support/server.ts` | `listeningPort()`, `closeServer()` for tests that start a server on port 0 |
| `#veta/rate-limit` | `lib/rate-limit.ts` | `RateLimiter`, `clientIp()`, `rateLimitResponse()` |
| `#veta/wait-for` | `lib/wait-for.ts` | `waitForUrl()` |
| `#veta/schemas` | `schemas/index.ts` | Zod schemas, re-exporting the five files below |
| `#veta/schemas/primitives` | `schemas/primitives.ts` | Shared primitive schemas |
| `#veta/schemas/orders` | `schemas/orders.ts` | Order schemas |
| `#veta/schemas/risk` | `schemas/risk.ts` | Risk schemas |
| `#veta/schemas/user` | `schemas/user.ts` | User schemas |
| `#veta/schemas/news` | `schemas/news.ts` | News schemas |
| `#veta/types/orders` | `types/orders.ts` | `RoutedOrder`, `FillEvent` |
| `#veta/types/trade` | `types/types.ts` | `Trade` interface |
| `#veta/types/intelligence` | `types/intelligence.ts` | `FeatureVector`, `Signal`, etc. |
| `#veta/types/llm-advisory` | `types/llm-advisory.ts` | `LlmJob`, `LlmPolicy`, etc. |
| `#veta/types/grid-query` | `types/grid-query.ts` | `GridQueryRequest`, `GridQueryResponse` |

## Usage

```typescript
import { json, corsOptions } from "#veta/http";
import { createConsumer } from "#veta/messaging";
import type { RoutedOrder } from "#veta/types/orders";
```

## Frontend shared utilities

| File | Exports |
| --- | --- |
| `utils/format.ts` | `formatTime()`, `formatBps()`, `formatCurrency()`, `pnlColor()` |
| `utils/gridFilter.ts` | Grid filtering logic |
| `auth/rbac.ts` | `AUTH_ROLES`, `AuthRole`, `canSubmitOrders()`, `ROLE_LABELS` |

## Convention

When adding a new shared module:

1. Create the file in `backend/src/lib/` or `backend/src/types/`
2. Add an alias to `package.json` under `imports`
3. Use the alias in all consumers; never use relative paths for shared code
