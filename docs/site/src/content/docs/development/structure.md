---
title: Project Structure
description: How the codebase is organised.
---

```
veta-trading-platform/
├── backend/
│   ├── db/migrations/       # PostgreSQL migrations (0001-0012)
│   ├── src/
│   │   ├── lib/             # Shared utilities (@veta/*)
│   │   │   ├── http.ts      # CORS, json(), corsOptions()
│   │   │   ├── auth.ts      # getCookieToken()
│   │   │   ├── db.ts        # PostgreSQL pool instances
│   │   │   ├── messaging.ts # Redpanda producer/consumer
│   │   │   ├── marketSimClient.ts
│   │   │   ├── gridQuery.ts
│   │   │   ├── settlement.ts
│   │   │   └── timeScale.ts
│   │   ├── types/           # Shared type definitions
│   │   │   ├── orders.ts    # RoutedOrder, FillEvent
│   │   │   ├── intelligence.ts
│   │   │   ├── llm-advisory.ts
│   │   │   └── types.ts     # Trade
│   │   ├── algo/            # 9 algo strategy services
│   │   ├── analytics/       # Black-Scholes, Monte Carlo
│   │   ├── gateway/         # API Gateway (BFF)
│   │   ├── oms/             # Order Management System
│   │   ├── ems/             # Execution Management System
│   │   ├── risk-engine/     # Pre-trade risk checks
│   │   ├── journal/         # Trade lifecycle journal
│   │   ├── replay/          # Session replay service
│   │   ├── user-service/    # OAuth2, RBAC
│   │   ├── market-sim/      # Market data simulator
│   │   ├── fix/             # FIX 4.2 exchange + archive
│   │   └── tests/           # Unit, integration, smoke tests
│   └── ...
├── frontend/
│   ├── src/
│   │   ├── auth/            # RBAC (rbac.ts)
│   │   ├── components/      # React components (50+ panels)
│   │   │   └── dashboard/   # Panel registry, layout models
│   │   ├── domain/          # Business logic (ticket rules)
│   │   ├── hooks/           # Custom React hooks
│   │   ├── lib/             # Session recorder (rrweb)
│   │   ├── store/           # Redux slices + RTK Query APIs
│   │   ├── types/           # Frontend type definitions
│   │   └── utils/           # Shared formatters
│   ├── tests/               # Playwright E2E tests
│   │   └── helpers/         # GatewayMock, page objects
│   └── tests-electron/      # Electron E2E tests
├── docs/
│   ├── site/                # Astro + Starlight docs site
│   ├── screenshots/         # Auto-generated UI screenshots
│   └── badges/              # CI badge JSON files
├── deno.json                # Import map + tasks
├── supervisord.conf         # Local dev process manager
├── supervisord.fly.conf     # Fly.io process manager
├── Dockerfile.fly           # Fly.io monolith image
└── fly.toml                 # Fly.io deployment config
```
