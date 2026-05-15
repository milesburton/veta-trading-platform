---
title: k6 load testing
description: Synthetic load harness that drives orders through the full pipeline under four scenarios chosen to mimic real trading-day pressure.
---

Load scenarios live in [`k6/`](https://github.com/milesburton/veta-trading-platform/tree/main/k6). The harness runs as a one-shot Compose service. Pick a scenario via `K6_SCRIPT`, with `baseline-limit.js` the default:

```bash
# Default: small ramp on LIMIT only
docker compose --profile loadtest run --rm k6

# Mixed strategy mix at 50 VUs sustained
K6_SCRIPT=mixed-strategy.js \
  docker compose --profile loadtest run --rm k6

# Open-bell burst (zero to 200 VUs in 30s, hold 5min)
K6_SCRIPT=burst-open.js \
  docker compose --profile loadtest run --rm k6

# 30-minute soak at 25 VUs
K6_SCRIPT=soak.js \
  docker compose --profile loadtest run --rm k6

# Risk-engine pressure: weighted mix of well-under, just-under, at-limit, over-limit
K6_SCRIPT=risk-stress.js \
  docker compose --profile loadtest run --rm k6
```

## Why four scenarios

A single ramp tests one thing. Real trading platforms experience four
qualitatively different pressure profiles, and a system that handles
the average gracefully can still fall over on any of these. The
scenarios are arranged so that running all four exercises every
known failure mode the platform should withstand.

## Scenario reference

### `baseline-limit.js`: pipeline sanity check

Single algo (LIMIT), gentle ramp 1 to 50 VUs over 2.5 minutes. **Use this
to confirm the pipeline is up before running anything else.** Three
seconds of failure here means a deeper problem and any further test
will be misleading.

| Property | Value |
|---|---|
| Strategies | LIMIT only |
| Pattern | Ramp 1→5→10→25→50→0 over 2.5 min |
| Threshold | submit_ok rate > 95%, http p99 < 500ms |
| Output | `docs/site/src/data/loadtest/<date>.{json,csv}` |

### `mixed-strategy.js`: realistic algo mix

All nine algo strategies in flight simultaneously, weighted to mimic
buy-side trading distribution: 30% LIMIT, 20% TWAP, 15% VWAP, 12% POV,
8% Iceberg, 5% Sniper, 5% Arrival-Price, 3% Momentum, 2% IS. Ramps to
50 VUs and holds for 3 minutes.

| Property | Value |
|---|---|
| Strategies | All nine, weighted |
| Pattern | Ramp 1→20→50, hold 3min, drop |
| Threshold | submit_ok rate > 95%, http p99 < 800ms |
| What it tests | Cross-strategy contention on shared services (risk-engine, OMS, EMS) |

### `burst-open.js`: open-bell spike

Zero to 200 VUs in 30 seconds, sustained for 5 minutes, ramp back to
zero. Mimics the cohort of orders that hit a venue at 09:30 when the
market opens. Five strategies in roughly equal proportions.

| Property | Value |
|---|---|
| Strategies | LIMIT, TWAP, VWAP, POV, Iceberg (random) |
| Pattern | 0→200 VUs in 30s, hold 5min, ramp out |
| Threshold | submit_ok rate > 90%, http p95 < 2s |
| What it tests | Cold-cache behaviour, queue saturation, kafka backpressure under burst |

### `soak.js`: sustained load for memory leaks

Constant 25 VUs for 30 minutes (configurable via `SOAK_DURATION` and
`SOAK_VUS`). The aim is not peak performance, it is to surface slow
leaks: growing heap, unbounded caches, file-descriptor exhaustion.

| Property | Value |
|---|---|
| Strategies | LIMIT, TWAP, VWAP, POV (random) |
| Pattern | Constant 25 VUs for 30 min (default) |
| Threshold | submit_ok rate > 99%, http p99 < 1s, http_req_failed < 1% |
| What it tests | Memory, FD, connection leaks; supervisord stability |
| Tunable | `SOAK_DURATION=2h`, `SOAK_VUS=50` |

### `risk-stress.js`: risk-engine pressure

LIMIT orders only, but with quantity drawn from a weighted mix that
includes order sizes well under the limit, just under, at the limit,
just over, and way over. Exercises the OMS pre-trade limit check
(`max_order_qty: 10_000`) and the pre-trade risk-engine call.

| Property | Value |
|---|---|
| Strategies | LIMIT only |
| Quantity mix | 50% well-under (100), 30% just-under (9_500), 10% at-limit (10_000), 8% over (10_001), 2% way-over (50_000) |
| Pattern | Ramp 1→10→30, hold 2min |
| Threshold | submit_ok rate > 95% (counting both 202 accept and 422 risk-reject as "responsive") |
| What it tests | Risk-engine latency under pressure, OMS limit-check correctness, fail-closed semantics |

## What the harness measures

Each scenario writes:

1. **Per-iteration metrics to Prometheus** via [remote-write](https://grafana.com/docs/k6/latest/results-output/real-time/prometheus-remote-write/), so Grafana can render the run in real time on the **k6 Prometheus** dashboard (provisioned under Trading folder).
2. **A structured JSON summary** to `docs/site/src/data/loadtest/<date>-<run-label>.json`. The schema is identical across scenarios:

   ```json
   {
     "runLabel": "mixed-strategy",
     "runDate": "2026-05-08",
     "iterations": 12483,
     "failureRate": 0.0023,
     "stages": {
       "submitDurationMs": { "p50": 142, "p95": 612, "p99": 891, "max": 1240, "count": 12483 },
       "httpReqDurationMs": { "p50": 98, "p95": 420, "p99": 680, "max": 980, "count": 12483 }
     },
     "thresholdsBreached": []
   }
   ```

3. **A CSV summary** for spreadsheet-friendly comparison across runs.

The [Performance reference page](../../../reference/performance/) renders the most recent JSON; comparing across `<date>-<scenario>.json` files shows whether perf regressed.

## Reading the results

Three things matter:

1. **`thresholdsBreached`**: if non-empty, the run failed its own success criteria. Investigate before declaring the build healthy.
2. **`failureRate`**: submit_ok rate inverted. Anything above ~5% under sustained load is a real problem. Above 1% on the soak is a leak signal.
3. **`stages.submitDurationMs.p99`**: gateway-side perceived latency. Should track the journal's per-stage `submittedToFilled` p99 within a few hundred ms (the gap is gateway to risk-engine roundtrip).

When in doubt, open the **Order Pipeline (Traces)** dashboard while a run is in flight. The Sankey panel and per-stage latency lines tell the same story the JSON summary does, but live.

## Authentication

All load tests use a pre-issued admin token passed as the `K6_TOKEN`
env var. Obtain one via the OAuth flow against `localhost:5008`. A
future revision will move the OAuth dance into k6's `setup()` so the
sign-in path is also under load; until then, sign-in is exercised by
Playwright E2E rather than k6.

## Running locally vs against the homelab

Default `BASE_URL` points at `gateway:5011` inside the docker network,
which works when the trading stack and k6 share a compose project. To
hit a remote target:

```bash
BASE_URL=https://veta.example.com \
K6_TOKEN=<admin-access-token> \
K6_SCRIPT=mixed-strategy.js \
docker compose --profile loadtest run --rm k6
```

The k6 service has `cap_drop: ALL` and `no-new-privileges`, same
posture as the rest of the platform.

## What is intentionally not exercised

- **Real OAuth sign-in flow**: pre-shared token used; sign-in latency is in the Playwright E2E suite.
- **WebSocket order submission**: k6 only hits the `/load-test` HTTP endpoint, which queues to the same `orders.new` Kafka topic as a WebSocket-submitted order, so the downstream pipeline is identical. The WebSocket-frame parsing is exercised by Playwright.
- **Realistic order placement timing**: load-test endpoint accepts 1 order per HTTP request; real users submit at ~1/sec at peak. The harness is denser than reality on purpose, to find ceilings.
- **Cross-region failover**: single-region only.
