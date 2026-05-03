# k6 load tests

Real-traffic load testing against the VETA pipeline. Runs as a docker
container, drives load via the gateway, and streams percentile metrics
to Prometheus for live visualisation in Grafana.

## What's here

- `baseline-limit.js` — ramps 1 → 50 VUs over ~2.5 min, each VU calls
  `POST /load-test` with `orderCount: 1` per iteration. Captures
  `veta_loadtest_submit_duration_ms` (Trend) and `veta_loadtest_submit_ok`
  (Rate) plus the standard k6 HTTP metrics.

## Prerequisites

1. **Trading stack running**: `docker compose up -d`
2. **LGTM observability stack running** (for live dashboard):
   `docker compose -f observability/docker-compose.lgtm.yml up -d`
3. **Admin token in `K6_TOKEN`**: this v1 uses a baked-in token rather
   than running the OAuth flow per VU. Get one with:

   ```bash
   # In a terminal that has 1Password CLI / similar set up:
   K6_TOKEN=$(curl -s -X POST http://localhost:5008/oauth/authorize \
     -H 'Content-Type: application/json' \
     -d '{
       "client_id": "veta-automation",
       "username": "admin",
       "password": "veta-dev-passcode",
       "redirect_uri": "postmessage",
       "response_type": "code",
       "scope": "openid profile",
       "code_challenge": "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
       "code_challenge_method": "S256"
     }' | jq -r .code)
   # Then exchange the code at /oauth/token (verifier matches challenge):
   K6_TOKEN=$(curl -s -X POST http://localhost:5008/oauth/token \
     -H 'Content-Type: application/x-www-form-urlencoded' \
     -d "grant_type=authorization_code&client_id=veta-automation&code=$K6_TOKEN&code_verifier=ye1zubtt76q3iijhbc5sjphtv9wbvf9oqzhlf38o3oo&redirect_uri=postmessage" \
     | jq -r .access_token)
   export K6_TOKEN
   ```

   v2 will replace this with k6 doing the OAuth dance itself in `setup()`.

## Run it

```bash
docker compose --profile loadtest run --rm k6
```

That's it. The container reads `K6_TOKEN` and `BASE_URL` from the host env,
streams metrics to Prometheus, and prints summary stats at the end.

## View live results

While k6 is running (and after), open Grafana at <http://localhost:3000>.
The dashboard "k6 Prometheus" lives in the **Trading** folder. It updates
every 5 s during a run.

## Targeting other environments

```bash
BASE_URL=https://veta-trading.fly.dev/api/gateway \
  docker compose --profile loadtest run --rm k6
```

(You'll need a token issued by that environment's user-service.)

## Tuning the ramp

Edit `baseline-limit.js` `options.scenarios.ramp.stages`. Default ramps
to 50 VUs over 2.5 min; that's gentle. To stress-test, swap in higher
targets and longer durations. k6 [executor docs](https://k6.io/docs/using-k6/scenarios/executors/)
explain the alternatives (constant-arrival-rate is what you want for
"keep RPS at exactly N").

## What this measures vs. doesn't

**Measures**:
- Gateway HTTP RTT for the `/load-test` POST (request → 202)
- Gateway throughput in requests/sec
- Error rate

**Does not measure**:
- End-to-end pipeline latency (submit → fill). For that, hit
  `journal /metrics/latency?windowMs=N` separately or use the existing
  `deno task test:load`.
- Per-strategy behaviour (TWAP/VWAP/POV slice timing). Each strategy
  gets its own k6 script eventually.
- WebSocket order submission. v2 will add a WS scenario that exercises
  the path real GUI clients use.

## Troubleshooting

- **"K6_TOKEN env var is required"** — set it (see above). The script
  fails fast in `setup()` rather than running an entire test against
  401s.
- **Gateway returns 503 "Bus unavailable"** — Redpanda isn't healthy
  yet; wait 30s after `compose up` then retry.
- **No data in Grafana** — confirm LGTM stack is up
  (`docker ps | grep lgtm-prometheus`) and that Prometheus is reachable
  at `http://localhost:9090` from the host.
- **k6 reports "moduleSpecifier ... couldn't be found"** — Docker Desktop on
  WSL occasionally caches stale bind-mount paths. Restart Docker Desktop
  (or run `wsl --shutdown` then start it again). Verify with
  `docker run --rm -v $(pwd)/k6:/k6 --entrypoint=ls grafana/k6:0.55.0 -la /k6`
  — should list `baseline-limit.js`, not be empty.
