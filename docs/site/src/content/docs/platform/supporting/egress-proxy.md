---
title: Egress proxy
description: Allowlisting HTTP proxy and NTP relay that is the only route to the internet for application containers.
---

The `egress-proxy` container is the single point through which application
services reach the internet. It runs Squid with a destination allowlist and a
UDP relay for the gateway's SNTP clock check. Everything that is not on the
allowlist is refused with `403`.

## Networks

| Network | Internet route | Members |
| --- | --- | --- |
| `trading-net` | None (`internal: true`) | Every service |
| `egress-net` | None (`internal: true`); only `egress-proxy` can forward traffic out | `egress-proxy`, `gateway`, `market-data`, `discord-bot` |
| `internet-net` | Direct | `egress-proxy`, `traefik`, `ollama-model-pull` |

`traefik` keeps a direct route because it publishes ports 80 and 443, which
Docker cannot do on an internal network. `ollama-model-pull` runs once at
startup to download a model and exits; it is the remaining direct-egress
exception and is noted in the threat model.

## Allowlist

The allowlist lives at `docker/egress-proxy/allowlist.txt` and is baked into
the image, so a change is a reviewed pull request and a redeploy, not a
runtime edit. A leading dot matches the domain and its subdomains.

| Entry | Used by |
| --- | --- |
| `.discord.com`, `.discord.gg` | `gateway` webhook notifier, `discord-bot` REST and WebSocket |
| `.polygon.io`, `.tiingo.com`, `.alphavantage.co` | `market-data` quote providers |
| `.finnhub.io` | `market-data-adapters` provider, when that service is given egress |

Only ports 80 and 443 are accepted, and `CONNECT` only to 443. Squid does not
cache, strips `X-Forwarded-For` and sends no `Via` header, so the proxy does
not leak internal addresses to the destination.

## How services use it

Each proxied service receives `EGRESS_PROXY_URL=http://egress-proxy:3128`.
`#veta/bootstrap`, imported first by every service, installs a global undici
dispatcher that routes any request whose host name contains a dot through the
proxy and everything else (bare Compose service names, `localhost`, IP
literals) directly. No call site changes, and services that are not given the
variable behave as before.

`discord-bot` opens its WebSocket with `node:https`, which undici does not
cover, so it also receives `HTTPS_PROXY`, `NO_PROXY=localhost,127.0.0.1` and
`NODE_USE_ENV_PROXY=1`.

## NTP relay

The gateway's RTS 25 clock check is UDP, which an HTTP proxy cannot carry.
The proxy container runs `socat` forwarding UDP port 123 to the server named
in `NTP_SERVER` (default `pool.ntp.org`), and the gateway's `NTP_SERVER` is
set to `egress-proxy`. The relay forwards only to that one upstream.

## Health and logs

The health check asks the proxy for a destination that is not on the list
and expects `403`: a healthy proxy is one that refuses. Squid's access log is
streamed to the container log; `TCP_DENIED/403` lines show what a service
tried to reach and could not.

```bash
scripts/veta-compose.sh logs --tail 50 egress-proxy | grep TCP_DENIED
```

A denied line for a legitimate destination means the allowlist needs an
entry. A denied line for anything else is worth an incident entry: a service
tried to reach somewhere it has no business reaching.

## Adding a destination

1. Add the domain to `docker/egress-proxy/allowlist.txt` with a leading dot.
2. State in the pull request which service needs it and why.
3. After deploy, confirm with the service's own health or logs, and check the
   proxy log shows `TCP_TUNNEL/200` for the new host.
