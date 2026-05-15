# Synthetic probe

Detects user-visible outages of `https://veta.mnetcs.com/` within ~60 s and
sends an alert webhook after 3 consecutive failures. Runs on the **OVH edge
box** as a systemd timer so it crosses the same reverse SSH tunnel that real
users do — if the tunnel dies, the probe reports failure even though the
homelab itself is fine.

## What it checks (v1, HTTP only)

Every 60 s, three steps:

1. `GET /` — expect HTTP 200, body contains `__version` or `VETA`.
2. `POST /api/gateway/api/user-service/oauth/guest` — expect 200 + a
   `veta_user` session cookie. Uses the public-guest-trading endpoint
   from [PR #234](https://github.com/milesburton/veta-trading-platform/pull/234).
3. `GET /api/gateway/ready` with the cookie — expect `{"ready":true}`.

Each step emits one JSON line to journald. The service exits 0 if all green,
1 on any failure. systemd `OnFailure=` then triggers the alert handler.

What v1 catches:

- Edge Traefik dead / mis-configured
- SSH tunnel down (Caddy on OVH would 502)
- Homelab Traefik dead
- Homelab gateway or user-service dead
- `PUBLIC_GUEST_TRADING` accidentally disabled
- TLS cert near expiry or mis-issued (TLS handshake fails inside `fetch`)

What it doesn't catch — possible v2:

- WebSocket-only outages (no frame counting in v1)
- OMS pipeline regressions (no order submit + cancel in v1)
- Market-data feed stalled (no candle/tick check)

## Install (one-time, on the OVH edge box)

```bash
# Prereq: Deno on the edge box (probe runs as a script, no compile step)
sudo curl -fsSL https://deno.land/install.sh | sudo DENO_INSTALL=/usr/local sh

# Dedicated unprivileged user
sudo useradd -r -s /usr/sbin/nologin -d /opt/veta-probe veta-probe
sudo install -d -m 0755 -o veta-probe -g veta-probe /opt/veta-probe
sudo install -d -m 0755 -o veta-probe -g veta-probe /var/lib/veta-probe

# Clone or rsync the repo onto the box; from /path/to/repo:
sudo install -m 0644 -o veta-probe -g veta-probe synthetic-probe/probe.ts /opt/veta-probe/probe.ts
sudo install -m 0755 -o veta-probe -g veta-probe synthetic-probe/alert.sh /opt/veta-probe/alert.sh

# Systemd units
sudo install -m 0644 synthetic-probe/deploy/veta-synthetic-probe.service       /etc/systemd/system/
sudo install -m 0644 synthetic-probe/deploy/veta-synthetic-probe.timer         /etc/systemd/system/
sudo install -m 0644 synthetic-probe/deploy/veta-synthetic-probe-alert@.service /etc/systemd/system/

# Alert webhook (optional but recommended). Use Slack / Discord incoming
# webhook URL, or any HTTP endpoint that accepts a POST with JSON body.
sudo tee /etc/veta-probe.env <<'EOF'
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...
FAIL_THRESHOLD=3
EOF
sudo chmod 0600 /etc/veta-probe.env

sudo systemctl daemon-reload
sudo systemctl enable --now veta-synthetic-probe.timer
```

After ~30 s the first invocation runs.

## Daily use

```bash
# When does it next run?
systemctl list-timers veta-synthetic-probe.timer

# Recent results (one JSON line per step, plus probe_done summary)
journalctl -u veta-synthetic-probe.service -n 40 --no-pager

# Filter only failed runs
journalctl -u veta-synthetic-probe.service --no-pager \
  | grep -E '"outcome":"fail"|"failedAtStep"'

# Force a run now
sudo systemctl start veta-synthetic-probe.service

# Pause (e.g. during maintenance)
sudo systemctl stop veta-synthetic-probe.timer

# Resume
sudo systemctl start veta-synthetic-probe.timer

# Reset the consecutive-failure counter manually
sudo rm /var/lib/veta-probe/consecutive_failures
```

## Alert payload

When 3 consecutive failures are seen, `alert.sh` POSTs:

```json
{
  "service": "veta-synthetic-probe",
  "alert": "veta.mnetcs.com probe failing",
  "consecutive_failures": 3,
  "host": "ovh.agileview.co.uk",
  "ts": "2026-05-15T10:08:23+00:00",
  "hint": "journalctl -u veta-synthetic-probe.service -n 20"
}
```

On recovery (next success after the threshold was crossed):

```json
{
  "service": "veta-synthetic-probe",
  "alert": "veta.mnetcs.com probe RECOVERED",
  "after_failures": 7,
  "host": "ovh.agileview.co.uk",
  "ts": "2026-05-15T10:14:23+00:00"
}
```

## Tuning

| Env (in `/etc/veta-probe.env`) | Default | Effect |
|---|---|---|
| `ALERT_WEBHOOK_URL` | empty | If unset, alerts are logged to journald only |
| `FAIL_THRESHOLD` | `3` | Consecutive failures before alerting (3 × 60 s = ~3 min) |
| `PROBE_BASE_URL` | `https://veta.mnetcs.com` | Override for testing |
| `PROBE_TIMEOUT_MS` | `10000` | Per-step timeout |

## Why on the OVH edge box, not the homelab itself

Running the probe on the homelab would miss the most common public-outage
class: the SSH tunnel dying or the OVH Traefik mis-routing. From the
homelab's perspective the homelab gateway is reachable on `localhost:5011`
and would always look fine.

Running it on the OVH edge means every probe crosses:

```
probe → 127.0.0.1:443 (OVH Traefik) → 127.0.0.1:18443 (tunnel) → homelab Traefik → service
```

— identical to the path real users take.

## Threat model

The probe holds no secrets, runs as an unprivileged user, has no inbound
network exposure. It only opens outbound HTTPS to `veta.mnetcs.com` and
the alert webhook. The `veta-probe.env` file (mode 0600) is the only
local sensitive material — keep it out of backups that go to less-trusted
storage.
