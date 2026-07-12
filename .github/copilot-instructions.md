# Copilot review instructions for VETA Trading Platform

This file calibrates GitHub Copilot's automated PR review to this repo's
existing, documented conventions. Full detail: [Contributing](https://milesburton.github.io/veta-trading-platform/development/contributing/).

## Style rules already enforced, do not flag these as new findings

- No em-dashes (`—`) anywhere in code, comments, docs, or commit messages.
  Use commas, periods, or restructure the sentence.
- No inline or block comments in application code. The codebase is meant
  to be self-documenting through naming and structure. Exceptions:
  `biome-ignore`, `eslint-disable`, and comments explaining a genuinely
  non-obvious constraint (a workaround, a subtle invariant) are fine.
- British English spelling and grammar in docs and user-facing text.
- No ASCII-art diagrams in docs. Use mermaid (`graph LR` / `graph TD`).
- Commit messages follow Conventional Commits:
  `<type>(optional scope): <description>`, enforced by
  `.husky/commit-msg`. Types: feat, fix, docs, style, refactor, perf,
  test, chore, build, ci, revert.

## Architecture conventions

- TypeScript everywhere: Deno for backend, Vite/React for frontend.
- Functional style preferred: pure functions with explicit inputs and
  outputs over mutable module-level state.
- Shared types live in `backend/src/types/`, shared backend utilities in
  `backend/src/lib/`, shared frontend utilities in `frontend/src/utils/`.
- Use import map aliases (`@veta/http`, `@veta/messaging`,
  `@veta/types/orders`, etc.) instead of relative paths like
  `../../lib/http.ts`.
- Runtime validation (Zod) belongs at I/O boundaries: HTTP handlers,
  Kafka consumers, external API responses. Not on internal function
  calls between trusted modules.

## What IS worth flagging

Findings that catch real correctness bugs are valuable and should keep
coming. Two classes worth extra attention in this repo, both from
findings that were confirmed and fixed:

- **Silent-fallthrough validation gaps**: a range or bound accepted from
  a request body but not checked for degenerate values (zero-width
  range, negative, non-finite, exceeding what a downstream
  RNG/loop/allocation can handle). Look for the difference between "the
  field is present" and "the field is a value the code downstream can
  actually handle."
- **Partial status checks on external API responses**: code that checks
  a `status`/`state` field but not the accompanying `conclusion`/
  `outcome`/`result` field, treating "finished" as equivalent to
  "succeeded." This is easy to get wrong when polling GitHub Actions
  check-runs, CI status APIs, or any async job status endpoint.

## Known non-issues

- Deploy/CI scripts in `scripts/homelab-*.sh` intentionally poll GitHub's
  public REST API without authentication for a public repo. This is not
  a missing-auth bug.
- `secureRandomInt`/`secureRandomFloat` helpers in
  `backend/src/gateway/routes/admin.ts` are explicitly non-cryptographic
  simulation randomness for synthetic load-test order generation, not
  security-sensitive. They are commented as such at the point of
  definition; do not flag them as needing a CSPRNG upgrade.
