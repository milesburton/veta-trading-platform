# OVH edge sshd hardening for veta-tunnel

This directory contains the `sshd_config.d` snippet that goes on the OVH
edge box. It enables active liveness probing on the `veta-tunnel` user
only, so a dead reverse-tunnel client is detected and its port binding
released within ~90 seconds instead of waiting for the kernel TCP
timeout (~2 hours by default).

## Why this matters

When the homelab loses internet connectivity, the reverse SSH session
appears alive to OVH's sshd, and the OS-level `-R 18443:127.0.0.1:443`
port forwarding stays bound. When the homelab comes back and autossh
tries to re-establish, every new ssh session fails with:

    Error: remote port forwarding failed for listen port 18443

`autossh` then loops indefinitely (162+ restarts observed in one
2026-05-18 outage) until the edge kernel finally times out the dead
TCP socket. During that window, veta.mnetcs.com is unreachable.

The `Match User veta-tunnel` block scopes these probes to the tunnel
account so interactive ssh sessions for `miles` or root are unaffected.

## Install on OVH

```bash
# 1. Copy the snippet
sudo install -m 0644 /path/to/repo/edge/sshd/veta-tunnel.conf \
  /etc/ssh/sshd_config.d/veta-tunnel.conf

# 2. Validate before reloading (refuses to start with bad config)
sudo sshd -t

# 3. Reload sshd (no disconnects on existing sessions)
sudo systemctl reload ssh

# 4. Verify it took effect — kick the existing veta-tunnel session
#    and check it reconnects within ~30 seconds:
sudo pkill -u veta-tunnel sshd || true
sleep 60
sudo ss -tlnp '( sport = :18443 )'
```

The last command should show a fresh listener owned by the new
veta-tunnel session.

## How fast does recovery become?

With `ClientAliveInterval=30 ClientAliveCountMax=3`:
- sshd sends a keepalive every 30 seconds
- After 3 missed responses (90 seconds) the connection is killed
- The port-forward is released as part of session teardown
- autossh on the homelab reconnects on its next 30-second poll

End-to-end: dead-client detection + recovery in under 2 minutes,
versus 2 hours of unreachable site without this fix.
