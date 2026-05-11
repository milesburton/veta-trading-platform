---
title: Architecture
description: Event-driven microservices connected by a Redpanda message bus.
---

VETA is a multi-service trading platform connected by a **Redpanda message bus** (Kafka-compatible). The React frontend talks to a single **API Gateway** — the only service the browser can reach. Everything else communicates via bus topics.

## System architecture

The architecture is split into focused diagrams below. Each one fits the
text column at readable size; the previous single-diagram view became
unreadable as the service count grew. **Click any diagram to expand.**

### High-level: how a request flows

```mermaid
graph TD
    FE["React Frontend<br/><i>Vite / Electron</i>"]:::client
    GW["API Gateway :5011<br/><i>BFF — WebSocket hub + HTTP proxy</i>"]:::gateway
    KAFKA["Redpanda Message Bus :9092<br/><i>Kafka-compatible pub/sub</i>"]:::bus
    SVCS["~30 backend services<br/><i>see diagrams below</i>"]:::support

    FE <-->|"WebSocket + HTTP"| GW
    GW <-->|"pub/sub"| KAFKA
    KAFKA <--> SVCS

    classDef client fill:#818cf8,stroke:#6366f1,color:#fff
    classDef gateway fill:#f59e0b,stroke:#d97706,color:#000
    classDef bus fill:#64748b,stroke:#475569,color:#fff
    classDef support fill:#94a3b8,stroke:#64748b,color:#000
```

The frontend talks only to the gateway. The gateway is the only externally
reachable service. Everything else communicates via Kafka topics.

### Order management & execution

```mermaid
graph LR
    KAFKA["Redpanda :9092"]:::bus
    OMS["OMS :5002<br/><i>Validation + routing</i>"]:::trading
    RISK["Risk Engine :5032<br/><i>6 pre-trade checks</i>"]:::risk
    EMS["EMS :5001<br/><i>Execution + FIX bridge</i>"]:::trading
    FIXEX["FIX Exchange :9880<br/><i>Matching engine</i>"]:::fix
    JOURNAL["Journal :5009<br/><i>PostgreSQL store</i>"]:::storage
    FIXARC["FIX Archive :5012<br/><i>Execution reports</i>"]:::storage

    KAFKA -->|"orders.new"| OMS
    OMS -->|"POST /check"| RISK
    OMS -->|"orders.routed"| KAFKA
    KAFKA -->|"orders.routed"| EMS
    EMS --> FIXEX
    KAFKA -->|"orders.*"| JOURNAL
    EMS -->|"exec reports"| FIXARC

    classDef bus fill:#64748b,stroke:#475569,color:#fff
    classDef trading fill:#22c55e,stroke:#16a34a,color:#000
    classDef risk fill:#ef4444,stroke:#dc2626,color:#fff
    classDef fix fill:#f472b6,stroke:#ec4899,color:#000
    classDef storage fill:#2dd4bf,stroke:#14b8a6,color:#000
```

### Algo strategies — all 9 are independent Kafka consumers

```mermaid
graph TB
    KAFKA["Redpanda :9092"]:::bus
    subgraph row1[" "]
        direction LR
        LIMIT["LIMIT :5003"]:::algo
        TWAP["TWAP :5004"]:::algo
        POV["POV :5005"]:::algo
        VWAP["VWAP :5006"]:::algo
        ICEBERG["ICEBERG :5021"]:::algo
    end
    subgraph row2[" "]
        direction LR
        SNIPER["SNIPER :5022"]:::algo
        AP["ARRIVAL_PRICE :5023"]:::algo
        MOM["MOMENTUM :5025"]:::algo
        IS["IS :5026"]:::algo
    end
    KAFKA --> row1
    KAFKA --> row2

    classDef bus fill:#64748b,stroke:#475569,color:#fff
    classDef algo fill:#38bdf8,stroke:#0ea5e9,color:#000
    style row1 fill:none,stroke:none
    style row2 fill:none,stroke:none
```

### Market data, analytics & intelligence

