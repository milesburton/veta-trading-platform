---
title: Continuous load generator
description: Always-on synthetic trade flow on the homelab. Two k6 runners (soak + matrix) plus a token-refresh sidecar. Distinct from the on-demand k6 harness.
---

`load.sh on` brings up three containers on the homelab:

- **`loadgen-soak`** — k6 with a steady ~50 VUs, restarts every 50 min to
  pick up rotated tokens
- **`loadgen-matrix`** — k6 cycling through `baseline-limit → mixed-strategy
  → burst-open → risk-stress` on a loop
- **`loadgen-token`** — alpine sidecar doing OAuth PKCE every 50 min and
  writing the access token to a shared volume

This is the *continuous* load generator. For the on-demand harness (single
runs against local dev) see [k6 load testing](./k6-load-testing).

## What it's for

Demonstrates how the platform behaves under near-real-world trade flow.
Useful for:

- Live demos: visitors land on `veta.mnetcs.com` and see real orders moving
  through the pipeline, real fills, real candles updating
- Performance baselines: k6 percentile metrics ship to Prometheus
- Surfacing regressions: if a deploy slows order acks below baseline,
  the trend on the Grafana dashboard shifts visibly

It is **not** a substitute for the [synthetic probe](./synthetic-probe) —
loadgen tests throughput, not liveness.

## One-time setup

```bash
# On the homelab, drop the credentials file (mode 600)
ssh miles@192.168.1.245
ADMIN_PW=$(sudo grep ^OAUTH2_USER_SECRETS /opt/stacks/veta/.env \
  | head -1 | cut -d= -f2- | tr ';' '\n' | grep ^admin: | cut -d: -f2-)
echo "LOADGEN_OAUTH_PASSWORD=$ADMIN_PW" | sudo tee /opt/stacks/veta/.env.loadgen
sudo chmod 600 /opt/stacks/veta/.env.loadgen
sudo chown miles:miles /opt/stacks/veta/.env.loadgen
```

The password is read from `OAUTH2_USER_SECRETS` (per-user) for the `admin`
account, **not** from `OAUTH2_SHARED_SECRET`. The two diverged in 2026-05
and loadgen broke for 5 days before this was figured out — see the history
note below.

Optional tuning vars in the same file:

| Env | Default | Effect |
|---|---|---|
| `LOADGEN_OAUTH_USERNAME` | `admin` | Which user the load runs as |
| `LOADGEN_SOAK_VUS` | `50` | Steady VUs on soak |
| `LOADGEN_SOAK_DURATION` | `50m` | Soak iteration length before token refresh |
| `LOADGEN_MATRIX_SLEEP` | `30` | Pause (seconds) between matrix iterations |
| `LOADGEN_MATRIX_SCENARIOS` | `baseline-limit.js mixed-strategy.js burst-open.js risk-stress.js` | Scripts the matrix cycles through |

## Daily use

```bash
# Switch on (requires .env.loadgen present)
ssh miles@homelab '/opt/stacks/veta/scripts/load.sh on'

# Check it's running
ssh miles@homelab '/opt/stacks/veta/scripts/load.sh status'

# Tail logs
ssh miles@homelab '/opt/stacks/veta/scripts/load.sh logs'

# Switch off
ssh miles@homelab '/opt/stacks/veta/scripts/load.sh off'
```

## Auto-start on every deploy

`scripts/homelab-deploy.sh` includes `compose.loadgen.yml` whenever
`.env.loadgen` exists on the homelab. So every auto-pull tick brings
loadgen up automatically — there's no "loadgen was off, then a deploy
re-started it" surprise.

Removing loadgen permanently: delete `/opt/stacks/veta/.env.loadgen`.

## History note

The first loadgen install hard-coded `LOADGEN_OAUTH_PASSWORD` to the value
of `OAUTH2_SHARED_SECRET`. When `OAUTH2_USER_SECRETS` was added in 2026-05
(per-user passwords), `admin` got its own secret — and `verifyOAuthCredentials`
in user-service prefers the per-user secret over the shared one when a user
is in the map. Loadgen was sending the wrong password and getting 401, which
the gateway logged as `auth_failure` ~1,100 lines/sec, contributing to the
2026-05-14 disk-fill incident.

Fix landed in PR #234's gateway log-throttle + a one-off `.env.loadgen`
rotation on the homelab. The post-fix install command above extracts the
correct per-user password automatically.

## Source

- [`compose.loadgen.yml`](https://github.com/milesburton/veta-trading-platform/blob/main/compose.loadgen.yml) — k6 + token-refresh service definitions
- [`scripts/load.sh`](https://github.com/milesburton/veta-trading-platform/blob/main/scripts/load.sh) — on/off/status/logs wrapper
- [`scripts/loadgen/`](https://github.com/milesburton/veta-trading-platform/tree/main/scripts/loadgen) — token-refresh + loop scripts

## Related

- [k6 load testing](./k6-load-testing) — on-demand harness for single runs
- [Synthetic probe](./synthetic-probe) — liveness check, not throughput
- [Performance](../../reference/performance) — Grafana percentile baselines that loadgen feeds
