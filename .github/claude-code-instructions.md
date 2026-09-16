# Claude Code review and development instructions for VETA Trading Platform

This file calibrates Claude Code (via claude.ai and Claude Code CLI) to this repo's
conventions and to align with Copilot's review approach. It prevents review conflicts
and duplicated feedback by setting clear expectations for both human-authored and
AI-assisted work.

## Alignment with existing tooling

- Follow the **same style and architecture rules** documented in
  [Contributing](https://milesburton.github.io/veta-trading-platform/development/contributing/)
  and `.github/copilot-instructions.md`.
- **Do not flag issues that Copilot already covers** (em-dashes, comments, ASCII
  diagrams, commit message format, etc.) unless a genuinely new violation appears.
- **Coordinate on correctness issues**: Silent-fallthrough validation gaps and
  partial status checks on external APIs are high-value findings. Raise these
  in code review or during implementation.

## PR and code review discipline

- **No duplicate reviews**: If Copilot has already reviewed a PR, do not re-run
  a separate review unless asked to assess a specific concern or incorporate feedback.
- **Scope PRs tightly**: Include only changes necessary for the stated goal. Revert
  unrelated lockfile updates, generated files, or tooling changes unless they
  directly address the task.
- **Address feedback before calling done**: When Copilot or a human reviewer flags
  an issue, fix it in the same commit (amend) before pushing. Do not leave review
  comments unaddressed.
- **Prefer evidence over opinion**: If a fix is questioned, run the test suite or
  smoke-test the feature before defending the change.

## Pre-commit hooks and testing

- The pre-commit hook runs `deno task check` and unit tests. If it regenerates
  lockfiles or test-inventory.json, these changes are expected and should be staged.
- When amending a commit after review feedback, re-run pre-commit: it ensures
  consistency and catches new issues.
- Do not disable pre-commit hooks (`git commit --no-verify`) to force a merge.
  Investigate and fix the root cause instead.

## What to focus on during implementation

1. **Functional correctness**: Does the code do what it claims? Run smoke tests
   after every change.
2. **Error handling**: Are failures visible in logs? Can the service recover?
3. **Type safety**: Use Zod at I/O boundaries; trust internal module contracts.
4. **Resource lifecycle**: Do timers get cleaned up? Are promises handled?
   (Common issues: dangling setInterval, missing await, unhandled rejections.)

## Known issues and edge cases

See `MEMORY.md` in this project for a running log of:
- Incidents and their root causes (e.g., OOM loops, CI flakes, network timeouts).
- Systemic issues that recur (e.g., homelab CI runner oversubscription).
- Architectural constraints and workarounds (e.g., single-file bind mount staleness).

Before implementing a fix, check the memory to avoid re-solving a known problem
with a suboptimal approach.

## Communication

When in doubt:
- **Ask the user first** on risky operations (force-push, destructive deletes, production changes).
- **Default to British English** in all prose and user-facing text.
- **No em-dashes** anywhere—use commas, periods, or restructure.
- **Keep commit messages concise** (under 100 characters in the summary line).
  Use the body for context and justification, not marketing copy.
