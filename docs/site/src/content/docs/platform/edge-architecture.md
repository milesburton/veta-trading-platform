---
title: Edge architecture
description: How public traffic reaches the server via the edge server, secure tunnel, Traefik chain, and the synthetic probe that watches the path end-to-end.
---

The server sits on a private LAN with no inbound NAT. Public traffic
reaches it via a **secure tunnel** that the server dials *out* to
the edge server. The edge server terminates TLS, forwards into the
tunnel, and the server's internal Traefik routes to services from there.

This page documents the full chain end-to-end. For day-to-day operation
of the trading services see [Architecture](../architecture). For the
liveness probe that watches this chain see
[Synthetic probe](../supporting/synthetic-probe).

## The chain

```mermaid
graph TD
    USER["Internet user"]:::client
    EDGE["<edge-server> (edge server)<br/><i>Traefik v3.3 host-mode<br/>Let's Encrypt TLS<br/>backend: https://localhost:18443</i>"]:::edge
    LOCAL["localhost:18443<br/><i>sshd reverse-forward listener</i>"]:::edge
    TUNNEL["autossh on the server dialled OUT<br/><i>ssh -R 18443:localhost:443 veta-tunnel@edge</i>"]:::edge
    HL["Server Traefik :443<br/><i>private LAN address<br/>reads Docker labels<br/>matches by PathPrefix</i>"]:::gateway
    SVC["frontend / gateway / journal / etc."]:::support

    USER -->|"HTTPS :443"| EDGE
    EDGE -->|"HTTPS, self-signed verify skipped"| LOCAL
    LOCAL -->|"over the SSH tunnel"| TUNNEL
    TUNNEL --> HL
    HL --> SVC

    classDef client fill:#818cf8,stroke:#6366f1,color:#fff
    classDef edge fill:#a78bfa,stroke:#7c3aed,color:#fff
    classDef gateway fill:#f59e0b,stroke:#d97706,color:#000
    classDef support fill:#94a3b8,stroke:#64748b,color:#000
```

## Edge server

A single dedicated edge server (`<edge-server>`). VETA is one of several tenants. The synthetic
probe also runs here (see [Synthetic probe](../supporting/synthetic-probe)).

