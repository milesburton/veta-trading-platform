---
title: Testing
description: Test suites, coverage, and how to run them.
sidebar:
  order: 6
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
| Visual anomalies | `cd frontend && npx playwright test tests/visual-anomalies.spec.ts` | DOM-overflow + axe-core a11y/contrast scan across login + key workspaces |

## Visual anomalies

`tests/visual-anomalies.spec.ts` is a non-gating informational suite that walks a small set of scenarios (login, trader dashboard, admin dashboard) and reports two classes of issue:

- **DOM overflows** — flags any visible element where `scrollWidth > clientWidth` (or vertical equivalent) while the parent has `overflow: hidden`. Catches text clipping, badge truncation, container sizing bugs that don't show up in pixel-diff screenshot regression because they look the same as the previous broken state. Filters out `sr-only` (legitimate visually-hidden a11y text) and elements with `clip` / `clip-path`.
- **axe-core violations** — runs `@axe-core/playwright` and surfaces colour-contrast, ARIA misuse, link-distinguishability, and other WCAG issues. The `region` rule is disabled because Starlight pages don't fit it.

Output is written to `docs/visual-anomalies/report.json` (gitignored — regenerated per run). On pull requests the [`pr-visual-anomalies` job](https://github.com/milesburton/veta-trading-platform/blob/main/.github/workflows/ci.yml) uploads the report as an artefact and posts a summary comment.

To extend the spec, add a new `test()` block that drives the page to the state you want to inspect, then call `captureAnomalies(page, "scenario-name")`. Keep the set small — every added scenario is ~3-5s of CI time.

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

## Integration test isolation — known gap

The current integration tests (`integration.test.ts`, `algo.integration.test.ts`, `intelligence.integration.test.ts`, `scenarios.integration.test.ts`) hit a **shared compose stack**: CI runs `docker compose up -d`, then every test points at the same `localhost:50xx` services. This is **not** how a serious trading platform should test integrations.

Concretely: tests can leak state into the next test via Postgres rows, Redpanda offsets, OMS in-memory order tracking, and risk-engine rate limits. We work around this with `Date.now()`-suffixed scenario names and per-test cascade deletes, but the underlying coupling is real.

### Per-test isolation harness — Testcontainers

The migration target is per-test stack isolation: each test file owns its own ephemeral Postgres + Redpanda + the subset of services it actually exercises. This is how production trading systems test, and it's the pattern this platform should be demonstrating.

**Phase 1 is in place.** Helpers live under [`backend/src/tests/testcontainers/`](https://github.com/milesburton/veta-trading-platform/blob/main/backend/src/tests/testcontainers/) and a smoke test asserts the harness boots Postgres (with all migrations applied) and Redpanda from cold:

```bash
deno task test:testcontainers
```

Phases 2-4 (migrate the existing integration tests, drop compose-up from CI) are pending.

### Dev-container quirks

Running Testcontainers from inside this dev container needs three workarounds, all handled by `scripts/run-testcontainers.sh`:

1. **Unix-socket → TCP shim.** Deno's `node:http` polyfill can't write to Docker's unix socket (a `Symbol(Deno.internal.rid)` polyfill gap), so we run a `socat` sidecar that proxies `tcp://<bridge-ip>:2375` → `unix:///var/run/docker.sock` and point `DOCKER_HOST` at it.
2. **Clean `DOCKER_CONFIG`.** Codespaces installs a `credsStore` helper that exits 1 for unauthenticated public-registry pulls — Testcontainers treats that as fatal. We point `DOCKER_CONFIG` at an empty config dir.
3. **`TESTCONTAINERS_HOST_OVERRIDE`.** `container.getHost()` returns `localhost`, but the published port lives on the Docker host's loopback, not ours. Setting the host override to the bridge gateway (`172.17.0.1`) routes connections to the right place.

`TESTCONTAINERS_RYUK_DISABLED=true` is also set — our helpers explicitly stop containers in `finally` blocks, so the Ryuk cleanup sidecar is redundant (and adds another loopback-reachability hurdle).

**If you're writing a new integration test today**: use the existing pattern (target `localhost:50xx`, cascade-delete after) rather than inventing a third style. It'll get migrated alongside the others when phases 2-4 land.

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
