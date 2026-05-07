---
title: CI/CD Pipeline
description: From push to production — every automated step in the deployment pipeline.
sidebar:
  order: 2
---

Every push to any branch triggers the CI workflow. Pushes to `main` additionally trigger GitHub Pages and trigger Watchtower on the homelab via the `:latest` Docker images pushed to GHCR. The Fly.io deployment is currently disabled (manual-dispatch only — see [Fly.io](#flyio) below). The entire pipeline runs in parallel where possible.

## Pipeline diagram

```mermaid
flowchart LR
  Push["Push (any branch)"]:::trigger

  Push --> Lint["lint-and-test<br/><i>~30s</i>"]:::test
  Push --> Frontend["frontend<br/><i>~70s</i>"]:::test

  Lint --> Integration["integration<br/><i>~15 min</i>"]:::heavy

  Frontend --> Playwright["playwright-ui<br/><i>~5 min</i>"]:::parallel
  Frontend --> Screenshots["screenshots<br/><i>~1.5 min</i>"]:::parallel
  Frontend --> Electron["electron<br/><i>~6 min</i>"]:::parallel
  Frontend --> DockerBase["docker-base"]:::parallel

  DockerBase --> DockerMatrix["34 service images<br/><i>matrix</i>"]:::parallel

  Integration --> MainCheck{"branch = main?"}:::decision
  Playwright --> MainCheck
  DockerMatrix --> MainCheck

  MainCheck -- "yes" --> Pages["Deploy GitHub Pages"]:::deploy
  MainCheck -- "yes" --> Release["Release Please PR"]:::deploy
  MainCheck -- "yes" --> Badges["Commit badges &<br/>screenshots"]:::deploy

  classDef trigger fill:#0ea5e9,stroke:#0284c7,color:#fff
  classDef test fill:#22c55e,stroke:#16a34a,color:#000
  classDef heavy fill:#a78bfa,stroke:#8b5cf6,color:#000
  classDef parallel fill:#f59e0b,stroke:#d97706,color:#000
  classDef decision fill:#64748b,stroke:#475569,color:#fff
  classDef deploy fill:#f472b6,stroke:#ec4899,color:#000
```

Integration covers service contracts, algo strategies (retry), the intelligence pipeline, journal HTTP, market-data HTTP, and smoke tests (87+). Playwright/screenshots/Electron/Docker builds run in parallel with integration — they only wait on the frontend job, not the 15-minute integration suite.

## Parallelisation

Playwright, screenshots, Electron, and Docker builds run **in parallel with** integration tests. They only depend on the frontend job (~70 seconds), not the 15-minute integration suite. This saves ~10-12 minutes off the critical path.

GitHub Pro provides 20 concurrent jobs — we use up to 40 matrix slots (34 Docker builds run in a matrix) but they queue efficiently.

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
- Runs database migrations (0001–0013)
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

- Builds 34 individual service Docker images
- Pushes to GHCR (`ghcr.io/milesburton/veta-trading-platform/<service>:latest`)
- Matrix build: all 34 run simultaneously

## Deployment on change

### Fly.io

**Disabled on push.** The homelab is the canonical deployment target right now (solar-powered, plenty of resources, no per-machine memory cap). The Fly workflow file is kept so the deploy recipe stays self-documenting; manual deploys via `gh workflow run deploy.yml --ref main` still work for emergencies. To re-enable on every main push, restore the `push: branches: main` trigger in [`.github/workflows/deploy.yml`](https://github.com/milesburton/veta-trading-platform/blob/main/.github/workflows/deploy.yml).

When enabled, the workflow:

1. Runs tests (lint-and-test + frontend)
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
| Integration tests | `deno task test:testcontainers` output | `"62 passed"` |
| E2E tests | Playwright output | `"89 passed"` |
| Coverage | `coverage-summary.json` | `"42.5%"` |

Badges are shields.io endpoint badges reading from the raw GitHub file URL.

## Release management

- **Release Please** auto-generates version bump PRs from conventional commits
- **Dependabot** auto-merges patch-level npm dependency updates
- **Changelog** auto-generated from commit messages
