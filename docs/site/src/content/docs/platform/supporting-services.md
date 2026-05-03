---
title: Supporting Services
description: Observability, ingress, load testing and infrastructure that surrounds the trading pipeline.
---

The [Service Map](../services/) catalogues the trading pipeline itself —
market-sim, OMS, EMS, algos, journal, FIX, and the analytics services. This
page covers the supporting infrastructure: how the platform is observed, how
ingress is routed, how it is load-tested, and the operational utilities that
keep it running.

## Observability stack (LGTM)

A separate Compose stack at `observability/docker-compose.lgtm.yml` provides
metrics, logs and traces. It is independent of the trading stack and can run
on the same host or be pointed at a remote one.

| Container | Image | Port | Role |
|-----------|-------|------|------|
| `lgtm-grafana` | `grafana/grafana:11.4.0` | 3000 | Dashboards, alerting, datasource UI |
| `lgtm-prometheus` | `prom/prometheus:v3.1.0` | 9090 | Time-series metrics; remote-write enabled |
| `lgtm-loki` | `grafana/loki:3.3.2` | 3100 | Log aggregation |
| `lgtm-tempo` | `grafana/tempo:2.7.1` | 3200 / 4319 | Distributed traces |
| `lgtm-alloy` | `grafana/alloy:v1.7.0` | 12345 | Log + metric collector; tails service stdout |

Grafana is provisioned with the three datasources and a `Trading` folder
containing both the project-specific dashboard and the official k6
Prometheus dashboard.

```bash
docker compose -f observability/docker-compose.lgtm.yml up -d
```

Open `http://localhost:3000` once the stack is up. Anonymous read access is
enabled for local development; production deployments should add auth.

## kafka-relay (port 5007)

A small Deno service that subscribes to every Redpanda topic the platform
emits and forwards each event as a JSON line to stdout. Grafana Alloy tails
those lines and ships them to Loki, giving Grafana a unified log search
across the entire trading pipeline.

The relay also exposes `POST /events/batch` for the frontend. The browser's
[error transport middleware](https://github.com/milesburton/veta-trading-platform/blob/main/frontend/src/store/middleware/errorTransportMiddleware.ts)
posts uncaught errors here, so client-side failures show up in Loki
alongside backend events.

## Traefik (port 80, dashboard 8888)

Ingress proxy. Routes are declared via Docker labels on each service:
`/api/<service>/...` is dispatched by `PathPrefix` rules to the matching
backend container. Traefik does **not** match on `Host` headers, so any
hostname or IP that resolves to the host works.

In UAT, Let's Encrypt is the cert resolver (the `ACME_EMAIL` env var must
be set). On Fly.io, TLS terminates at the Fly edge and Traefik runs in
plain-HTTP mode. Locally, no TLS is needed.

The dashboard is exposed at `http://<host>:8888/dashboard/` and is included
in the Service Health panel only on `local` and `uat` deployments.

## k6 load testing

Load scenarios live in [`k6/`](https://github.com/milesburton/veta-trading-platform/tree/main/k6).
The harness runs as a one-shot Compose service:

```bash
docker compose --profile loadtest run --rm k6
```

Each scenario writes per-iteration metrics to Prometheus via remote-write
and a structured JSON + CSV summary to
`docs/site/src/data/loadtest/<date>.{json,csv}`. The
[Performance reference page](../../reference/performance/) renders the most
recent dataset; future runs append new dated files.

Authentication currently uses a pre-issued admin token passed as the
`K6_TOKEN` env var. A future revision can move OAuth into k6's `setup()`
to exercise the full sign-in path under load.

## Disk monitor (port 8099)

A small Python container that exposes `/health` reporting host disk usage,
auto-prunes dangling Docker images when disk crosses `PRUNE_PCT` (default
90%), and returns 503 when usage crosses `WARN_PCT` (default 85%). Useful
for Uptime Kuma checks and as a guard against image accumulation on
long-running deployments.

Mounted at `/host` read-only inside the container so it sees the host
filesystem rather than the container's overlay.

## db-migrate (run-once)

Applies SQL migrations from `backend/db/migrations/` to the Postgres
instance on container start, then exits. Idempotent: every migration uses
`CREATE TABLE IF NOT EXISTS` / `ON CONFLICT DO NOTHING` patterns and is
recorded in `public.schema_migrations`.

The other services that depend on Postgres (`oms`, `journal`, `user-service`)
declare `depends_on: db-migrate: condition: service_completed_successfully`,
so they wait for migrations before starting.

## Redpanda console (optional)

`redpanda-console` (Apache Kafka UI) ships with the Compose stack as an
optional debugging aid. It exposes `:8080` and provides a topic browser,
consumer-group inspector, and live message tail. Useful for confirming
event flow during integration debugging; not required for the platform to
run.

## Watchtower (UAT only)

The internal UAT deployment runs `containrrr/watchtower` in
label-enable mode. Containers tagged with
`com.centurylinklabs.watchtower.enable=true` are pulled and restarted
automatically when CI publishes a new `:latest` image to GHCR — typically
within five minutes of a merge to `main`.

## flyctl (dev container)

The dev container ships with `flyctl` preinstalled at a pinned version
(`FLYCTL_VERSION` in `.devcontainer/Dockerfile`). The host's `~/.fly`
directory is bind-mounted into the container so that `flyctl auth login`
on the host persists across container rebuilds — no need to reauthenticate
per session.

`post-start.sh` reports the current auth status on container start and
warns if the runtime `flyctl` differs from the version baked into the
image (usually because a host-installed binary is shadowing the system
one).

See the [Fly auth docs](https://fly.io/docs/flyctl/auth-login/) for first-time
setup. Once authenticated on the host, the dev container picks the credentials
up automatically.

## Where to run what

| Environment | Trading stack | LGTM stack | k6 | Watchtower |
|-------------|---------------|-----------|----|-----------|
| `local` (devcontainer) | yes | optional | optional | no |
| `uat` (private VM) | yes | yes | manual | yes |
| `fly` (public demo) | monolith | no | manual against URL | no |

LGTM and k6 are deliberately optional locally — they add real overhead and
the platform runs fine without them. Bring them up when you are
investigating performance, debugging event flow, or generating data for
the performance docs.
