---
title: veta-tunnel (reverse SSH tunnel)
description: autossh-managed reverse SSH tunnel that exposes the homelab publicly via the OVH edge box. The homelab dials out, so no inbound NAT is required.
---

The homelab sits on a private LAN with **no inbound
port forwards**. Public traffic reaches it through a reverse SSH tunnel
that the homelab dials *out* to the OVH edge box (`ovh.agileview.co.uk`).
The OVH side terminates Let's Encrypt TLS and forwards into the tunnel.

For the full chain see [Edge architecture](../edge-architecture).

## How it works

```bash
# Runs as veta-tunnel.service on the homelab:
autossh -M 0 -N \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes \
  -o IdentitiesOnly=yes \
  -i /etc/veta-tunnel/id_ed25519 \
  -R 18443:localhost:443 \
  veta-tunnel@ovh.agileview.co.uk
```

The `-R 18443:localhost:443` instructs the OVH SSH daemon to listen on
`localhost:18443` and forward connections back to the homelab's `:443`.
`autossh` restarts the underlying `ssh` if it exits, covering network
blips, OVH reboots, and similar disruptions.

`-o ExitOnForwardFailure=yes` ensures `ssh` exits non-zero rather than
holding a connection open without the reverse forward bound. This matters
because we want `autossh` to retry rather than appear connected while
the public route is silently dead.

## Install on the homelab side

```bash
# Install autossh
sudo apt-get install -y autossh

# Generate a dedicated keypair (separate from your personal SSH keys)
sudo install -d -m 0700 -o root -g root /etc/veta-tunnel
sudo ssh-keygen -t ed25519 -N "" -C veta-tunnel@homelab \
  -f /etc/veta-tunnel/id_ed25519

# Print the public key. Paste this into the OVH edge box (next section).
sudo cat /etc/veta-tunnel/id_ed25519.pub

# Install + start the systemd unit
sudo install -m 0644 \
  /path/to/repo/scripts/homelab-systemd/veta-tunnel.service \
  /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now veta-tunnel.service
```

## Install on the OVH side (tunnel user)

Provision a dedicated `veta-tunnel` user whose only capability is to
hold port 18443 open:

```bash
# Create the user with no shell
sudo useradd --system --shell /usr/sbin/nologin --create-home veta-tunnel

# Install the homelab's public key with restrictions
sudo install -d -m 0700 -o veta-tunnel -g veta-tunnel /home/veta-tunnel/.ssh
sudo tee /home/veta-tunnel/.ssh/authorized_keys > /dev/null <<EOF
restrict,port-forwarding,permitlisten="18443" ssh-ed25519 AAAAC3N...
EOF
sudo chown veta-tunnel:veta-tunnel /home/veta-tunnel/.ssh/authorized_keys
sudo chmod 0600 /home/veta-tunnel/.ssh/authorized_keys

# sshd must allow GatewayPorts=no (default) but tolerate the reverse
# forward. Confirm sshd_config doesn't have AllowTcpForwarding no.
sudo sshd -T | grep -E "allowtcpforwarding|gatewayports"
```

## Restricted `authorized_keys` line: what each part does

```
restrict,port-forwarding,permitlisten="18443" ssh-ed25519 AAAAC3N...
```

| Option | Effect |
|---|---|
| `restrict` | Denies pty / X11 / agent-forwarding / user-rc / `exec` by default. Equivalent to `no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding,no-exec` |
| `port-forwarding` | Re-enables the *one* forwarding capability we need |
| `permitlisten="18443"` | Allows the reverse-forward to bind only port 18443. Any other `-R` request is rejected. |

If the homelab is ever compromised, the worst an attacker can do via
this key is hold port 18443 open on OVH. No shell and no other forwards.
They would see the inbound HTTPS connections proxied through the tunnel,
but that traffic is public anyway.

## Daily use

```bash
# Status
systemctl status veta-tunnel.service

# Recent activity (reconnects, network blips)
journalctl -u veta-tunnel.service -n 50 --no-pager

# Restart (e.g. after rotating keys)
sudo systemctl restart veta-tunnel.service

# Quick health check: port 18443 should be listening on the OVH side
ssh ubuntu@ovh.agileview.co.uk 'ss -tlnp | grep :18443'

# From inside the homelab, make sure the local :443 is up too
ss -tlnp | grep :443
```

