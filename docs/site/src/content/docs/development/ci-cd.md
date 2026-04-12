---
title: CI/CD Pipeline
description: From push to production — every automated step in the deployment pipeline.
sidebar:
  order: 2
---

Every push to any branch triggers the CI workflow. Pushes to `main` additionally trigger deployment to Fly.io and GitHub Pages. The entire pipeline runs in parallel where possible.

## Pipeline diagram

```
Push to any branch:

lint-and-test ─────┬──→ integration (15 min)
                   │    ├─ service contracts
                   │    ├─ algo strategies (retry)
                   │    ├─ intelligence pipeline
                   │    ├─ journal HTTP
                   │    ├─ market-data HTTP
                   │    └─ smoke tests (87+)
                   │
frontend ──────────┼──→ playwright-ui (5 min, parallel)
                   ├──→ screenshots (1.5 min, parallel)
                   ├──→ electron (6 min, parallel)
                   └──→ docker-base → 27 service images (parallel)

Push to main only:
  → Deploy to Fly.io (with smoke tests)
  → Deploy GitHub Pages (Astro build)
  → Release Please (version bump PR)
  → Coverage + test-count badges committed
  → Screenshots committed
```

## Parallelisation

Playwright, screenshots, Electron, and Docker builds run **in parallel with** integration tests. They only depend on the frontend job (~70 seconds), not the 15-minute integration suite. This saves ~10-12 minutes off the critical path.

GitHub Pro provides 20 concurrent jobs — we use up to 35 matrix slots (27 Docker builds run in a matrix) but they queue efficiently.

## What each job does

### lint-and-test (~30 seconds)

- `deno lint` — 113 backend files
- `deno task check` — type-check 56 entry points
- `deno task test:coverage` — 230+ unit tests with lcov output
- Generates `docs/badges/backend-tests.json` with test count

### frontend (~70 seconds)

- `npx @biomejs/biome check src/` — lint 221 files
- `tsc --noEmit` — type-check
- `npm run test:coverage` — 797+ unit tests with v8 coverage
- Generates `docs/badges/frontend-tests.json` and `docs/badges/coverage.json`

### integration (~15 minutes)

- Starts PostgreSQL, Redpanda, and all 30+ services
- Runs database migrations (0001–0012)
- Waits for all services to be healthy (port polling)
- Waits for market-sim to produce prices
- Waits for risk-engine to have prices tracked
- Configures risk-engine limits for test throughput
- Runs 5 integration test suites + smoke tests
- Generates `docs/badges/integration-tests.json`

### playwright-ui (~5 minutes)

- Installs Chromium
- Runs 89+ E2E tests headless against Vite dev server
- GatewayMock provides deterministic backend responses
- Generates `docs/badges/e2e-tests.json`

### docker-services (~3-5 minutes per image, parallel)

- Builds 27 individual service Docker images
- Pushes to GHCR (`ghcr.io/milesburton/veta-trading-platform/<service>:latest`)
- Matrix build: all 27 run simultaneously

## Deployment on change

### Fly.io

On every push to `main`:

1. Tests pass (lint-and-test + frontend)
2. `flyctl deploy` builds the monolith Dockerfile with `VITE_COMMIT_SHA` and `VITE_BUILD_DATE`
3. 3-attempt retry with 30-second backoff on failure
4. Version verification: polls `/health` until the deployed SHA matches
5. Full smoke test suite runs against the live deployment
6. Concurrency control: only one deploy runs at a time (`concurrency: fly-deploy`)

### Homelab

- Watchtower polls GHCR every 5 minutes
- When a new `:latest` image is detected, the container auto-restarts
- Typical lag: ~5 minutes after Docker build completes

### GitHub Pages

- Triggers on changes to `docs/**`
- Builds the Astro + Starlight site (`npm run build` ~4 seconds)
- Copies screenshots into the build
- Deploys via `actions/deploy-pages@v4`

## Badge generation

Every CI run on `main` generates JSON badge files committed to `docs/badges/`:

| Badge | Source | Format |
|-------|--------|--------|
| Backend tests | `deno task test:coverage` output | `"230 passed"` |
| Frontend tests | `npm run test:coverage` output | `"797 passed"` |
| Integration tests | `deno task test:smoke` output | `"87 passed"` |
| E2E tests | Playwright output | `"89 passed"` |
| Coverage | `coverage-summary.json` | `"42.5%"` |

Badges are shields.io endpoint badges reading from the raw GitHub file URL.

## Release management

- **Release Please** auto-generates version bump PRs from conventional commits
- **Dependabot** auto-merges patch-level npm dependency updates
- **Changelog** auto-generated from commit messages
