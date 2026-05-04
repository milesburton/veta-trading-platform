# k6 Load Tests

[![CI](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)

This directory contains load-testing scenarios for the VETA pipeline using k6.
Tests run in Docker, send traffic through the gateway, and export percentile
metrics to Prometheus for visualisation in Grafana.

## Included scenarios

- `baseline-limit.js` ramps from 1 to 50 VUs over approximately 2.5 minutes.
- Each VU submits `POST /load-test` with `orderCount: 1` per iteration.
- The scenario records `veta_loadtest_submit_duration_ms` (Trend),
  `veta_loadtest_submit_ok` (Rate), and standard k6 HTTP metrics.

## Prerequisites

1. **Trading stack running**: `docker compose up -d`
2. **LGTM observability stack running** (for live dashboard):
   `docker compose -f observability/docker-compose.lgtm.yml up -d`
3. **Admin token in `K6_TOKEN`**: this scenario currently uses a pre-issued
   token instead of running OAuth per VU.

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

A future revision can move this into k6 `setup()` to perform OAuth directly.

## Execution

```bash
docker compose --profile loadtest run --rm k6
```

The container reads `K6_TOKEN` and `BASE_URL` from host environment variables,
streams metrics to Prometheus, and prints a summary at completion.

## Live results

Open Grafana at <http://localhost:3000> during or after execution.
The `k6 Prometheus` dashboard is available in the `Trading` folder and updates
every five seconds during active runs.

## Targeting other environments

```bash
BASE_URL=https://veta-trading.fly.dev/api/gateway \
  docker compose --profile loadtest run --rm k6
```

Use a token issued by the target environment's user-service.

## Ramp tuning

Adjust `options.scenarios.ramp.stages` in `baseline-limit.js`.
The default profile is conservative. For stress tests, increase stage targets
and durations. Refer to the k6 [executor docs](https://k6.io/docs/using-k6/scenarios/executors/)
for alternatives such as `constant-arrival-rate` when fixed RPS is required.

## Scope

Measures:

- Gateway HTTP RTT for the `/load-test` POST (request → 202)
- Gateway throughput in requests/sec
- Error rate

Does not measure:

- End-to-end pipeline latency (submit → fill). For that, hit
  `journal /metrics/latency?windowMs=N` separately or use the existing
  `deno task test:load`.
- Per-strategy behaviour (TWAP/VWAP/POV slice timing). Each strategy
  gets its own k6 script eventually.
- WebSocket order submission. A future scenario can exercise the same path used
  by interactive clients.

## Troubleshooting

- **"K6_TOKEN env var is required"**: set the variable before execution.
  The script fails fast in `setup()` to avoid running against repeated 401 responses.
- **Gateway returns 503 "Bus unavailable"**: Redpanda is not healthy yet.
  Wait approximately 30 seconds after `compose up` and retry.
- **No data in Grafana** — confirm LGTM stack is up
  (`docker ps | grep lgtm-prometheus`) and that Prometheus is reachable
  at `http://localhost:9090` from the host.
- **k6 reports "moduleSpecifier ... could not be found"**: Docker Desktop on
  WSL can cache stale bind-mount paths. Restart Docker Desktop
  (or run `wsl --shutdown` and start it again). Verify with
  `docker run --rm -v $(pwd)/k6:/k6 --entrypoint=ls grafana/k6:0.55.0 -la /k6`
  and confirm `baseline-limit.js` is present.