```mermaid
graph LR
    KAFKA["Redpanda :9092"]:::bus
    MSIM["Market Sim :5000<br/><i>GBM price engine</i>"]:::market
    MDS["Market Data :5015<br/><i>Alpha Vantage / Polygon</i>"]:::market
    MDA["Adapters :5016<br/><i>Earnings + economic</i>"]:::market

    ANA["Analytics :5014<br/><i>Black-Scholes / Monte Carlo</i>"]:::analytics
    FE_ENG["Feature Engine :5017"]:::analytics
    SIG["Signal Engine :5018"]:::analytics
    REC["Recommendation :5019"]:::analytics
    SCEN["Scenario Engine :5020"]:::analytics

    MSIM --> KAFKA
    MDS --> KAFKA
    MDA --> KAFKA
    KAFKA --> ANA
    KAFKA --> FE_ENG
    KAFKA --> SIG
    KAFKA --> REC
    KAFKA --> SCEN

    classDef bus fill:#64748b,stroke:#475569,color:#fff
    classDef market fill:#a78bfa,stroke:#8b5cf6,color:#000
    classDef analytics fill:#fb923c,stroke:#f97316,color:#000
```

### Market microstructure

```mermaid
graph LR
    KAFKA["Redpanda :9092"]:::bus
    DARK["Dark Pool :5027"]:::fix
    CCP["CCP :5028<br/><i>Central clearing</i>"]:::fix
    RFQ["RFQ :5029<br/><i>Request for quote</i>"]:::fix
    PRODUCT["Product Service :5030<br/><i>Structured products</i>"]:::fix

    KAFKA --> DARK
    KAFKA --> CCP
    KAFKA --> RFQ
    KAFKA --> PRODUCT

    classDef bus fill:#64748b,stroke:#475569,color:#fff
    classDef fix fill:#f472b6,stroke:#ec4899,color:#000
```

### Identity, observability & support

```mermaid
graph LR
    GW["Gateway :5011"]:::gateway
    KAFKA["Redpanda :9092"]:::bus
    USER["User Service :5008<br/><i>OAuth2 + RBAC</i>"]:::storage
    REPLAY["Session Replay :5031<br/><i>rrweb recordings</i>"]:::storage
    NEWS["News :5013<br/><i>Sentiment scoring</i>"]:::support
    LLM["LLM Advisory :5024<br/><i>Ollama</i>"]:::support
    LLMW["LLM Worker :5033<br/><i>Inference worker</i>"]:::support
    KRELAY["Kafka Relay :5007<br/><i>HTTP→Kafka</i>"]:::support

    GW -->|"auth validate"| USER
    GW --> REPLAY
    KAFKA --> NEWS
    KAFKA --> LLM
    KAFKA --> LLMW
    KAFKA --> KRELAY

    classDef gateway fill:#f59e0b,stroke:#d97706,color:#000
    classDef bus fill:#64748b,stroke:#475569,color:#fff
    classDef storage fill:#2dd4bf,stroke:#14b8a6,color:#000
    classDef support fill:#94a3b8,stroke:#64748b,color:#000
```

### Colour key

| Colour | Group | Services |
|--------|-------|----------|
| 🟣 Purple | Client | React Frontend |
| 🟡 Amber | Gateway | API Gateway (BFF) |
| 🟢 Green | Trading | OMS, EMS |
| 🔴 Red | Risk | Risk Engine |
| 🔵 Blue | Algos | 9 algo strategies |
| 🟣 Violet | Market Data | Market Sim, Market Data, Adapters |
| 🟠 Orange | Analytics | Analytics, Feature/Signal/Recommendation/Scenario engines |
| 🟢 Teal | Storage | Journal, FIX Archive, User Service, Session Replay |
| 🩷 Pink | Microstructure | FIX Exchange, Dark Pool, CCP, RFQ, Product Service |
| ⚪ Grey | Support | News, LLM Advisory, LLM Worker, Kafka Relay |

## Order flow

```mermaid
sequenceDiagram
    actor Trader
    participant FE as Frontend
    participant GW as Gateway
    participant Bus as Redpanda
    participant OMS
    participant Risk as Risk Engine
    participant Algo as Algo Strategy
    participant EMS
    participant FIX as FIX Exchange
    participant Journal

    Trader->>FE: Submit order
    FE->>GW: WebSocket submitOrder
    GW->>Bus: orders.new
    Bus->>OMS: orders.new
    OMS->>OMS: Validate role, desk, limits
    OMS->>Risk: POST /check
    Risk-->>OMS: {allowed: true}
    OMS->>Bus: orders.submitted
    OMS->>Bus: orders.routed
    Bus->>Algo: orders.routed
    Algo->>Bus: orders.child (slice)
    Bus->>EMS: orders.child
    EMS->>FIX: Execute
    FIX-->>EMS: Fill
    EMS->>Bus: orders.filled
    Bus->>Journal: Persist
    Bus->>GW: Push to client
    GW-->>FE: WebSocket orderFilled
    FE-->>Trader: Blotter updated
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