## Failure modes

| Symptom | Likely cause |
|---|---|
| Edge Traefik returns 502 | Tunnel down. Check `journalctl -u veta-tunnel` |
| Tunnel runs but public URL returns 503 from homelab Traefik | Homelab Traefik dead, a separate problem |
| Tunnel restarts every few seconds | OVH SSH daemon rejecting the key. Check `journalctl -u veta-tunnel` for the error |
| Tunnel runs but `:18443` not listening on OVH | `permitlisten` mismatch, or sshd rejected the `-R` request |

The [synthetic probe](./synthetic-probe) catches all four classes within
~3 min as a webhook alert.

## Stale port-binding recovery (OVH sshd hardening)

When the homelab loses internet connectivity, the reverse SSH session
appears alive to OVH's sshd and the `-R 18443:127.0.0.1:443` port
binding stays held. When the homelab regains internet and autossh
tries to re-establish, every new ssh attempt fails with:

    Error: remote port forwarding failed for listen port 18443

`autossh` loops indefinitely (162+ restarts observed during a
2026-05-18 outage) until the edge kernel TCP timeout finally releases
the dead socket — that takes around two hours by default. During the
window, `veta.mnetcs.com` is unreachable.

The fix is server-side keepalive on the OVH sshd, scoped to the
`veta-tunnel` user so interactive sessions for `miles` or `root` are
unaffected. The snippet at
[`edge/sshd/veta-tunnel.conf`](https://github.com/milesburton/veta-trading-platform/blob/main/edge/sshd/veta-tunnel.conf)
contains:

```sshd_config
Match User veta-tunnel
    ClientAliveInterval 30
    ClientAliveCountMax 3
```

Install:

```bash
sudo install -m 0644 /path/to/repo/edge/sshd/veta-tunnel.conf \
  /etc/ssh/sshd_config.d/veta-tunnel.conf
sudo sshd -t           # validate before reload
sudo systemctl reload ssh

# Force-cycle the existing veta-tunnel session and confirm reconnect
sudo pkill -u veta-tunnel sshd || true
sleep 60
sudo ss -tlnp '( sport = :18443 )'   # should show a fresh listener
```

With this in place the recovery sequence is:

- sshd sends a keepalive every 30 seconds
- after 3 missed responses (90 seconds) the connection is killed
- the port-forward is released as part of session teardown
- autossh reconnects on its next 30-second poll

End-to-end: dead-client detection plus recovery in under two minutes,
versus the previous two-hour outage window.

## Rotating the tunnel key

If the homelab is rebuilt or the key needs rotation:

```bash
# Homelab side: generate new keypair
sudo ssh-keygen -t ed25519 -N "" -C veta-tunnel@homelab \
  -f /etc/veta-tunnel/id_ed25519.new
sudo cat /etc/veta-tunnel/id_ed25519.new.pub

# OVH side: append the new pubkey to authorized_keys with the same
# restrict prefix. Verify the tunnel works with the new key BEFORE
# removing the old one.

# Homelab side: swap the keys
sudo mv /etc/veta-tunnel/id_ed25519.new /etc/veta-tunnel/id_ed25519
sudo mv /etc/veta-tunnel/id_ed25519.new.pub /etc/veta-tunnel/id_ed25519.pub
sudo systemctl restart veta-tunnel.service

# OVH side: remove the old pubkey line
sudo nano /home/veta-tunnel/.ssh/authorized_keys
```

## Source

- [`scripts/homelab-systemd/veta-tunnel.service`](https://github.com/milesburton/veta-trading-platform/blob/main/scripts/homelab-systemd/veta-tunnel.service)
- [`edge/README.md`](https://github.com/milesburton/veta-trading-platform/blob/main/edge/README.md): original OVH-side documentation

## Related

- [Edge architecture](../edge-architecture): full chain from internet to backend services
- [Synthetic probe](./synthetic-probe): outside-in liveness check that traverses this tunnel
- [veta-auto-pull](./veta-auto-pull): the deploy mechanism that runs on the homelab
