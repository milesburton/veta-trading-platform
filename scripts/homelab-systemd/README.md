# Homelab systemd units

Three systemd timers / services manage the homelab's continuous-deploy
+ ingress lifecycle. Install commands are minimal here; **full docs** for
each are in Astro.

| Unit | What it does | Astro page |
|---|---|---|
| `veta-auto-pull.{service,timer}` | Polls `origin/main` every 5 min, runs `deploy.sh` on SHA change | [veta-auto-pull](https://milesburton.github.io/veta-trading-platform/platform/supporting/veta-auto-pull/) |
| `veta-tunnel.service` | `autossh` reverse tunnel to the OVH edge — public traffic comes back via this | [veta-tunnel](https://milesburton.github.io/veta-trading-platform/platform/supporting/veta-tunnel/) |
| `veta-host-prune.{service,timer}` | Weekly Docker prune (Sundays 04:00 UTC). Stops auto-pull image churn from filling disk | [veta-host-prune](https://milesburton.github.io/veta-trading-platform/platform/supporting/veta-host-prune/) |

## One-time install (all three)

```bash
# 1. auto-pull
sudo install -m 0755 /path/to/repo/scripts/homelab-auto-pull.sh /opt/stacks/veta/auto-pull.sh
sudo install -m 0644 /path/to/repo/scripts/homelab-systemd/veta-auto-pull.{service,timer} /etc/systemd/system/

# 2. tunnel — generate keypair first (see Astro page for the OVH side)
sudo apt-get install -y autossh
sudo install -d -m 0700 -o root -g root /etc/veta-tunnel
sudo ssh-keygen -t ed25519 -N "" -C veta-tunnel@homelab -f /etc/veta-tunnel/id_ed25519
sudo install -m 0644 /path/to/repo/scripts/homelab-systemd/veta-tunnel.service /etc/systemd/system/

# 3. host-prune
sudo install -m 0644 /path/to/repo/scripts/homelab-systemd/veta-host-prune.{service,timer} /etc/systemd/system/

# Enable them all
sudo systemctl daemon-reload
sudo systemctl enable --now veta-auto-pull.timer veta-tunnel.service veta-host-prune.timer
```

Per-unit operational commands (`systemctl status`, `journalctl`, etc.)
are documented on each Astro page linked above.

## Related env / secrets

Two homelab `.env` settings are required for production routes to work
end-to-end. Both live in `/opt/stacks/veta/.env`:

- **`OAUTH2_SHARED_SECRET`** and **`OAUTH2_USER_SECRETS`** — see
  [Security posture](https://milesburton.github.io/veta-trading-platform/platform/security/)
- **`GRAFANA_BASICAUTH_HTPASSWD`** — gates the public `/grafana` route.
  See [Observability](https://milesburton.github.io/veta-trading-platform/platform/observability/)
- **`ALERT_WEBHOOK_URL`** — delivery destination for security alerts.
  See [Observability](https://milesburton.github.io/veta-trading-platform/platform/observability/)
- **`PUBLIC_GUEST_TRADING`** — when `true`, anonymous users can place
  rate-limited orders via the `/oauth/guest` endpoint. See
  [synthetic probe](https://milesburton.github.io/veta-trading-platform/platform/supporting/synthetic-probe/)
  (the probe uses this endpoint).

The OVH-side `ALERT_WEBHOOK_URL` for the synthetic probe is separate
and lives in `/etc/veta-probe.env` on the OVH box. See the
[Synthetic probe](https://milesburton.github.io/veta-trading-platform/platform/supporting/synthetic-probe/)
page.
