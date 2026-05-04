---
title: Disk monitor
description: Auto-pruning host-disk watcher used by Uptime Kuma.
---

A small Python container that exposes `/health` reporting host disk usage. It auto-prunes dangling Docker images when disk crosses `PRUNE_PCT` (default 90%), and returns 503 when usage crosses `WARN_PCT` (default 85%). Useful for Uptime Kuma checks and as a guard against image accumulation on long-running deployments.

The host filesystem is mounted at `/host` **read-only** inside the container, so it can read disk stats but cannot mutate the host. Image pruning runs against the Docker socket and is the only privileged operation.

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `WARN_PCT` | `85` | Disk-usage threshold above which `/health` returns 503 |
| `PRUNE_PCT` | `90` | Disk-usage threshold above which dangling images are pruned |

## Endpoint

```
GET http://localhost:8099/health
```

Returns either `{ "status": "ok", "diskPct": 67 }` or HTTP 503 with the same payload when usage is above `WARN_PCT`.
