---
title: Testing
description: Test suites, coverage, and how to run them.
---

## Test suites

| Suite | Command | What it covers |
|-------|---------|---------------|
| Backend unit | `deno task test` | 230+ tests — OMS validation, algo slicing, FIX parsing, analytics, grid filtering |
| Frontend unit | `cd frontend && npm run test:unit` | 797+ tests — Redux slices, components, panel registry, layout models, hooks |
| Frontend coverage | `cd frontend && npm run test:coverage` | Same tests with v8 coverage reporting |
| Integration | `deno task test:integration` | End-to-end order flow, algo fill rates, intelligence pipeline, journal HTTP |
| Smoke | `deno task test:smoke` | 87+ tests — all service health checks, OAuth flow, order lifecycle, risk-engine |
| Playwright E2E | `cd frontend && npx playwright test` | 89+ tests — auth, orders, market data, FI, algo, session replay, observability |
| Electron E2E | `cd frontend && npm run test:electron` | Desktop app — window, startup, contextBridge, pop-out |

## Coverage

Coverage is generated on every push to `main`:

- **Frontend**: v8 provider via Vitest, reports as `text-summary`, `lcov`, and `json-summary`
- **Backend**: Deno native `--coverage` flag, exported as lcov
- **Badge**: auto-committed to `docs/badges/coverage.json` and displayed in the README

## CI pipeline

```
lint-and-test ─┬──→ integration (15 min, independent)
               ├──→ docker-base → docker-services
frontend ──────┼──→ playwright-ui (5 min, parallel)
               ├──→ screenshots (1.5 min, parallel)
               └──→ electron (6 min, parallel)
```

Playwright, screenshots, Electron, and Docker all run in parallel with integration tests (not blocked by them).

## Writing tests

### Backend

Use Deno's built-in test runner. Import `timeout()` from `test-helpers.ts` for HTTP timeouts.

```typescript
import { assertEquals } from "https://deno.land/std@0.210.0/testing/asserts.ts";
import { timeout } from "./test-helpers.ts";

Deno.test("[service] endpoint returns expected data", async () => {
  const res = await fetch("http://localhost:5032/health", { signal: timeout() });
  assertEquals(res.status, 200);
});
```

### Frontend

Use Vitest + React Testing Library. Follow the pattern in `src/components/__tests__/`.

### Playwright E2E

Use the `AppPage` helper and `GatewayMock` for mocked backend interactions. Auth fixtures in `tests/helpers/authFixtures.ts`.
