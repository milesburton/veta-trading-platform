# Homelab auto-pull (systemd timer)

Polls `origin/main` every 5 minutes and runs `deploy.sh` when a new commit
lands. Replaces the `deploy-homelab` GitHub Actions job — GH runners can't
reach the homelab's private LAN, so we invert the direction.

There are three services managed via systemd on the homelab:

- `veta-auto-pull.{service,timer}` — polls `origin/main`, runs `deploy.sh` on SHA change.
- `veta-tunnel.service` — `autossh` reverse tunnel to the OVH edge box, exposes
  the homelab Traefik at `127.0.0.1:18443` on OVH so the edge's Let's Encrypt
  Traefik can proxy `https://veta.mnetcs.com/` into the homelab. See
  [`edge/README.md`](../../edge/README.md) for the edge side.
- `veta-host-prune.{service,timer}` — weekly Docker prune (Sundays 04:00 UTC).
  Without this, dangling images from auto-pull churn accumulate to tens of GB
  in a few weeks. Backed by [`scripts/host-prune.sh`](../host-prune.sh).

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

---

# Grafana public route — `GRAFANA_BASICAUTH_HTPASSWD`

Grafana is exposed at `https://veta.mnetcs.com/grafana/` via the homelab
Traefik. Because Grafana itself currently has anonymous Admin enabled
(`GF_AUTH_ANONYMOUS_ENABLED=true`, `GF_AUTH_ANONYMOUS_ORG_ROLE=Admin`,
login form hidden), the public path **must** be gated at Traefik with
HTTP basic auth, or the world gets Admin.

The Traefik `basicauth` middleware reads its users from
`${GRAFANA_BASICAUTH_HTPASSWD}` (set in `/opt/stacks/veta/.env`).

## Generate + set the credential

```bash
# Install htpasswd if missing
which htpasswd || sudo apt-get install -y apache2-utils

# Generate a hash for username `demo` (replace with your choice; you'll
# be prompted for the password twice)
htpasswd -nB demo
# example output: demo:$2y$05$ucm9F0J0CnsdH7K0z.QzfeR9PpAVy7eMnD2YQYxQK6.LbKbJ.LJjK

# Put it in the homelab .env, escaping every $ as $$ for compose:
sudo tee -a /opt/stacks/veta/.env <<'EOF'
GRAFANA_BASICAUTH_HTPASSWD=demo:$$2y$$05$$ucm9F0J0CnsdH7K0z.QzfeR9PpAVy7eMnD2YQYxQK6.LbKbJ.LJjK
EOF
```

The literal `$$` in the file becomes `$` after compose's first-pass
substitution, and is then passed unchanged into Traefik's label.

## Recreate Grafana to pick up the new label

```bash
cd /opt/stacks/veta/observability
docker compose -f docker-compose.lgtm.yml up -d --force-recreate grafana
```

If the env was unset before, the placeholder hash `apr1$placeholder...`
in the compose label silently fails every login. Once you set the env
and recreate, real basic-auth kicks in.

## Adding more users later

Append to the same hash with a comma:

```
GRAFANA_BASICAUTH_HTPASSWD=demo:$$hash1...,viewer:$$hash2...
```

## LAN access

The basicauth middleware is on the Grafana router, which matches
`PathPrefix(/grafana)` on the homelab Traefik. Any request to that
path through Traefik — public or LAN — will hit basicauth.

Anonymous-Admin Grafana is still reachable on the LAN by bypassing
Traefik entirely: `http://192.168.1.245:3000` (the docker-published
host port) or the container's IP directly on the `lgtm` docker network.
That's how you'd log in to provision dashboards or change settings.

If you want fully gated Grafana even from LAN, set
`GF_SECURITY_ADMIN_PASSWORD` + drop `GF_AUTH_ANONYMOUS_ENABLED`. A
follow-up.

---

# Host prune (`veta-host-prune.service`)

Auto-pull pulls a new `:latest` image per service on every CI build. Over a
few weeks that's hundreds of dangling images — easily 50 GB. The 2026-05-14
disk-fill incident was logs (now capped via `logging: max-size`), but the
*image* churn is the next-largest contributor and isn't capped anywhere.

This timer runs weekly on Sundays at 04:00 UTC. The script
([`scripts/host-prune.sh`](../host-prune.sh)) does two passes:

1. **Always**: prune dangling images, exited containers, and build cache
   older than 24h.
2. **If disk ≥ THRESHOLD_PCT** (default 90%): also prune *all* untagged
   images and the full builder cache — emergency mode.

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

The script lives at `/opt/stacks/veta/scripts/host-prune.sh` and is rsynced
in by `homelab-deploy.sh` (`scripts/` is in `CONFIG_PATHS`).

## Daily use

```bash
# When does it next run?
systemctl list-timers veta-host-prune.timer

# Run it manually right now
sudo systemctl start veta-host-prune.service

# See what it did last time
journalctl -u veta-host-prune.service -n 50 --no-pager
```

---

# Alert delivery — `ALERT_WEBHOOK_URL`

`observability/grafana/provisioning/alerting/` ships two alert rules:

- **Auth-failure spike** — >5 `auth_failure` events from the gateway
  in any 5-minute window. Indicates credential-stuffing / scanning.
- **WebSocket rate-limit hit repeatedly** — >20 `ws_rate_limited`
  events in 5 minutes. Indicates a misbehaving or hostile client.

Both rules fire into the `security-alerts` contact point. Delivery
needs a webhook target — Slack incoming-webhook URL is the easiest:

```
# Create a Slack incoming webhook at https://api.slack.com/messaging/webhooks
# Then add to /opt/stacks/veta/.env:
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...
```

Restart Grafana after setting:

```bash
cd /opt/stacks/veta/observability
docker compose -f docker-compose.lgtm.yml restart grafana
```

Without `ALERT_WEBHOOK_URL` set, alerts still **fire visibly in the
Grafana UI** (left sidebar → Alerting → Active alerts), but external
delivery is silently dropped.
