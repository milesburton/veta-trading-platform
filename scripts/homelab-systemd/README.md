# Homelab auto-pull (systemd timer)

Polls `origin/main` every 5 minutes and runs `deploy.sh` when a new commit
lands. Replaces the `deploy-homelab` GitHub Actions job — GH runners can't
reach the homelab's private LAN, so we invert the direction.

There are two services managed via systemd on the homelab:

- `veta-auto-pull.{service,timer}` — polls `origin/main`, runs `deploy.sh` on SHA change.
- `veta-tunnel.service` — `autossh` reverse tunnel to the OVH edge box, exposes
  the homelab Traefik at `127.0.0.1:18443` on OVH so the edge's Let's Encrypt
  Traefik can proxy `https://veta.mnetcs.com/` into the homelab. See
  [`edge/README.md`](../../edge/README.md) for the edge side.

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

---

# Reverse SSH tunnel (`veta-tunnel.service`)

Maintains an `autossh` reverse tunnel from the homelab to the OVH edge
box. Public traffic for `https://veta.mnetcs.com/` arrives at the OVH
edge's Traefik (which terminates Let's Encrypt TLS) and is proxied into
this tunnel back to the homelab's internal Traefik on port 443.

The homelab dials out; nothing inbound to the home router is required.

## Install (one-time, on the homelab)

```bash
# Install autossh
sudo apt-get install -y autossh

# Generate a dedicated keypair (separate from your personal SSH keys)
sudo install -d -m 0700 -o root -g root /etc/veta-tunnel
sudo ssh-keygen -t ed25519 -N "" -C veta-tunnel@homelab \
  -f /etc/veta-tunnel/id_ed25519

# Print the public key — paste this into the OVH edge box (see edge/README.md)
sudo cat /etc/veta-tunnel/id_ed25519.pub

# Install + start the systemd unit
sudo install -m 0644 \
  /path/to/repo/scripts/homelab-systemd/veta-tunnel.service \
  /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now veta-tunnel.service
```

## Daily use

```bash
# Status
systemctl status veta-tunnel.service

# Recent activity
journalctl -u veta-tunnel.service -n 50 --no-pager

# Restart (e.g. after rotating keys)
sudo systemctl restart veta-tunnel.service

# Quick health check — the tunnel exposes port 18443 on the OVH side
ssh ubuntu@ovh.agileview.co.uk 'ss -tlnp | grep :18443'
```

## Why a separate user + restricted authorized_keys on OVH?

The homelab key on OVH lives under user `veta-tunnel` with a single
authorized_keys entry:

```
restrict,port-forwarding,permitlisten="18443" ssh-ed25519 ...
```

- `restrict` denies pty/X11/agent/user-rc/exec by default
- `port-forwarding` re-enables the one capability we need
- `permitlisten="18443"` allows reverse-forwarding only to port 18443

If the homelab is ever compromised, the worst the attacker can do via
this key is hold port 18443 open on the OVH edge — no shell, no other
forwards. They'd see the inbound HTTPS connections proxied through the
tunnel, but that's the public traffic anyway.
