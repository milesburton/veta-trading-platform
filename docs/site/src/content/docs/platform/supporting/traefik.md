---
title: Traefik
description: Ingress proxy that fronts every backend service.
---

Traefik is the ingress proxy for every deployment except the Fly.io monolith. It listens on port 80 (and 443 in UAT with Let's Encrypt) and exposes a dashboard on port 8888.

## Routing

Routes are declared via Docker labels on each service. A typical service block adds:

```yaml
labels:
  - "traefik.http.routers.<svc>.rule=PathPrefix(`/api/<svc>`)"
  - "traefik.http.routers.<svc>.middlewares=<svc>-strip"
  - "traefik.http.middlewares.<svc>-strip.stripprefix.prefixes=/api/<svc>"
  - "traefik.http.services.<svc>.loadbalancer.server.port=<port>"
```

Traefik does **not** match on `Host` headers, so any hostname or IP that resolves to the host works. That keeps the LAN dev experience simple — a LAN IP and the public hostname are interchangeable.

## TLS

| Environment | TLS terminator |
|-------------|----------------|
| `local` (devcontainer) | none — plain HTTP |
| `uat` (private VM) | Traefik via Let's Encrypt (`ACME_EMAIL` required) |
| `fly` (public demo) | Fly edge — Traefik runs HTTP-only |

## Dashboard

The dashboard is exposed at `http://<host>:8888/dashboard/`. It is **not** behind auth — only LAN-reachable on UAT, and not exposed publicly. The Service Health panel surfaces it on `local` deployments only; on UAT it is hidden because the dashboard port is not reachable from a remote browser even though the proxy itself is healthy.
