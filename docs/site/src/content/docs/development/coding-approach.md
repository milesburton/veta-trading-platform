---
title: Coding Approach
description: How the platform is built, tested, and shipped — from first line to production.
sidebar:
  order: 1
---

VETA follows a "works on my machine" approach: every developer environment is identical because the entire platform runs inside a Docker-based Dev Container. Every change goes through automated testing at four levels before it can reach production.

## Dockerized development

The repository ships a `.devcontainer/devcontainer.json` that configures VS Code (or JetBrains) to build and run the full platform inside a container. This includes:

- **Deno 2.7** for all backend services
- **Node 24** for the React frontend
- **PostgreSQL 16** for journal, user, and replay data
- **Redpanda** (Kafka-compatible) for the message bus
- **Supervisord** managing 30+ microservices

When you open the repository in VS Code and accept "Reopen in Container", you get a fully functional trading platform with zero local setup. The MOTD shows available commands.

```sh
supervisorctl status          # see all services
cd frontend && npm run dev    # start the frontend
```

## Test pyramid

The project enforces testing at four levels, each catching different classes of bugs:

### Unit tests (fast, isolated)

- **Backend**: 230+ tests via `deno task test`. Pure function tests for OMS validation, algo slicing, FIX parsing, analytics math, grid filtering.
- **Frontend**: 797+ tests via Vitest. Redux slices, React components, panel registry, layout models, ticket resolution rules, hooks.
- **Coverage**: v8 provider via Vitest; backend via Deno `--coverage`. Coverage badge auto-updated on every push to main.

### Integration tests (services + database)

- 15+ test files run against the full service stack with PostgreSQL and Redpanda.
- Test real order flow: submit via WebSocket → OMS validates → algo routes → EMS fills → journal persists.
- Each algo strategy verified: LIMIT, TWAP, POV, VWAP, ICEBERG, SNIPER, ARRIVAL_PRICE, IS, MOMENTUM.
- Intelligence pipeline: feature engine → signal engine → recommendation engine.
- Journal and market-data HTTP contract tests.

### E2E tests (browser automation)

- 89+ Playwright tests running headless Chromium against the Vite dev server.
- GatewayMock intercepts WebSocket and HTTP to test frontend behaviour without real services.
- Auth flows, order submission, market data rendering, fixed income panels, algo order lifecycle, session replay, observability layouts.
- Page object pattern: `AppPage`, `OrderTicketPage`, `OrderBlotterPage`, `MarketLadderPage`.

### Smoke tests (production-like)

- 87+ tests run against the deployed Fly.io instance after every deploy.
- Health checks for all 32 services.
- Full OAuth login flow with browser-style headers.
- Order lifecycle: submit → fill or expire within timeout.
- Risk-engine CRUD: create session, upload chunks, query events, delete.
- Disk usage assertion: fail if >95% full (prevents the disk-fill incident from recurring).

## Pre-commit hooks

The pre-commit hook runs 8 checks. You cannot push until all pass:

1. `deno lint` — backend linting
2. `deno task check` — backend type-checking (56 files)
3. `deno task test` — backend unit tests
4. `npx @biomejs/biome check src/` — frontend linting
5. `tsc --noEmit` — frontend type-checking
6. `vitest run` — frontend unit tests
7. Smoke tests (if services are running locally)
8. Integration tests (if services are running locally)

## Code conventions

- **TypeScript everywhere** — Deno for backend, Vite + React for frontend
- **No comments** — code should be self-documenting
- **Functional where possible** — pure functions over mutable module state
- **Single source of truth** — shared types in `@veta/types/*`, shared utilities in `@veta/*`
- **Import map aliases** — `@veta/http` not `../lib/http.ts`
- **Conventional commits** — `feat(risk):`, `fix(ci):`, `refactor:`, `docs:`