Source: [`edge/`](https://github.com/milesburton/veta-trading-platform/tree/main/edge)

### Traefik configuration

Static config in [`edge/traefik.yml`](https://github.com/milesburton/veta-trading-platform/blob/main/edge/traefik.yml):

- `:80` web entrypoint redirects everything to `:443`
- `:443` websecure entrypoint
- Dashboard disabled (`api.dashboard: false`)
- ACME `letsencrypt` resolver using HTTP-01 challenge on `:80`
- `serversTransport.insecureSkipVerify: true` (see below)

Dynamic config in [`edge/dynamic.yml`](https://github.com/milesburton/veta-trading-platform/blob/main/edge/dynamic.yml):

- Single router: ``Host(`veta.mnetcs.com`)`` to backend `https://localhost:18443`
- Rate-limit middleware: 60 req/avg, 120 burst, sourced from client IP
  (`ipStrategy.depth: 0` trusts no proxies; correct when Cloudflare
  proxy is in DNS-only mode)
- Security-headers middleware: HSTS preload, CSP, frame-deny, etc.

### Why `insecureSkipVerify: true` is correct here

The destination is `localhost:18443`, reached only via the SSH reverse
tunnel from the server. The server Traefik presents a self-signed cert
on `:443`, and the SSH transport provides the real security. Cert
verification at this hop would be meaningless (it'd require shipping the
server's CA to the edge server) and would not improve security.

Do not "fix" this without redesigning the tunnel.

## The secure tunnel

Maintained by `autossh` running on the server. The connection is
*dialled out from the server*, so nothing inbound to the home router is
ever needed.

### How it works

```bash
# Runs as veta-tunnel.service on the server:
autossh -M 0 -N \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes \
  -o IdentitiesOnly=yes \
  -i /etc/veta-tunnel/id_ed25519 \
  -R 18443:localhost:443 \
  veta-tunnel@<edge-server>
```

The `-R 18443:localhost:443` reverse-forward tells the edge SSH daemon
to listen on `localhost:18443` and forward any connection to the
server's `:443`. `autossh` restarts the underlying `ssh` if it
exits (network blip, edge server reboot, etc.).

### Restricted tunnel user on the edge server

The server's public key on the edge server lives under user `veta-tunnel` with a
single `authorized_keys` entry:

```
restrict,port-forwarding,permitlisten="18443" ssh-ed25519 AAAAC3N...
```

- `restrict` denies pty / X11 / agent / user-rc / exec by default
- `port-forwarding` re-enables the one capability we need
- `permitlisten="18443"` allows reverse-forwarding only to port 18443

If the server is ever compromised, the worst an attacker can do via this
key is hold port 18443 open on the edge server. No shell, no other
forwards. They'd see the inbound HTTPS connections proxied through the
tunnel, but that's the public traffic anyway.

For install instructions see
[veta-tunnel.service](../supporting/veta-tunnel).

## Server Traefik

Once the request crosses the tunnel and arrives at the server's :443
port, the **server Traefik** routes it to one of ~30 backend services
based on PathPrefix labels on each Docker container.

Notably the server Traefik does not match on Host headers. Anything
that reaches its :443 entrypoint is treated as VETA traffic. This is safe
because nothing else can reach :443 on the server (private LAN, no
inbound NAT).

The server Traefik shares its docker network with two off-repo compose
projects. See
[Traefik](../supporting/traefik) for the routing detail.

## DNS

The DNS zone is managed via Cloudflare in **DNS-only mode**
(grey cloud) for the deployment URL. The rate-limit middleware on the
edge Traefik trusts no proxies (`ipStrategy.depth: 0`), so enabling the
orange cloud would collapse all visitors' apparent IPs to Cloudflare
edge nodes and break per-IP rate limiting.

## Failure modes the synthetic probe catches

- **Edge Traefik dead**: all HTTPS connections fail at TLS handshake
- **Secure tunnel down**: edge Traefik returns 502 (no backend listening on
  `localhost:18443`)
- **Server Traefik dead**: edge Traefik can connect through the tunnel
  but the request hangs or returns connection-reset
- **Server gateway / user-service dead**: tunnel works, Traefik routes,
  service returns 5xx or doesn't respond

Each of these surfaces within 3 probe cycles (~3 min) as a webhook
alert. See [Synthetic probe](../supporting/synthetic-probe) for the alert
plumbing.

## Failure modes the synthetic probe does **not** catch

- **TLS cert near expiry but not yet expired**: Let's Encrypt auto-renews;
  add a separate monitor if this becomes a concern
- **DDoS exhausting rate-limit buckets**: the probe shares the rate-limit
  bucket with everyone else on its IP; it would fail along with real users
  but the alert would still fire
- **Slow-but-not-dead**: the probe has a 10s per-step timeout; a service
  responding in 8s would pass

## Threat-model implications

The edge server is the only public-internet-facing component of VETA. Once
something is reachable through it, it's reachable from the entire
internet. No LAN-only assumption applies past this point.

Concrete implications:

- The `veta-tunnel` user has `/bin/false` as shell and restricted
  `authorized_keys`; it cannot open a shell or forward arbitrary ports.
- UFW on the edge server is not yet configured; relies on the absence of
  other listeners on `:80`/`:443` and the host's default firewall posture.
  Add UFW rules before going wider than friends-and-family.
- A separate security audit (deferred) should walk the gateway's auth
  surface before broadcasting the URL publicly.

See [Security posture](../security/) and
[Threat model](../threat-model/).

## Install / rebuild

If the edge server is rebuilt from scratch, follow these in order:

1. Clone repo to the edge server, install Traefik via `edge/compose.yml`
   (see [edge install](../supporting/traefik/)).
2. Provision a dedicated `veta-tunnel` user on the edge server with restricted
   `authorized_keys` (see [veta-tunnel.service](../supporting/veta-tunnel)).
3. Generate the tunnel keypair on the server and install
   `veta-tunnel.service` there (same page as step 2).

After ~30 s the tunnel is up and the deployment URL is live.

For the server side of deployment (auto-pull, prune, etc.) see:

- [veta-auto-pull](../supporting/veta-auto-pull): main to server continuous deploy
- [veta-host-prune](../supporting/veta-host-prune): weekly Docker prune
- [Synthetic probe](../supporting/synthetic-probe): outside-in liveness check
