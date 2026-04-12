---
title: API Gateway
description: The Gateway is the sole entry point for all browser traffic.
---

The Gateway (port 5011) is the sole entry point for all browser traffic. All routes require a valid `veta_user` session cookie except `/health` and `/ready`.

## Health & readiness

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Service health check |
| GET | `/ready` | No | All-services readiness with per-service status |
| GET | `/system` | No | Disk usage, memory stats |

## WebSocket

| Path | Description |
|------|-------------|
| `/ws` | Main gateway WebSocket — market updates, order events, auth identity |
| `/ws/market-sim` | Raw market-sim WebSocket proxy |

## Proxy routes

All `/api/{service}/*` routes are proxied to the corresponding backend service via the `SVC_PROXY` map. Supported methods: GET, POST, PUT, DELETE.

Example: `GET /api/journal/orders` → proxied to `http://localhost:5009/orders`

## Authentication flow

```
1. POST /api/user-service/oauth/authorize → get authorization code
2. POST /api/user-service/oauth/token → exchange for session cookie
3. Browser connects to /ws → cookie validated → authIdentity event sent
4. Every HTTP proxy request → cookie re-validated (10s cache)
```
