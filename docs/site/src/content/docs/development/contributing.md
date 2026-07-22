---
title: Contributing
description: How to contribute to the VETA Trading Platform.
sidebar:
  order: 3
---

## Development environment

The project uses a **Dev Container**. Open the repository in VS Code or JetBrains and accept the "Reopen in Container" prompt. This sets up Deno, Node, PostgreSQL, Redpanda, and all dependencies automatically.

## Code standards

- **TypeScript everywhere**: Deno for backend, Vite and React for frontend.
- **No comments in code**: the codebase should be self-documenting. Exceptions: `biome-ignore` and `eslint-disable` directives, and the two docs-linking markers described below (`// docs: /path/` references and `// #region docs:name` / `// #endregion docs:name` region markers).
  If a piece of code has non-obvious rationale that a future reader genuinely needs (a workaround for a specific bug, a subtle invariant, why a value was chosen), write that explanation as a docs page instead of a comment, and leave a single-line reference in the code pointing at it, e.g. `// docs: /development/testing/k6-load-testing/`. Use `<Source>` (see [Source References](/veta-trading-platform/development/source-references/)) on the docs side to link back to the exact file or region, so the pair stays in sync and the build fails if either side drifts.
- **Functional where possible**: pure functions with explicit inputs and outputs over mutable module-level state.
- **Single source of truth**: shared types in `backend/src/types/`, shared utilities in `backend/src/lib/`, shared frontend utilities in `frontend/src/utils/`.
- **Import map aliases**: use `@veta/http`, `@veta/messaging`, `@veta/types/orders` etc. instead of relative paths like `../lib/http.ts`.

### Known false-positive lint suppressions

`useAllServiceHealth` in `frontend/src/components/StatusBar.tsx` iterates a module-level constant array and calls a hook per element. Biome's static analysis cannot see that `SERVICES` is a fixed, module-level array, so it flags the call as a conditional/loop-dependent hook call. The iteration order is stable across every render (the array reference never changes), so the Rule of Hooks is satisfied semantically even though biome cannot verify it structurally; the accompanying `biome-ignore` is a verified false positive, not a workaround.

## Pre-commit hooks

The pre-commit hook runs 9 checks automatically:

1. Verify clean working directory.
2. Backend lint (`deno lint`).
3. Backend type-check (`deno task check`).
4. Backend unit tests (`deno task test`).
5. Frontend lint (Biome).
6. Frontend type-check (tsc).
7. Frontend unit tests (Vitest).
8. Smoke tests (auto-skipped if local services are not running).
9. Integration tests (auto-skipped if local services are not running).

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

- Release Please auto-generates version bumps and changelogs.
- Dependabot auto-merges patch-level dependency updates.
- CI must be green before merge (integration tests are `continue-on-error` for known flaky strategies).
- Screenshots are automated, not manual: CI captures the full UI suite on every PR and posts a `📸 UI screenshots` comment showing what changed against the committed baseline. Verify a UI-affecting change in a running instance of the app yourself first; do not rely on unit tests alone to confirm layout or visual behaviour. See [CI/CD Pipeline](/veta-trading-platform/development/ci-cd/) for how screenshot capture and diffing work.

## Documentation standards

- Use British English spelling and grammar.
- Use a professional, direct tone. Avoid conversational or jovial phrasing.
- Do not use em-dashes (`—`). Replace with commas, periods, or restructure the sentence.
- Mark key documents with a leading star in curated document lists.
- Do not use ASCII-art diagrams; use mermaid (`graph LR` / `graph TD`) rendered by the mermaid integration in `astro.config.mjs`.

## Contributors

VETA is built by a small team of humans and AI assistants. Each contributor below has had a substantive role in shaping the codebase.

### Miles Burton

Founder, lead engineer, and product owner. Designed the platform's architecture, runs the production deployment, and reviews every change before merge. Contact: `mail@milesburton.com`.

### Claude (Anthropic)

AI pair programmer used for documentation, devcontainer infrastructure, refactoring, and test scaffolding. Frequent contributor to the docs site, the testing taxonomy, and incremental backend changes. Used via the Claude Code CLI inside the dev container.

### Codex (OpenAI)

AI assistant used for targeted code generation, particularly in the frontend Redux slices and React component layers. Used through the VS Code extension.

### GitHub Copilot

AI completion assistant used for inline code suggestions across both the backend Deno code and the frontend React/Vitest test files. Particularly useful for boilerplate test setup and Zod schema definitions.

### nVidia Spark (DeepSeek R1)

AI reasoning model used for architecture review, complex refactor planning, and reviewing risk-engine logic. Accessed via the nVidia Spark interface.

Each AI assistant's contributions are attributed in commit messages with a `Co-Authored-By` trailer. Humans retain final review authority on all merges to `main`.
