---
title: Shared Modules
description: The @veta/ import map and shared code conventions.
---

All shared backend modules use Deno import map aliases defined in `deno.json`. Use these instead of relative paths.

## Import map

| Alias | Module | Exports |
|-------|--------|---------|
| `@veta/http` | `lib/http.ts` | `CORS_HEADERS`, `json()`, `jsonError()`, `corsOptions()` |
| `@veta/auth` | `lib/auth.ts` | `getCookieToken()` |
| `@veta/db` | `lib/db.ts` | `journalPool`, `usersPool`, `replayPool`, etc. |
| `@veta/messaging` | `lib/messaging.ts` | `createProducer()`, `createConsumer()` |
| `@veta/market-client` | `lib/marketSimClient.ts` | `createMarketSimClient()` |
| `@veta/grid-query` | `lib/gridQuery.ts` | `applyExprGroup()`, `applySort()` |
| `@veta/settlement` | `lib/settlement.ts` | `settlementDate()`, `Desk` type |
| `@veta/time-scale` | `lib/timeScale.ts` | Time conversion utilities |
| `@veta/types/orders` | `types/orders.ts` | `RoutedOrder`, `FillEvent` |
| `@veta/types/trade` | `types/types.ts` | `Trade` interface |
| `@veta/types/intelligence` | `types/intelligence.ts` | `FeatureVector`, `Signal`, etc. |
| `@veta/types/llm-advisory` | `types/llm-advisory.ts` | `LlmJob`, `LlmPolicy`, etc. |
| `@veta/types/grid-query` | `types/gridQuery.ts` | `GridQueryRequest`, `GridQueryResponse` |

## Usage

```typescript
import { json, corsOptions } from "@veta/http";
import { createConsumer } from "@veta/messaging";
import type { RoutedOrder } from "@veta/types/orders";
```

## Frontend shared utilities

| File | Exports |
|------|---------|
| `utils/format.ts` | `formatTime()`, `formatBps()`, `formatCurrency()`, `pnlColor()` |
| `utils/gridFilter.ts` | Grid filtering logic |
| `auth/rbac.ts` | `AUTH_ROLES`, `AuthRole`, `canSubmitOrders()`, `ROLE_LABELS` |

## Convention

When adding a new shared module:
1. Create the file in `backend/src/lib/` or `backend/src/types/`
2. Add an alias to `deno.json` under `imports`
3. Use the alias in all consumers — never use relative paths for shared code
