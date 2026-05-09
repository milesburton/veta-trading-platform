# Continuous load generator

A binary on/off load generator for the homelab. Two background containers
push synthetic order traffic at the gateway: a steady soak (~50 VUs constant)
and a matrix loop (cycles `baseline-limit → mixed-strategy → burst-open →
risk-stress` forever). A token-refresh sidecar handles OAuth rotation so
nothing expires.

## Prerequisites

- The stack already deployed (`/opt/stacks/veta/compose.yml` etc.)
- An admin user available via OAuth — by default `admin` / `OAUTH2_SHARED_SECRET`
  from the user-service env. If that's still the dev default, change it before
  exposing the homelab to anything untrusted.

## One-time setup

On the homelab:

```bash
# 1. Drop the credentials file in the stack dir (mode 600)
cat <<'EOF' | sudo tee /opt/stacks/veta/.env.loadgen >/dev/null
LOADGEN_OAUTH_PASSWORD=<the OAUTH2_SHARED_SECRET from compose.prod.yml>
# Optional tuning — defaults shown:
# LOADGEN_OAUTH_USERNAME=admin
# LOADGEN_SOAK_VUS=50
# LOADGEN_SOAK_DURATION=50m
# LOADGEN_MATRIX_SLEEP=30
# LOADGEN_MATRIX_SCENARIOS="baseline-limit.js mixed-strategy.js burst-open.js risk-stress.js"
EOF
sudo chmod 600 /opt/stacks/veta/.env.loadgen
sudo chown miles:miles /opt/stacks/veta/.env.loadgen
```

Once SOPS lands (follow-up PR), `.env.loadgen` is replaced by an entry in
`secrets/homelab.enc.yaml` and gets decrypted at deploy time.

## Daily use

```bash
# Switch on
ssh miles@homelab '/opt/stacks/veta/scripts/load.sh on'

# Check it's running
ssh miles@homelab '/opt/stacks/veta/scripts/load.sh status'

# Tail logs (Ctrl-C to stop tailing)
ssh miles@homelab '/opt/stacks/veta/scripts/load.sh logs'

# Switch off
ssh miles@homelab '/opt/stacks/veta/scripts/load.sh off'
```

## What's running when it's on

| Container | What it does |
|---|---|
| `loadgen-token` | OAuth PKCE every 50 min, writes token to a shared volume |
| `loadgen-soak` | k6 running `soak.js` at `LOADGEN_SOAK_VUS` constantly |
| `loadgen-matrix` | k6 running each scenario back-to-back, sleep `LOADGEN_MATRIX_SLEEP`s, repeat |

All three have `restart: unless-stopped`, so they survive reboots **once
you've turned them on**. `load.sh off` removes the containers (so they don't
auto-restart).

## Tuning load intensity

The defaults are "Hard continuous" — soak at 50 VUs, matrix scenarios at their
existing per-script VU counts (which range up to 200 during burst-open
ramps). If you want more pressure:

- Soak: bump `LOADGEN_SOAK_VUS` (linear effect).
- Matrix: add scenarios to `LOADGEN_MATRIX_SCENARIOS`, or shorten
  `LOADGEN_MATRIX_SLEEP` (default 30s rest between scenarios).

If you want less:

- Set `LOADGEN_SOAK_VUS=10`.
- Drop scenarios from `LOADGEN_MATRIX_SCENARIOS` — keeping just
  `baseline-limit.js mixed-strategy.js` runs at low intensity (max ~50 VUs).

## How to tell it's working

- `load.sh status` shows three containers `Up`.
- `load.sh logs` shows `[token-refresh]`, `[soak]`, and `[matrix]` lines.
- Grafana → Service Performance (OTel) → "Request rate by service" shows
  `gateway` at sustained 50+ req/s.
- Grafana → Order Pipeline (Traces) → "Submitted" stat ≥ 50/s.

## Side effects

- **Rate limiting is disabled on the gateway** while loadgen is running
  (`compose.loadgen.yml` overrides `RATE_LIMIT_ENABLED=false`). Turning loadgen
  off removes that override on next `docker compose up` of gateway.
- **Synthetic orders use existing demo users** (`alice`, `amelia`, `bob`,
  `dave`) — the `/load-test` endpoint maps requests onto these.
- **Postgres + Redpanda usage rises** proportionally. Watch disk on the homelab
  if you leave it on for days.
