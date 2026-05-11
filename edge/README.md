# VETA edge ingress

Public-facing Traefik that terminates TLS for `veta.mnetcs.com` and forwards
to the homelab via an SSH reverse tunnel.

The homelab is on a private LAN (`192.168.1.0/24`) with no inbound port
forward. The homelab opens an outbound `autossh` connection to this box
and reverse-forwards its Traefik (port 443) to `127.0.0.1:18443` here.
This box terminates Let's Encrypt TLS on `:443` and proxies into the
tunnel.

```
internet
   │
   ▼ HTTPS
ovh.agileview.co.uk (37.187.109.170)         ← THIS BOX
   Traefik :443 (LE HTTP-01 cert)
            │
            ▼ HTTPS (origin cert self-signed, skipped)
   127.0.0.1:18443 ← sshd reverse-forward
            │
            ▼ via SSH tunnel (autossh dialled out from homelab)
   homelab Traefik :443 (192.168.1.245)
            │
            ▼
   frontend / gateway / etc.
```

## One-time install

```bash
# Clone the repo
git clone https://github.com/milesburton/veta-trading-platform.git /opt/veta-edge
cd /opt/veta-edge/edge

# Set ACME registration email (required)
echo "ACME_EMAIL=miles.burton@gmail.com" | sudo tee /opt/veta-edge/edge/.env

# Bring up Traefik
sudo docker compose up -d
```

The first request to `https://veta.mnetcs.com/` triggers an HTTP-01
challenge. Traefik handles the challenge on `:80` automatically — port 80
must be reachable from the internet (which it is on this box's public
IP). The cert is cached in the `letsencrypt` Docker volume and renews
automatically before expiry.

## DNS prerequisite

Cloudflare → `mnetcs.com` → DNS → add:

| Field | Value |
|---|---|
| Type | A |
| Name | `veta` |
| IPv4 | `37.187.109.170` |
| Proxy | **DNS only** (grey cloud) |
| TTL | Auto |

Don't enable Cloudflare proxy yet — `dynamic.yml` rate-limit middleware
is configured with `ipStrategy.depth: 0`. If proxied later, bump `depth`
to match the proxy chain or rate-limiting keys on Cloudflare's edge IP.

## Tunnel user (already provisioned)

`veta-tunnel` is a system user on this box whose `authorized_keys`
permits one operation only: open a reverse-forward of port 18443 to the
homelab. The homelab's `veta-tunnel.service` (see
`scripts/homelab-systemd/`) maintains this connection.

```
restrict,port-forwarding,permitlisten="18443" ssh-ed25519 ...
```

If the homelab is rebuilt, generate a new keypair and replace the line
above.

## Day-to-day

```bash
# Status
sudo docker compose ps
sudo docker compose logs --tail 50 traefik

# Update config without restart
# (traefik watches dynamic.yml; static traefik.yml needs a restart)
sudo docker compose restart traefik

# Pull a newer Traefik image
sudo docker compose pull && sudo docker compose up -d

# Cert state
sudo docker compose exec traefik cat /letsencrypt/acme.json | head
```

## Verifying the chain end-to-end

```bash
# 1. SSH tunnel is up — port 18443 should be listening on loopback
sudo ss -tlnp | grep :18443

# 2. Traefik reaches the tunnel
curl -ks https://127.0.0.1:18443/health
# should be 200 from the homelab gateway

# 3. Public hostname serves a real LE cert
curl -v https://veta.mnetcs.com/health 2>&1 | grep -E "issuer|HTTP"
# expect: issuer: C=US, O=Let's Encrypt, CN=R3 (or similar)
```

If `:18443` is missing on the OVH side, check the homelab:
```
ssh miles@192.168.1.245 'systemctl status veta-tunnel.service'
```

## Threat model boundary

This box is the only public-internet-facing component of VETA. Once
something is reachable through it, it's reachable from the entire
internet — no LAN-only assumption applies past this point.

Concrete implications:
- Apache is disabled (was the default install, no real site).
- UFW is **not yet configured**; relies on OVH's default firewall posture
  and the absence of other listeners on `:80`/`:443`. Add UFW rules
  before going wider than friends-and-family.
- The `veta-tunnel` user has `/bin/false` as shell and restricted
  authorized_keys; it cannot open a shell or forward arbitrary ports.
- A separate security audit (deferred) should walk the gateway's auth
  surface before broadcasting the URL publicly.
