---
title: Testing
description: Test suites, coverage, and how to run them.
sidebar:
  order: 6
---

## Test suites

| Suite | Command | What it covers |
|-------|---------|---------------|
| Backend unit | `deno task test` | OMS validation, algo slicing, FIX parsing, analytics, grid filtering, schema validation |
| Backend coverage | `deno task test:coverage` | Same tests with `--coverage`; emits `coverage.lcov` |
| Frontend unit | `cd frontend && npm run test:unit` | Redux slices, components, panel registry, layout models, hooks |
| Frontend coverage | `cd frontend && npm run test:coverage` | Same tests with v8 coverage reporting |
| Integration (Testcontainers) | `deno task test:testcontainers` | Per-test ephemeral Postgres + Redpanda + service stack — see [Testcontainers](/veta-trading-platform/development/testcontainers/) |
| Smoke (deploy gate) | `deno task test:smoke` | Full health-check suite for the post-deploy gate on Fly + homelab |
| Playwright E2E | `cd frontend && npx playwright test` | Auth, orders, market data, FI, algo, session replay, observability |
| Electron E2E | `cd frontend && npm run test:electron` | Desktop app — window, startup, contextBridge, pop-out |
| Visual anomalies | `cd frontend && npx playwright test tests/visual-anomalies.spec.ts` | DOM-overflow + axe-core a11y/contrast scan across login + key workspaces |

Integration tests run on Testcontainers in CI — every `.tc.test.ts` file boots its own ephemeral Postgres, Redpanda, and the subset of services it actually exercises. The legacy `*.integration.test.ts` files still exist in the repo for local debugging against a shared compose stack but are no longer wired into CI.

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
lint-and-test ─┬──→ integration (Testcontainers)
               ├──→ docker-base → docker-services
frontend ──────┼──→ playwright-ui (parallel)
               ├──→ screenshots (parallel)
               └──→ electron (parallel)
```

Playwright, screenshots, Electron, and Docker all run in parallel with the integration job (not blocked by it).

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

For anything that needs Postgres, Redpanda, or other services, write a `.tc.test.ts` instead — see [Testcontainers](/veta-trading-platform/development/testcontainers/).

### Frontend

Use Vitest + React Testing Library. Follow the pattern in `src/components/__tests__/`.

### Playwright E2E

Use the `AppPage` helper and `GatewayMock` for mocked backend interactions. Auth fixtures in `tests/helpers/authFixtures.ts`.
