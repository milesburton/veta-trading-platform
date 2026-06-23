---
title: Traefik
description: Ingress proxy that fronts every backend service.
---

Traefik is the ingress proxy for every deployment. It listens on port 80 and exposes a dashboard on port 8888. Public traffic for the deployment URL and the Grafana subpath at `/grafana/` is delivered via a secure tunnel from the edge server into this Traefik instance.

## Routing

Routes are declared via Docker labels on each service. A typical service block adds:

```yaml
labels:
  - "traefik.http.routers.<svc>.rule=PathPrefix(`/api/<svc>`)"
  - "traefik.http.routers.<svc>.middlewares=<svc>-strip"
  - "traefik.http.middlewares.<svc>-strip.stripprefix.prefixes=/api/<svc>"
  - "traefik.http.services.<svc>.loadbalancer.server.port=<port>"
```

Traefik does **not** match on `Host` headers, so any hostname or IP that resolves to the host works. That keeps the LAN dev experience straightforward, so a LAN IP and the public hostname are interchangeable.

## TLS

| Environment | TLS terminator |
| --- | --- |
| `local` (devcontainer) | none (plain HTTP) |
| `production` | Edge server terminates TLS, then tunnels HTTP into server Traefik |

## Dashboard

The dashboard is exposed at `http://<host>:8888/dashboard/`. It is **not** behind auth: only LAN-reachable on the server, and not exposed publicly. The Service Health panel surfaces it on `local` deployments only; on production it is hidden because the dashboard port is not reachable from a remote browser even though the proxy itself is healthy.
