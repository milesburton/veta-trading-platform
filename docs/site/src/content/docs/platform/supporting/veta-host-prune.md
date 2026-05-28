---
title: veta-host-prune (Docker prune timer)
description: Daily systemd timer that prunes dangling Docker images, exited containers, and build cache. Prevents homelab disk fill from auto-pull churn.
---

The homelab pulls a new `:latest` image per service on every CI build.
Over a few weeks that adds up to hundreds of dangling images, easily 50 to
60 GB of accumulated layers. The 2026-05-14 disk-fill incident was triggered
by *log* growth, but the *image* churn was the next-largest disk
consumer and would have hit 100% on its own within a couple more weeks.

`veta-host-prune` runs daily at 04:00 UTC and prunes:

1. **Always**: dangling images, exited containers, and build cache older
   than 24h. Preventive.
2. **If disk ≥ `THRESHOLD_PCT` (default 90%)**: also prune *all*
   untagged images and the full builder cache. Emergency mode.

## Install (one-time, on the homelab)

```bash
# Install the systemd unit + timer
sudo install -m 0644 \
  /path/to/repo/scripts/homelab-systemd/veta-host-prune.service \
  /etc/systemd/system/
sudo install -m 0644 \
  /path/to/repo/scripts/homelab-systemd/veta-host-prune.timer \
  /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable --now veta-host-prune.timer
```

The script itself lives at `/opt/stacks/veta/scripts/host-prune.sh` and
is rsynced in by `homelab-deploy.sh` (the `scripts/` directory is in its
`CONFIG_PATHS`).

## Daily use

```bash
# When does it next run?
systemctl list-timers veta-host-prune.timer

# Run it manually right now
sudo systemctl start veta-host-prune.service

# See what it did last time
journalctl -u veta-host-prune.service -n 50 --no-pager
```

## Tunables (via systemd Environment= or script env)

| Env | Default | Effect |
|---|---|---|
| `THRESHOLD_PCT` | `90` | Disk-used % above which aggressive prune triggers |
| `PRUNE_AGE` | `24h` | Age filter for the always-on preventive prune |

## Reconciling with Prometheus disk alerts

The disk-pressure alert rules in
[`observability/prometheus-rules.yml`](https://github.com/milesburton/veta-trading-platform/blob/main/observability/prometheus-rules.yml)
fire at:

- `DiskUsageHigh`: `disk_used_percent > 80%` for 5 min (warning)
- `DiskUsageCritical`: `disk_used_percent > 92%` for 1 min (page)

These are **independent** of `veta-host-prune` on purpose:

- The timer is preventive; it runs daily regardless of current disk
  usage.
- The alerts are reactive; they tell you when disk is climbing for
  reasons the prune cannot fix (data growth, log spam, etc.).

If `DiskUsageHigh` fires before the next daily tick, run the timer
manually:

```bash
sudo systemctl start veta-host-prune.service
```

If `DiskUsageCritical` fires, the prune may not be enough. Investigate
container log file sizes:

```bash
sudo find /var/lib/docker/containers -name "*-json.log" -exec ls -lhS {} + | head -5
```

The 2026-05-14 incident was kafka-relay producing 34 GB of stack traces
in 16 h, well beyond what an image prune could fix.

## Source

- [`scripts/host-prune.sh`](https://github.com/milesburton/veta-trading-platform/blob/main/scripts/host-prune.sh)
- [`scripts/homelab-systemd/veta-host-prune.service`](https://github.com/milesburton/veta-trading-platform/blob/main/scripts/homelab-systemd/veta-host-prune.service)
- [`scripts/homelab-systemd/veta-host-prune.timer`](https://github.com/milesburton/veta-trading-platform/blob/main/scripts/homelab-systemd/veta-host-prune.timer)

## Related

- [Disk monitor](../disk-monitor/): the gauge that feeds the alert rules
- [veta-auto-pull](../veta-auto-pull/): the deploy mechanism whose image churn this cleans up
