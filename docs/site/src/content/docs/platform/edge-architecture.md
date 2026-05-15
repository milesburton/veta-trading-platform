---
title: Edge architecture
description: How public traffic reaches the homelab — OVH edge box, reverse SSH tunnel, Traefik chain, and the synthetic probe that watches the path end-to-end.
---

The homelab sits on a private LAN with no inbound NAT. Public traffic
reaches it via a **reverse SSH tunnel** that the homelab dials *out* to
an OVH dedicated server. The OVH box terminates TLS, forwards into the
tunnel, and the homelab's internal Traefik routes to services from there.

This page documents the full chain end-to-end. For day-to-day operation
of the trading services see [Architecture](../architecture). For the
liveness probe that watches this chain see
[Synthetic probe](../supporting/synthetic-probe).

## The chain

```
internet
   │
   ▼ HTTPS :443
ovh.agileview.co.uk (37.187.109.170)            ← OVH edge box
   • Traefik v3.3 (network_mode: host)
   • Let's Encrypt TLS for veta.mnetcs.com
   • single backend: https://localhost:18443
            │
            ▼ HTTPS (self-signed, verify skipped — see below)
   localhost:18443 ← sshd reverse-forward listener
            │
            ▼ over the SSH tunnel
   autossh on the homelab dialled OUT
   ssh -R 18443:localhost:443 veta-tunnel@ovh.agileview.co.uk
            │
            ▼
   homelab Traefik :443 (private LAN address)
   • reads Docker labels via /var/run/docker.sock
   • matches by PathPrefix (no Host header check — anything
     reaching :443 routes)
            │
            ▼
   frontend / gateway / journal / etc.
```

## OVH edge box

A single OVH dedicated server (`ovh.agileview.co.uk`, public IP
`37.187.109.170`). The same machine that serves the `mnetcs.com` /
`agileview.co.uk` sites — VETA is one of several tenants. The synthetic
probe also runs here (see [Synthetic probe](../supporting/synthetic-probe)).

