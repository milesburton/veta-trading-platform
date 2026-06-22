# Runbook: upgrade server OS to Ubuntu 24.04 LTS

The server is currently on **Ubuntu 23.04 Lunar Lobster**, which reached
end-of-standard-support in **January 2024**. No security updates have been
applied for over a year. This is a known risk surfaced during the
2026-05-15 server audit.

Target: **Ubuntu 24.04.4 LTS** (Noble Numbat). Direct upgrade is supported
(`do-release-upgrade` confirmed the 24.04 path).

## Risk surface

- 30+ trading containers restart on reboot (~30 s public outage)
- Docker version may change (currently 25.0.2; 24.04 ships 27.x)
- systemd / journald config formats are stable across this range
- `apt` / `dpkg` state can be left broken if `do-release-upgrade` fails
  mid-flight; recovery is manual

## Recommended: clone-first dry run

Before touching prod, prove the upgrade works on a clone. Proxmox makes
this cheap:

```bash
# From the Proxmox host (not the LXC):
# 1. Note the VM/CT ID of the server (e.g. 100). Stop briefly:
pct stop 100  # ~30s outage if no live-clone, or skip + use snapshot mode

# 2. Clone:
pct clone 100 999 --full --hostname server-upgrade-test

# 3. Start the clone (it'll come up with the same IP if you don't change
#    networking — most setups need to edit /etc/network/interfaces inside
#    the clone before boot or use a different bridge). Disconnect prod
#    network first if both will be up at once.

# 4. SSH to the clone, run the full upgrade procedure below, verify
#    everything comes back up, **then destroy the clone**:
pct stop 999 && pct destroy 999
```

If the dry run reveals an issue (e.g. a third-party apt source no longer
exists in 24.04 repos, or Docker config breaks), fix the runbook below
**before** touching prod.

## Pre-upgrade checklist (prod)

```bash
ssh miles@<server-host>

# 1. Confirm disk has headroom — upgrade needs ~5 GB free
df -h /
# Target: at least 20% free. Run scripts/host-prune.sh if needed.

# 2. Snapshot the Proxmox VM via the Proxmox UI / pct snapshot. This is
#    the rollback. Name it 'pre-ubuntu-24-04'.

# 3. Capture current state for diff after upgrade:
docker ps --format '{{.Names}} {{.Status}}' > /tmp/pre-upgrade-containers.txt
docker version > /tmp/pre-upgrade-docker.txt
systemctl list-unit-files --state=enabled > /tmp/pre-upgrade-units.txt
systemctl list-units --type=service --state=running > /tmp/pre-upgrade-services.txt

# 4. Pause the systemd timers so they don't fire during the upgrade:
sudo systemctl stop veta-auto-pull.timer
sudo systemctl stop veta-host-prune.timer

# 5. Pause the synthetic probe on the edge server so the reboot doesn't
#    trigger a false-positive page. (Skip if you WANT to verify the alert
#    path.)
ssh <user>@<edge-server> \
    'sudo systemctl stop veta-synthetic-probe.timer'

# 6. Sanity check: confirm /etc/network/interfaces and netplan config
#    won't change. (Ubuntu 24.04 changed netplan defaults in some
#    edge cases. If you see "renderer: networkd" in /etc/netplan/*.yaml
#    and it Just Works today, you're fine.)
ls /etc/netplan/ /etc/network/interfaces.d/ 2>/dev/null
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

# 2. Secure tunnel back up — without this, the public URL stays
#    down even if the server is healthy
systemctl status veta-tunnel.service --no-pager
# Expect: active (running). If not, restart:
sudo systemctl restart veta-tunnel.service

# 3. Docker came back up + all containers running
docker ps --format '{{.Names}} {{.Status}}' | sort > /tmp/post-upgrade-containers.txt
diff /tmp/pre-upgrade-containers.txt /tmp/post-upgrade-containers.txt
# Any "Restarting" or missing containers warrant investigation before
# resuming the timers.

# 4. Critical services healthy
docker exec veta-traefik-1 wget -qO- http://gateway:5011/ready  # internal
curl -sf https://veta.example.com/                              # public — through tunnel

# 5. Resume the synthetic probe on the edge server (it was paused in pre-flight)
ssh <user>@<edge-server> \
    'sudo systemctl start veta-synthetic-probe.timer
     sudo journalctl -u veta-synthetic-probe.service -n 5 --no-pager'

# 6. Re-enable server timers
sudo systemctl start veta-auto-pull.timer
sudo systemctl start veta-host-prune.timer
sudo systemctl list-timers --no-pager | grep veta

# 7. Watch for ~5 min — probe should fire 5x with all-green outcomes:
ssh <user>@<edge-server> \
    'sudo journalctl -u veta-synthetic-probe.service -n 25 --no-pager \
     | grep probe_done'
```

## Rollback

If anything fundamental breaks (Docker won't start, network is
mis-configured, etc.):

1. From the Proxmox UI, restore the `pre-ubuntu-24-04` snapshot. ~2 minute
   restore + boot.
2. Synthetic probe will go red while the VM is being rolled back; that's
   expected. Manual `systemctl start veta-synthetic-probe.timer` on the edge server
   if it doesn't auto-resume.

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
