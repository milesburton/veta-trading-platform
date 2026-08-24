# Incident: `docker compose up -d` without the full file chain fails to recreate any synthetic-trader container

- **Started**: 2026-08-24, discovered during a planned change (enabling two synthetic-trader desks).
- **Resolved**: 2026-08-24, same session, within minutes of discovery.
- **MTTR**: under 10 minutes from first failure to a working recreate.
- **User-visible impact**: none. All affected containers kept running on their prior image throughout; nothing was down. Caught before it could cause an outage, not because of one.
- **Detection**: incidental, while enabling `synthetic-trader-fx-electronic` and `synthetic-trader-fx-high-touch` for the first time.
- **Severity**: SEV3 (near-miss / latent deploy-process gap, no impact)

## What happened

Running `docker compose up -d --no-deps --no-build <service>` by hand on the homelab, using only the default `compose.yml`, failed for both target services with `Error response from daemon: No such image: veta-synthetic-trader-fx-high-touch:latest` — a synthetic, auto-generated image name, not the real one. The same command against `synthetic-trader-fx-electronic` alone failed identically. Neither container was recreated; both kept running on their existing (older) image, so there was no outage, just a blocked change.

## Root cause

The project's actual image reference for every synthetic-trader service is set in `compose.prod.yml` (`image: ghcr.io/milesburton/veta-trading-platform/synthetic-trader:latest`, with `build: !reset null` explicitly clearing the base file's build directive). `compose.yml` alone still carries a `build:` block pointing at a local Dockerfile context that no longer exists on this host (`docker/base`). Docker Compose only merges in `compose.prod.yml` when it's explicitly passed with `-f`; invoked with the bare `docker compose ...` (no `-f` flags, and no `COMPOSE_FILE` environment variable set to supply a default chain), Compose falls back to `compose.yml` alone, sees an unresolvable local build context, and defaults to looking for a project-scoped image name that was never built.

`deploy.sh`, the project's actual deploy path, always invokes Compose with the full chain (`-f compose.yml -f compose.prod.yml -f compose.observability.yml`, plus `-f compose.loadgen.yml` conditionally) and has never hit this — the gap only surfaces for anyone running a bare `docker compose` command by hand outside that script, which is exactly what happened here.

## Fix

Reran the recreate using the same file chain `deploy.sh` uses (`docker compose -f compose.yml -f compose.prod.yml -f compose.observability.yml up -d --no-build --no-deps <service>`). Both containers recreated and started cleanly on the correct image.

## Action items

- [ ] Set `COMPOSE_FILE=compose.yml:compose.prod.yml:compose.observability.yml` in `/opt/stacks/veta/.env` on the homelab, so a bare `docker compose` invocation resolves the same way `deploy.sh` does by default, rather than silently falling back to a broken local build context.
- [ ] Consider whether `compose.yml`'s base `build:` block should be removed or made a no-op by default, given the actual local Dockerfile context it references no longer exists on this host — the override in `compose.prod.yml` is the only thing currently preventing this from being a live footgun.
- [ ] Note the correct manual-recreate command (with the full `-f` chain) in the homelab runbook, for anyone who needs to touch a single service outside a full `deploy.sh` run.

## Related

- Discovered while enabling `synthetic-trader-fx-electronic` and `synthetic-trader-fx-high-touch` to expand synthetic order flow beyond the single previously-enabled desk.
- No postmortem: impact threshold (MTTR > 30 min or user-visible impact > 5 min) not met.