Source: [`edge/`](https://github.com/milesburton/veta-trading-platform/tree/main/edge)

### Traefik configuration

Static config in [`edge/traefik.yml`](https://github.com/milesburton/veta-trading-platform/blob/main/edge/traefik.yml):

- `:80` web entrypoint — redirects everything to `:443`
- `:443` websecure entrypoint
- Dashboard disabled (`api.dashboard: false`)
- ACME `letsencrypt` resolver using HTTP-01 challenge on `:80`
- `serversTransport.insecureSkipVerify: true` — see below

Dynamic config in [`edge/dynamic.yml`](https://github.com/milesburton/veta-trading-platform/blob/main/edge/dynamic.yml):

- Single router: `Host(\`veta.mnetcs.com\`)` → backend `https://localhost:18443`
- Rate-limit middleware: 60 req/avg, 120 burst, sourced from client IP
  (`ipStrategy.depth: 0` — trusts no proxies; correct when Cloudflare
  proxy is in DNS-only mode)
- Security-headers middleware: HSTS preload, CSP, frame-deny, etc.

### Why `insecureSkipVerify: true` is correct here

The destination is `localhost:18443`, reached only via the SSH reverse
tunnel from the homelab. The homelab Traefik presents a self-signed cert
on `:443`, and the SSH transport provides the real security. Cert
verification at this hop would be meaningless (it'd require shipping the
homelab's CA to OVH) and would not improve security.

**Do not "fix" this without redesigning the tunnel.**

## The reverse SSH tunnel

Maintained by `autossh` running on the homelab. The connection is
*dialled out from the homelab* — nothing inbound to the home router is
ever needed.

### How it works

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

The `-R 18443:localhost:443` reverse-forward tells the OVH SSH daemon
to listen on `localhost:18443` and forward any connection to the
homelab's `:443`. `autossh` restarts the underlying `ssh` if it
exits (network blip, OVH reboot, etc.).

### Restricted tunnel user on OVH

The homelab's public key on OVH lives under user `veta-tunnel` with a
single `authorized_keys` entry:

```
restrict,port-forwarding,permitlisten="18443" ssh-ed25519 AAAAC3N...
```

- `restrict` denies pty / X11 / agent / user-rc / exec by default
- `port-forwarding` re-enables the one capability we need
- `permitlisten="18443"` allows reverse-forwarding only to port 18443

If the homelab is ever compromised, the worst an attacker can do via this
key is hold port 18443 open on the OVH edge — no shell, no other
forwards. They'd see the inbound HTTPS connections proxied through the
tunnel, but that's the public traffic anyway.

For install instructions see
[veta-tunnel.service](../supporting/veta-tunnel).

## Homelab Traefik

Once the request crosses the tunnel and arrives at the homelab's :443
port, the **homelab Traefik** routes it to one of ~30 backend services
based on PathPrefix labels on each Docker container.

Notably the homelab Traefik **does not match on Host headers** — anything
that reaches its :443 entrypoint is treated as VETA traffic. This is safe
because nothing else can reach :443 on the homelab (private LAN, no
inbound NAT).

The homelab Traefik shares its docker network with two off-repo compose
projects (caddy serving the milesburton.com wiki, lgtm-grafana for the
Grafana sub-path). See
[Traefik](../supporting/traefik) for the routing detail.

## DNS

```
veta.mnetcs.com.    A    37.187.109.170    (OVH dedicated server)
```

Cloudflare manages the `mnetcs.com` zone but is in **DNS-only mode**
(grey cloud) for `veta.mnetcs.com`. The rate-limit middleware on the
edge Traefik trusts no proxies (`ipStrategy.depth: 0`), so enabling the
orange cloud would collapse all visitors' apparent IPs to Cloudflare
edge nodes and break per-IP rate limiting.

## Failure modes the synthetic probe catches

- **Edge Traefik dead** → all HTTPS connections fail at TLS handshake
- **SSH tunnel down** → edge Traefik returns 502 (no backend listening on
  `localhost:18443`)
- **Homelab Traefik dead** → edge Traefik can connect through the tunnel
  but the request hangs or returns connection-reset
- **Homelab gateway / user-service dead** → tunnel works, Traefik routes,
  service returns 5xx or doesn't respond

Each of these surfaces within 3 probe cycles (~3 min) as a webhook
alert. See [Synthetic probe](../supporting/synthetic-probe) for the alert
plumbing.

## Failure modes the synthetic probe does **not** catch

- **TLS cert near expiry but not yet expired** — Let's Encrypt auto-renews;
  add a separate monitor if this becomes a concern
- **DDoS exhausting rate-limit buckets** — the probe shares the rate-limit
  bucket with everyone else on its IP; it would fail along with real users
  but the alert would still fire
- **Slow-but-not-dead** — the probe has a 10s per-step timeout; a service
  responding in 8s would pass

## Threat-model implications

The OVH edge is the only public-internet-facing component of VETA. Once
something is reachable through it, it's reachable from the entire
internet — no LAN-only assumption applies past this point.

Concrete implications:

- The `veta-tunnel` user has `/bin/false` as shell and restricted
  `authorized_keys`; it cannot open a shell or forward arbitrary ports.
- UFW on the OVH box is **not yet configured**; relies on the absence of
  other listeners on `:80`/`:443` and OVH's default firewall posture.
  Add UFW rules before going wider than friends-and-family.
- A separate security audit (deferred) should walk the gateway's auth
  surface before broadcasting the URL publicly.

See [Security posture](./security) and
[Threat model](./threat-model).

## Install / rebuild

If the OVH box is rebuilt from scratch, follow these in order:

1. Clone repo to OVH, install Traefik via `edge/compose.yml` —
   see [edge install](../platform/supporting/edge-traefik)
2. Provision a dedicated `veta-tunnel` user on OVH with restricted
   `authorized_keys` — see [veta-tunnel.service](../supporting/veta-tunnel)
3. Generate the tunnel keypair on the homelab and install
   `veta-tunnel.service` there — same page as step 2

After ~30 s the tunnel is up and `https://veta.mnetcs.com/` is live.

For the homelab side of deployment (auto-pull, prune, etc.) see:

- [veta-auto-pull](../supporting/veta-auto-pull) — main → homelab continuous deploy
- [veta-host-prune](../supporting/veta-host-prune) — weekly Docker prune
- [Synthetic probe](../supporting/synthetic-probe) — outside-in liveness check
