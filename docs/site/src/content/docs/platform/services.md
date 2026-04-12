---
title: Service Map
description: Every backend service, its port, and what it does.
---

| Port | Service | Process | Role |
|------|---------|---------|------|
| 5000 | Market Simulator | `market-sim` | GBM price engine, real-data seeding |
| 5001 | EMS | `ems` | Execution management, FIX bridge |
| 5002 | OMS | `oms` | Order validation, routing, RBAC limits |
| 5003 | LIMIT Algo | `algo-trader` | Limit order monitoring |
| 5004 | TWAP Algo | `twap-algo` | Time-weighted average price slicing |
| 5005 | POV Algo | `pov-algo` | Percent-of-volume participation |
| 5006 | VWAP Algo | `vwap-algo` | Volume-weighted average price |
| 5007 | Observability | `observability` | Kafka relay for event logging |
| 5008 | User Service | `user-service` | OAuth2, RBAC, session management |
| 5009 | Journal | `journal` | PostgreSQL trade lifecycle store |
| 5011 | Gateway (BFF) | `gateway` | WebSocket hub, HTTP proxy, auth |
| 5012 | FIX Archive | `fix-archive` | FIX execution report persistence |
| 5013 | News Aggregator | `news-aggregator` | Market news with sentiment scoring |
| 5014 | Analytics | `analytics` | Black-Scholes, Monte Carlo, recommendations |
| 5015 | Market Data | `market-data-service` | Alpha Vantage, Polygon, Tiingo polling |
| 5016 | Market Data Adapters | `market-data-adapters` | Earnings, economic event adapters |
| 5017 | Feature Engine | `feature-engine` | Real-time feature vector computation |
| 5018 | Signal Engine | `signal-engine` | Signal scoring from features |
| 5019 | Recommendation Engine | `recommendation-engine` | Rule-based trade recommendations |
| 5020 | Scenario Engine | `scenario-engine` | Factor shock scenario analysis |
| 5021 | ICEBERG Algo | `iceberg-algo` | Hidden order iceberg execution |
| 5022 | SNIPER Algo | `sniper-algo` | Multi-venue smart order routing |
| 5023 | ARRIVAL_PRICE Algo | `arrival-price-algo` | Arrival price benchmark execution |
| 5024 | LLM Advisory | `llm-advisory` | Natural language trade commentary (Ollama) |
| 5025 | MOMENTUM Algo | `momentum-algo` | EMA crossover signal-driven |
| 5026 | IS Algo | `is-algo` | Implementation shortfall minimisation |
| 5027 | Dark Pool | `dark-pool` | Simulated dark pool crossing network |
| 5028 | CCP | `ccp-service` | Central counterparty clearing |
| 5029 | RFQ | `rfq-service` | Request for quote workflow |
| 5031 | Session Replay | `replay-service` | rrweb session recording and playback |
| 5032 | Risk Engine | `risk-engine` | Pre-trade risk checks (6 checks) |
| 9880 | FIX Exchange | `fix-exchange` | Simulated FIX 4.2 matching engine |
