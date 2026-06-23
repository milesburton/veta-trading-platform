---
title: Disk monitor
description: Read-only host-disk gauge with /health (JSON) and /metrics (Prometheus) endpoints.
---

A small Python container that exposes host disk usage. Pure observer:
the container has the host filesystem mounted at `/host` **read-only**
and has no Docker socket access. Disk pressure is **alerted** via
Prometheus rules in [`observability/prometheus-rules.yml`](https://github.com/milesburton/veta-trading-platform/blob/main/observability/prometheus-rules.yml),
not via container-level state. Actual cleanup is handled out-of-band
by [`veta-host-prune.timer`](https://github.com/milesburton/veta-trading-platform/blob/main/scripts/homelab-systemd/veta-host-prune.timer)
on the server.

## Endpoints

```
GET http://localhost:8099/health
GET http://localhost:8099/metrics
```

### `/health`: JSON

Returns disk-usage stats. HTTP status reflects severity:

- **200** when disk < `WARN_PCT` (default 85%)
- **503** when disk ≥ `WARN_PCT`

Example body:

```json
{
  "status": "ok",
  "disk": {"total_gb": 260.0, "used_gb": 184.6, "free_gb": 63.3, "used_pct": 71.0},
  "warn_pct": 85,
  "ts": 1778795723
}
```

The 503 is the **signal**, not a failure of the monitor. Disk is high
and you should look. The container's docker healthcheck intentionally
does **not** call `/health` to avoid marking the container itself
unhealthy when the alert is correctly firing (see history: this was the
confusing UX fixed in [PR #236](https://github.com/milesburton/veta-trading-platform/pull/236)).
Instead the healthcheck calls `/metrics`, which always returns 200.

### `/metrics`: Prometheus exposition

Always returns 200 with four gauges:

```
disk_used_percent 71.0
disk_used_bytes 198130876416
disk_free_bytes 67891200000
disk_total_bytes 280123076416
```

Scraped by `lgtm-prometheus` and consumed by three alert rules:

- **DiskUsageHigh** (warn): `disk_used_percent > 80` for 5 m
- **DiskUsageCritical** (page): `disk_used_percent > 92` for 1 m
- **DiskMonitorDown** (warn): scrape failing for 5 m

## Configuration

| Env var | Default | Description |
| --- | --- | --- |
| `WARN_PCT` | `85` | Threshold above which `/health` returns 503 |
| `PORT` | `8099` | HTTP port |

## Security posture

- Runs as `65534:65534` (nobody)
- Host filesystem mounted **read-only** at `/host`
- Container has **no** Docker socket
- `read_only: true` rootfs with `tmpfs /tmp`
- `cap_drop: ALL`, `no-new-privileges:true`

## Source

- [`scripts/disk-monitor.py`](https://github.com/milesburton/veta-trading-platform/blob/main/scripts/disk-monitor.py): implementation
- [`compose.yml`](https://github.com/milesburton/veta-trading-platform/blob/main/compose.yml): `disk-monitor` service block
- [`observability/prometheus.yml`](https://github.com/milesburton/veta-trading-platform/blob/main/observability/prometheus.yml): scrape config
- [`observability/prometheus-rules.yml`](https://github.com/milesburton/veta-trading-platform/blob/main/observability/prometheus-rules.yml): alert rules
