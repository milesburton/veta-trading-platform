---
title: veta-auto-pull (continuous deploy)
description: systemd timer that polls origin/main every 5 minutes and runs deploy.sh when a new commit lands. The homelab's continuous-deployment mechanism.
---

`veta-auto-pull` is the **continuous deployment** mechanism for the
homelab. Every 5 minutes a systemd timer fires a script that:

1. Polls `origin/main` via `git ls-remote` — no full clone
2. Compares the remote SHA against `state/last-deployed-sha`
3. If different, clones main shallow + self-installs the latest
   `homelab-deploy.sh` over `/opt/stacks/veta/deploy.sh`
4. Runs `deploy.sh` which rsyncs compose files + runs
   `docker compose up -d` with healthcheck gating
5. On success, writes the new SHA to `state/last-deployed-sha`
6. On failure, leaves the file unchanged so the next tick retries

This replaced Watchtower in 2026-05 (Watchtower had a recreate-name
collision bug that left the platform half-deployed indefinitely).

## Why not GitHub Actions?

`.github/workflows/ci.yml` originally had a `deploy-homelab` job that
SSHed from a GH runner to `192.168.1.245`. GitHub runners are on public
IPs; the homelab is on a private LAN. The `ssh-keyscan` step always
failed.

Inverting the direction — the homelab polls GitHub — sidesteps the
network problem entirely without a tunnel, a Tailscale, or a self-hosted
runner.

The 5-minute cadence is the sweet spot:

- Fast enough that operators don't notice the lag (~3.5 min mean)
- Slow enough to avoid hammering GitHub's API
- Aligns with the 6-minute wait in the
  [post-deploy CI probe](../../platform/supporting/synthetic-probe#ci-mirror)

## Install (one-time, on the homelab)

```bash
# 1. Copy the auto-pull script to the stack dir
sudo install -m 0755 \
  /path/to/repo/scripts/homelab-auto-pull.sh \
  /opt/stacks/veta/auto-pull.sh
sudo chown miles:miles /opt/stacks/veta/auto-pull.sh

# 2. Install systemd units
sudo install -m 0644 \
  /path/to/repo/scripts/homelab-systemd/veta-auto-pull.service \
  /etc/systemd/system/
sudo install -m 0644 \
  /path/to/repo/scripts/homelab-systemd/veta-auto-pull.timer \
  /etc/systemd/system/

# 3. Enable + start
sudo systemctl daemon-reload
sudo systemctl enable --now veta-auto-pull.timer
```

## State files

| Path | Written by | Meaning |
|---|---|---|
| `state/last-deployed-sha` | `auto-pull.sh` | Last main SHA we successfully ran `deploy.sh` for |
| `state/auto-pull.lock` | `auto-pull.sh` | `flock` for single-instance guard |
| `.good-sha` | `deploy.sh` | Last SHA the gateway *reported* as its baked-in version after a successful deploy |

`.good-sha` and `last-deployed-sha` may legitimately diverge by one CI
cycle — they answer different questions and one isn't a corrupted copy
of the other. See
[the SHA semantics note](#sha-semantics) below.

## Daily use

```bash
# When does it next run?
systemctl list-timers veta-auto-pull.timer

# Recent activity (deploys, retries, errors)
journalctl -u veta-auto-pull.service -n 50 --no-pager

# Force a check now (e.g. you just merged something hot)
sudo systemctl start veta-auto-pull.service

# Pause auto-deploys (e.g. during a manual debug session)
sudo systemctl stop veta-auto-pull.timer

# Resume
sudo systemctl start veta-auto-pull.timer
```

## SHA semantics

The two SHA files answer different questions:

- **`state/last-deployed-sha`**: "what main SHA did I last try to deploy?"
- **`.good-sha`**: "what SHA did the gateway report as its baked-in
  version after the deploy succeeded?"

These may diverge by one CI cycle: if main moves twice in 5 min
(dependabot + a feature merge), CI rebuilds the gateway image twice.
By the time the second auto-pull tick fires, the gateway image for the
*newer* SHA might not be ready yet on GHCR. The pull picks up the
older image, the gateway reports `version = X`, and `.good-sha = X`
while `last-deployed-sha = Y`.

This is **expected, not a drift bug**.

## Source

- [`scripts/homelab-auto-pull.sh`](https://github.com/milesburton/veta-trading-platform/blob/main/scripts/homelab-auto-pull.sh)
- [`scripts/homelab-deploy.sh`](https://github.com/milesburton/veta-trading-platform/blob/main/scripts/homelab-deploy.sh)
- [`scripts/homelab-systemd/veta-auto-pull.service`](https://github.com/milesburton/veta-trading-platform/blob/main/scripts/homelab-systemd/veta-auto-pull.service)
- [`scripts/homelab-systemd/veta-auto-pull.timer`](https://github.com/milesburton/veta-trading-platform/blob/main/scripts/homelab-systemd/veta-auto-pull.timer)

## Related

- [Edge architecture](../edge-architecture) — how public traffic reaches what auto-pull deploys
- [CI/CD pipeline](../../development/ci-cd) — what happens *before* the homelab pulls the image
- [veta-tunnel](./veta-tunnel) — the reverse SSH tunnel that exposes the homelab publicly
- [veta-host-prune](./veta-host-prune) — weekly cleanup of dangling images
- [Synthetic probe](./synthetic-probe) — closes the loop with a post-deploy check
