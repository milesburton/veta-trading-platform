---
title: veta-tunnel (reverse SSH tunnel)
description: autossh-managed reverse SSH tunnel that exposes the homelab publicly via the OVH edge box. The homelab dials out — no inbound NAT required.
---

The homelab sits on a private LAN (`192.168.1.0/24`) with **no inbound
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
  -R 18443:127.0.0.1:443 \
  veta-tunnel@ovh.agileview.co.uk
```

The `-R 18443:127.0.0.1:443` instructs the OVH SSH daemon to listen on
`127.0.0.1:18443` and forward connections back to the homelab's `:443`.
`autossh` restarts the underlying `ssh` if it exits — network blip,
OVH reboot, etc.

`-o ExitOnForwardFailure=yes` ensures `ssh` exits non-zero rather than
holding a connection open without the reverse forward bound — important
because we want `autossh` to retry rather than appear connected while
the public route is silently dead.

## Install — homelab side

```bash
# Install autossh
sudo apt-get install -y autossh

# Generate a dedicated keypair (separate from your personal SSH keys)
sudo install -d -m 0700 -o root -g root /etc/veta-tunnel
sudo ssh-keygen -t ed25519 -N "" -C veta-tunnel@homelab \
  -f /etc/veta-tunnel/id_ed25519

# Print the public key — paste this into the OVH edge box (next section)
sudo cat /etc/veta-tunnel/id_ed25519.pub

# Install + start the systemd unit
sudo install -m 0644 \
  /path/to/repo/scripts/homelab-systemd/veta-tunnel.service \
  /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now veta-tunnel.service
```

## Install — OVH side (tunnel user)

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

## Restricted `authorized_keys` line — what each part does

```
restrict,port-forwarding,permitlisten="18443" ssh-ed25519 AAAAC3N...
```

| Option | Effect |
|---|---|
| `restrict` | Denies pty / X11 / agent-forwarding / user-rc / `exec` by default. Equivalent to `no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding,no-exec` |
| `port-forwarding` | Re-enables the *one* forwarding capability we need |
| `permitlisten="18443"` | Allows the reverse-forward to bind only port 18443. Any other `-R` request is rejected. |

If the homelab is ever compromised, the worst an attacker can do via
this key is hold port 18443 open on OVH — no shell, no other forwards.
They'd see the inbound HTTPS connections proxied through the tunnel,
but that's the public traffic anyway.

## Daily use

```bash
# Status
systemctl status veta-tunnel.service

# Recent activity (reconnects, network blips)
journalctl -u veta-tunnel.service -n 50 --no-pager

# Restart (e.g. after rotating keys)
sudo systemctl restart veta-tunnel.service

# Quick health check — port 18443 should be listening on the OVH side
ssh ubuntu@ovh.agileview.co.uk 'ss -tlnp | grep :18443'

# From inside the homelab — make sure the local :443 is up too
ss -tlnp | grep :443
```

## Failure modes

| Symptom | Likely cause |
|---|---|
| Edge Traefik returns 502 | Tunnel down. Check `journalctl -u veta-tunnel` |
| Tunnel runs but public URL returns 503 from homelab Traefik | Homelab Traefik dead — separate problem |
| Tunnel restarts every few seconds | OVH SSH daemon rejecting the key. Check `journalctl -u veta-tunnel` for the error |
| Tunnel runs but `:18443` not listening on OVH | `permitlisten` mismatch, or sshd rejected the `-R` request |

The [synthetic probe](./synthetic-probe) catches all four classes within
~3 min as a webhook alert.

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
- [`edge/README.md`](https://github.com/milesburton/veta-trading-platform/blob/main/edge/README.md) — original OVH-side documentation

## Related

- [Edge architecture](../edge-architecture) — full chain from internet to backend services
- [Synthetic probe](./synthetic-probe) — outside-in liveness check that traverses this tunnel
- [veta-auto-pull](./veta-auto-pull) — the deploy mechanism that runs on the homelab
