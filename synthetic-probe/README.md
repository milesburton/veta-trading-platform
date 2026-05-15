# Synthetic probe

Deno binary that probes `https://veta.mnetcs.com/` every 60 s from the
OVH edge box. Detects user-visible outages and alerts via webhook on
3 consecutive failures.

**Full documentation**:
[Synthetic probe](https://milesburton.github.io/veta-trading-platform/platform/supporting/synthetic-probe/).

## One-time install (on OVH)

```bash
# Prereq: Deno + unzip
sudo apt-get install -y unzip
sudo curl -fsSL https://deno.land/install.sh | sudo DENO_INSTALL=/usr/local sh

# Dedicated user + dirs
sudo useradd -r -s /usr/sbin/nologin -d /opt/veta-probe veta-probe
sudo install -d -m 0755 -o veta-probe -g veta-probe /opt/veta-probe /var/lib/veta-probe

# Probe files
sudo install -m 0644 -o veta-probe -g veta-probe probe.ts /opt/veta-probe/
sudo install -m 0755 -o veta-probe -g veta-probe alert.sh /opt/veta-probe/

# Systemd units
sudo install -m 0644 deploy/veta-synthetic-probe.service       /etc/systemd/system/
sudo install -m 0644 deploy/veta-synthetic-probe.timer         /etc/systemd/system/
sudo install -m 0644 deploy/veta-synthetic-probe-alert@.service /etc/systemd/system/

# Optional: webhook for alerts (Slack/Discord/etc.)
sudo tee /etc/veta-probe.env <<EOF
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...
FAIL_THRESHOLD=3
EOF
sudo chmod 0600 /etc/veta-probe.env

sudo systemctl daemon-reload
sudo systemctl enable --now veta-synthetic-probe.timer
```

## Daily use

```bash
systemctl list-timers veta-synthetic-probe.timer
sudo journalctl -u veta-synthetic-probe.service -n 40 --no-pager
sudo systemctl start veta-synthetic-probe.service   # force a run
```

Full operational guide, alerting model, and v2 roadmap on the
[Astro page](https://milesburton.github.io/veta-trading-platform/platform/supporting/synthetic-probe/).
