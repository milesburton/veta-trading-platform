---
title: Architecture
description: Event-driven microservices connected by a Redpanda message bus.
---

VETA is a multi-service trading platform connected by a **Redpanda message bus** (Kafka-compatible). The React frontend talks to a single **API Gateway** — the only service the browser can reach. Everything else communicates via bus topics.

## High-level flow

```
React Frontend (Vite / Electron)
        |
        | WebSocket + HTTP
        v
   API Gateway :5011  (BFF — single entry point)
        |
        | pub/sub via Redpanda :9092
        v
+-------+--------+--------+--------+--------+--------+
|       |        |        |        |        |        |
v       v        v        v        v        v        v
Market  OMS     Algo     EMS     Journal  FIX      Analytics
Sim    :5002   :5003-   :5001   :5009    Exchange  :5014
:5000          :5026                     :9880
```

## Order flow

```
User submits order in the OrderTicket
  → WebSocket submitOrder → Gateway
  → orders.new published to bus
  → OMS validates: role, desk access, user limits, strategy
  → Risk-engine: fat-finger, duplicate, self-cross, rate-limit, ADV, max-open
  → orders.submitted + orders.routed published
  → Algo picks up orders.routed (matched by strategy tag)
  → Algo produces child slices → orders.child
  → EMS fills against market-sim → orders.filled
  → FIX execution reports → fix-archive
  → Journal persists the full lifecycle
```

## Bus topics

| Category | Topics |
|----------|--------|
| Trading | `orders.new`, `orders.submitted`, `orders.routed`, `orders.child`, `orders.filled`, `orders.expired`, `orders.rejected`, `orders.cancelled` |
| Algo | `algo.heartbeat` |
| FIX | `fix.execution` |
| News | `news.feed`, `news.signal` |
| Intelligence | `market.features`, `market.signals`, `market.recommendations` |

## Authentication

Sessions are stored as `veta_user` HTTP-only cookies set by the User Service via OAuth2 authorization-code flow with PKCE. The Gateway validates this cookie on every request (cached 10 seconds). The OMS independently fetches limits from the User Service (cached 30 seconds).

Roles: `trader`, `desk-head`, `risk-manager`, `admin`, `compliance`, `sales`, `external-client`, `viewer`. Only `trader` can submit orders.

See [RBAC & Permissions](/veta-trading-platform/reference/rbac/) and [Trading Styles](/veta-trading-platform/reference/trading-styles/) for details.
