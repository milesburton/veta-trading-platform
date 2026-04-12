---
title: Risk Controls
description: Pre-trade risk engine with 6 real-time checks and live position tracking.
---

## Pre-trade risk engine (port 5032)

The OMS calls `POST /check` on the risk-engine synchronously before routing every order. If any check fails, the order is **rejected** with a specific reason code. If the risk-engine is unreachable (3s timeout), the order is rejected — real firms sooner halt trading than bypass pre-trade risk.

### Checks

| # | Check | Code | Default | What it prevents |
|---|-------|------|---------|-----------------|
| 1 | Fat-finger price collar | `FAT_FINGER_PRICE` | 5% from mid | Typo prices |
| 2 | Duplicate order detection | `DUPLICATE_ORDER` | 500ms window | Double-clicks |
| 3 | Max open orders per user | `MAX_OPEN_ORDERS` | 50 orders | Runaway algos |
| 4 | Self-cross prevention | `SELF_CROSS` | — | Own BUY crossing own SELL |
| 5 | Order size vs ADV | `ORDER_SIZE_VS_ADV` | 10% of ADV | Market impact |
| 6 | Rate limiting | `RATE_LIMIT` | 10 orders/sec | Algo floods |

### Configuration

All thresholds are runtime-editable via `PUT /config` with no restart:

```json
{
  "fatFingerPct": 5.0,
  "maxOpenOrders": 50,
  "duplicateWindowMs": 500,
  "maxOrdersPerSecond": 10,
  "maxAdvPct": 10.0
}
```

## Live positions

The risk-engine tracks positions from `orders.filled` bus events in real-time.

- `GET /positions/:userId` — per-symbol: net qty, avg price, mark price, unrealised/realised/total P&L
- `GET /positions` — all users' positions

### P&L calculation

- **Unrealised**: `netQty * (markPrice - avgPrice)` — updated on every price refresh (5s)
- **Realised**: accumulated when fills reduce or flip a position
- **Total**: unrealised + realised

## Panels

- **Risk Dashboard** (risk-manager, desk-head, admin, compliance): firm-wide view with per-user rolled-up P&L
- **My Positions** (all traders): authenticated user's own positions with total row
