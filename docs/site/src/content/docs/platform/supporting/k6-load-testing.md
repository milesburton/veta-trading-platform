---
title: k6 load testing
description: Synthetic load harness that drives orders through the full pipeline.
---

Load scenarios live in [`k6/`](https://github.com/milesburton/veta-trading-platform/tree/main/k6). The harness runs as a one-shot Compose service:

```bash
docker compose --profile loadtest run --rm k6
```

## What it measures

Each scenario writes per-iteration metrics to Prometheus via remote-write (so Grafana can render them in real time) and a structured JSON + CSV summary to `docs/site/src/data/loadtest/<date>.{json,csv}`. The [Performance reference page](../../../reference/performance/) renders the most recent dataset; future runs append new dated files.

## Authentication

Load tests currently use a pre-issued admin token passed as the `K6_TOKEN` env var. A future revision can move the OAuth flow into k6's `setup()` to exercise the full sign-in path under load — until then, the auth path is exercised by Playwright E2E rather than by k6.
