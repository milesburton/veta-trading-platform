---
title: Contributing
description: How to contribute to the VETA Trading Platform.
sidebar:
  order: 3
---

## Development environment

The project uses a **Dev Container** — open the repository in VS Code or JetBrains and accept the "Reopen in Container" prompt. This sets up Deno, Node, PostgreSQL, Redpanda, and all dependencies automatically.

## Code standards

- **TypeScript everywhere** — Deno for backend, Vite + React for frontend
- **No comments in code** — the codebase should be self-documenting. Exceptions: biome-ignore and eslint-disable directives
- **Functional where possible** — pure functions with explicit inputs/outputs over mutable module-level state
- **Single source of truth** — shared types in `backend/src/types/`, shared utilities in `backend/src/lib/`, shared frontend utilities in `frontend/src/utils/`
- **Import map aliases** — use `@veta/http`, `@veta/messaging`, `@veta/types/orders` etc. instead of relative paths like `../lib/http.ts`

## Pre-commit hooks

The pre-commit hook runs 8 checks automatically:

1. Backend lint (`deno lint`)
2. Backend type-check (`deno task check`)
3. Backend unit tests (`deno task test`)
4. Frontend lint (Biome)
5. Frontend type-check (tsc)
6. Frontend unit tests (Vitest)
7. Smoke tests (if services are running)
8. Integration tests (if services are running)

You cannot push until all checks pass.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(risk): add pre-trade risk-engine with fat-finger checks
fix(ci): wait for risk-engine prices before integration tests
refactor: consolidate shared types across 29 files
docs(personas): document trading styles and desk segregation
test(replay): add unit tests for session replay panel
```

## Pull requests

- Release Please auto-generates version bumps and changelogs
- Dependabot auto-merges patch-level dependency updates
- CI must be green before merge (integration tests are `continue-on-error` for known flaky strategies)
