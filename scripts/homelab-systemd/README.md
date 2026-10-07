# Homelab systemd units

Three systemd timers / services manage the homelab's continuous-deploy
+ ingress lifecycle. Install commands are minimal here; **full docs** for
each are in Astro.

| Unit | What it does | Astro page |
|---|---|---|
| `veta-auto-pull.{service,timer}` | Polls `origin/main` every 5 min, runs `deploy.sh` on SHA change | [veta-auto-pull](https://milesburton.github.io/veta-trading-platform/platform/supporting/veta-auto-pull/) |
| `veta-tunnel.service` | `autossh` reverse tunnel to the OVH edge — public traffic comes back via this | [veta-tunnel](https://milesburton.github.io/veta-trading-platform/platform/supporting/veta-tunnel/) |
| `veta-host-prune.{service,timer}` | Daily Docker prune (04:00 UTC). Stops auto-pull image churn from filling disk | [veta-host-prune](https://milesburton.github.io/veta-trading-platform/platform/supporting/veta-host-prune/) |
| `veta.slice`, `ci.slice` | CPU isolation between production containers and the self-hosted CI runner | [CI/CD](https://milesburton.github.io/veta-trading-platform/development/ci-cd/) |

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

## CPU isolation (slices)

The self-hosted CI runner shares the box with production. Its testcontainers
are siblings on the host Docker daemon, so pinning the runner container alone
has no effect. Instead every container defaults to `ci.slice`, and production
opts into `veta.slice`:

```bash
sudo install -m 0644 /path/to/repo/scripts/homelab-systemd/{veta,ci}.slice /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start veta.slice ci.slice
[ -f /etc/docker/daemon.json ] || echo '{}' | sudo tee /etc/docker/daemon.json
sudo jq '. + {"cgroup-parent": "ci.slice"}' /etc/docker/daemon.json > /tmp/daemon.json
sudo install -m 0644 /tmp/daemon.json /etc/docker/daemon.json
sudo systemctl restart docker
```

Then add `VETA_CGROUP_PARENT=veta.slice` to `/opt/stacks/veta/.env`. It is
not a secret, so it stays in `.env` rather than OpenBao.

`AllowedCPUs` in each slice must be CPU IDs visible to the host; check with
`cat /sys/fs/cgroup/cpuset.cpus.effective`. Give production the faster cores.
Containers created before the daemon change keep an empty cgroup parent and
land in `ci.slice` on their next start, so recreate production with
`scripts/veta-compose.sh up -d --force-recreate` after setting `VETA_CGROUP_PARENT`.
Verify with `cat /proc/<pid>/cgroup` for a container's main process.

Per-unit operational commands (`systemctl status`, `journalctl`, etc.)
are documented on each Astro page linked above.

## Related env / secrets

These homelab settings are required for production routes to work
end-to-end. Secrets (`OAUTH_*`, the htpasswd and webhook values) live in
OpenBao at `secret/veta/platform`; non-secret flags (`OAUTH_ALLOW_PUBLIC_REGISTER`,
`VETA_CGROUP_PARENT`, `PUBLIC_GUEST_TRADING`) stay in `/opt/stacks/veta/.env`.
See [Secrets](https://milesburton.github.io/veta-trading-platform/development/deployment/#secrets):

- **`OAUTH_SHARED_SECRET`** and **`OAUTH_USER_SECRETS`** — see
  [Security posture](https://milesburton.github.io/veta-trading-platform/platform/security/)
- **`GRAFANA_BASICAUTH_HTPASSWD`** — gates the public `/grafana` route.
  See [Observability](https://milesburton.github.io/veta-trading-platform/platform/observability/)
- **`DISCORD_WEBHOOK_URL`** — alerts channel for both Grafana platform
  alerts and frontend-emitted user alerts (kill switch, order rejected).
  See [Alert routing](https://milesburton.github.io/veta-trading-platform/platform/observability/alerts/)
- **`DISCORD_BUG_WEBHOOK_URL`** — dedicated webhook for user-submitted
  bug reports. Falls back to `DISCORD_WEBHOOK_URL` when unset. See
  [User bug reports](https://milesburton.github.io/veta-trading-platform/platform/observability/bug-reports/)
- **`OAUTH_ALLOW_PUBLIC_REGISTER`** — when `true`, the LoginPage
  Create-account form is reachable and new users land as trader with
  starter limits.
- **`VETA_CGROUP_PARENT`**: set to `veta.slice` so every compose service
  runs on the production CPU set. Unset means Docker's default cgroup
  parent. See [CPU isolation](#cpu-isolation-slices) above.
- **`PUBLIC_GUEST_TRADING`** — when `true`, anonymous users can place
  rate-limited orders via the `/oauth/guest` endpoint. See
  [synthetic probe](https://milesburton.github.io/veta-trading-platform/platform/supporting/synthetic-probe/)
  (the probe uses this endpoint).

The OVH-side `ALERT_WEBHOOK_URL` for the synthetic probe is separate
and lives in `/etc/veta-probe.env` on the OVH box. See the
[Synthetic probe](https://milesburton.github.io/veta-trading-platform/platform/supporting/synthetic-probe/)
page.
