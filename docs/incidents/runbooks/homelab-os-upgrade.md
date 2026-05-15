# Runbook: upgrade homelab OS to Ubuntu 24.04 LTS

The homelab is currently on **Ubuntu 23.04 Lunar Lobster**, which reached
end-of-standard-support in **January 2024**. No security updates have been
applied for over a year. This is a known risk surfaced during the
2026-05-15 homelab audit.

Target: **Ubuntu 24.04.4 LTS** (Noble Numbat). Direct upgrade is supported
(`do-release-upgrade` confirmed the 24.04 path).

## Risk surface

- 30+ trading containers restart on reboot (~30 s public outage)
- Docker version may change (currently 25.0.2; 24.04 ships 27.x)
- systemd / journald config formats are stable across this range
- `apt` / `dpkg` state can be left broken if `do-release-upgrade` fails
  mid-flight; recovery is manual

## Pre-upgrade checklist

```bash
ssh miles@192.168.1.245

# 1. Confirm disk has headroom — upgrade needs ~5 GB free
df -h /
# Target: at least 20% free. Run scripts/host-prune.sh if needed.

# 2. Snapshot the Proxmox VM via the Proxmox UI / pct snapshot. This is
#    the rollback. Name it 'pre-ubuntu-24-04'.

# 3. Capture current state for diff after upgrade:
docker ps --format '{{.Names}} {{.Status}}' > /tmp/pre-upgrade-containers.txt
docker version > /tmp/pre-upgrade-docker.txt
systemctl list-unit-files --state=enabled > /tmp/pre-upgrade-units.txt

# 4. Make sure the systemd timers are paused so they don't fire during
#    the upgrade window:
sudo systemctl stop veta-auto-pull.timer
sudo systemctl stop veta-host-prune.timer
```

## The upgrade

Allow ~45 minutes. Run from a tmux/screen session so a dropped SSH doesn't
abort the install.

```bash
# Update current packages first
sudo apt update
sudo apt full-upgrade -y
sudo apt autoremove -y

# Now the release upgrade
sudo do-release-upgrade
# This is interactive — answer y/n prompts. Notable ones:
# - Y to continue when source.list will be rewritten
# - 'install the package maintainer's version' for any docker/systemd
#   config that's been customised (we want stock 24.04 defaults; our
#   customisations live in /etc/systemd/system/ which is preserved)

# At completion it'll prompt for reboot. Do it.
sudo reboot
```

## Post-upgrade verification

After reboot, SSH back in and verify:

```bash
# 1. OS version
cat /etc/os-release | head -3   # expect 24.04 Noble

# 2. Docker came back up + all containers running
docker ps --format '{{.Names}} {{.Status}}' | sort > /tmp/post-upgrade-containers.txt
diff /tmp/pre-upgrade-containers.txt /tmp/post-upgrade-containers.txt

# 3. Critical services healthy
curl -sf http://localhost:5011/health     # gateway
curl -sf https://veta.mnetcs.com/         # public — through tunnel

# 4. Synthetic probe on OVH should already be green again
ssh ubuntu@ovh.agileview.co.uk \
    'journalctl -u veta-synthetic-probe.service -n 10 --no-pager'

# 5. Re-enable timers
sudo systemctl start veta-auto-pull.timer
sudo systemctl start veta-host-prune.timer
sudo systemctl list-timers --no-pager | grep veta
```

## Rollback

If anything fundamental breaks (Docker won't start, network is
mis-configured, etc.):

1. From the Proxmox UI, restore the `pre-ubuntu-24-04` snapshot. ~2 minute
   restore + boot.
2. Synthetic probe will go red while the VM is being rolled back; that's
   expected. Manual `systemctl start veta-synthetic-probe.timer` if it
   doesn't auto-resume.

Snapshot lives as long as Proxmox storage holds it. Delete once you're
confident the upgrade is stable (e.g. one week green).

## Estimated downtime

- Pre-upgrade housekeeping: 5 min, no outage
- `do-release-upgrade`: 30-45 min, **services up the whole time until reboot**
- Reboot: ~60-90 s public outage
- Post-upgrade verification: 10 min, no outage

Total public outage: ~90 s.

## When to do this

- **High priority**: 16 months without security updates is meaningful for
  a publicly-reachable service. Schedule within the next month.
- **Low pressure**: no specific CVE is known to be unpatched; this is
  insurance, not an emergency. Don't rush it into a busy week.

## Out of scope (future)

- Migration off Proxmox LXC entirely (e.g. to a bare-metal install or a
  cloud VM) — too big to bundle here, separate decision.
- Switching to a server-friendly distro (Debian stable, RHEL family) —
  same argument.
