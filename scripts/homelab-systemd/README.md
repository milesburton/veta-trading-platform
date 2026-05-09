# Homelab auto-pull (systemd timer)

Polls `origin/main` every 5 minutes and runs `deploy.sh` when a new commit
lands. Replaces the `deploy-homelab` GitHub Actions job — GH runners can't
reach the homelab's private LAN, so we invert the direction.

## Install (one-time, on the homelab)

```bash
# Copy the auto-pull script to the stack dir
sudo install -m 0755 \
  /path/to/repo/scripts/homelab-auto-pull.sh \
  /opt/stacks/veta/auto-pull.sh
sudo chown miles:miles /opt/stacks/veta/auto-pull.sh

# Install the systemd unit + timer
sudo install -m 0644 \
  /path/to/repo/scripts/homelab-systemd/veta-auto-pull.service \
  /etc/systemd/system/
sudo install -m 0644 \
  /path/to/repo/scripts/homelab-systemd/veta-auto-pull.timer \
  /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable --now veta-auto-pull.timer
```

After the first 5-minute tick (or run `sudo systemctl start veta-auto-pull.service` to fire it manually), state lands in:

- `/opt/stacks/veta/state/last-deployed-sha` — full 40-char SHA most recently deployed
- `/opt/stacks/veta/state/auto-pull.lock` — flock for single-instance guard

## Daily use

```bash
# When does it next run?
systemctl list-timers veta-auto-pull.timer

# Recent activity
journalctl -u veta-auto-pull.service -n 50 --no-pager

# Force a check now
sudo systemctl start veta-auto-pull.service

# Pause auto-deploys (e.g. during a manual debug session)
sudo systemctl stop veta-auto-pull.timer

# Resume
sudo systemctl start veta-auto-pull.timer
```

## How it decides to deploy

1. `git ls-remote` against `origin/main` — gets the current SHA without cloning
2. Compares against `state/last-deployed-sha`
3. If different, runs `/opt/stacks/veta/deploy.sh`
4. On success, writes the new SHA to `last-deployed-sha`
5. On failure, leaves the file unchanged so the next tick retries

The 5-minute cadence is the sweet spot:
- Fast enough that operators don't notice
- Slow enough to avoid hammering GitHub
- Aligned with Watchtower's image-pull cadence so they cycle together

## Why not GitHub Actions?

`.github/workflows/ci.yml` had a `deploy-homelab` job (PR #128) that SSHed
from a GH runner to `192.168.1.245`. GH runners are on public IPs; the
homelab is on a private LAN. The job's `ssh-keyscan` step always failed.
Removing that job is part of this PR.

Alternatives considered and rejected:
- **Tailscale**: extra service to register and trust
- **GitHub-hosted self-hosted runner**: more moving parts, runner credentials
  on the homelab
- **Cloudflare Tunnel / ngrok**: extra hop, third-party dependency

The cron model has zero new infrastructure and zero inbound exposure.
