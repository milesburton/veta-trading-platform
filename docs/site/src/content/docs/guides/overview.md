---
title: Overview
description: What VETA is and what it provides.
---

VETA is a near real-world equities and fixed income trading platform. It enables paper trading through the platform's algorithmic execution services and is designed to support practical market-structure learning.

## What's included

- **React frontend** with Tailwind, FlexLayout drag-and-drop panels, and multiple workspaces
- **9 algo strategies** (LIMIT, TWAP, VWAP, POV, ICEBERG, SNIPER, ARRIVAL_PRICE, IS, MOMENTUM)
- **Pre-trade risk engine** with 6 real-time checks
- **Market simulator** generating GBM price paths seeded with real market data
- **FIX 4.2 exchange** simulation with execution reports
- **Analytics engine** (Black-Scholes, Monte Carlo, yield curves, vol surfaces)
- **Intelligence pipeline** (feature engine, signal engine, recommendation engine)
- **LLM advisory** via Ollama (optional)
- **Session replay** powered by rrweb
- **OAuth2 authentication** with PKCE and role-based access control
- **Electron desktop app** with pop-out panels and native menus

## Architecture

The platform is a collection of Deno microservices connected by a Redpanda (Kafka-compatible) message bus. The React frontend talks to a single API Gateway — the only service the browser can reach.

```
Frontend → Gateway (WebSocket + HTTP) → Redpanda bus → Services
```

See [Architecture](/veta-trading-platform/platform/architecture/) for the full service map.

## Technology stack

Deno, TypeScript, React, Redux Toolkit, Tailwind CSS, FlexLayout, Vite, Electron, PostgreSQL, SQLite (WAL), Redpanda (Kafka), FIX 4.2, Playwright, Docker, Traefik, AG Grid, rrweb, and Ollama.

## Key documents

For the curated key-document list, see the docs home page: [VETA documentation](/veta-trading-platform/).
