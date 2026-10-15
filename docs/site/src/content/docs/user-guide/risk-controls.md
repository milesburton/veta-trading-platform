---
title: Risk Controls
description: Pre-trade risk checks, position limits, kill switch, and the risk dashboard.
---

VETA enforces real-time risk controls at every stage of the order lifecycle.

## Pre-trade risk engine

Every order passes through the risk engine before reaching the market. Eleven checks run on every order:

| Check                  | Description                                                                            |
| --- | --- |
| Fat-finger collar      | Rejects orders where the limit price deviates more than 5% from the current market price |
| Duplicate detection    | Blocks identical orders submitted within 500 ms                                        |
| Self-cross prevention  | Prevents a trader from holding both a buy and a sell order on the same instrument      |
| Rate limiting          | Caps order submission rate per trader (default: 10/sec)                                |
| ADV check              | Rejects single orders exceeding 10% of average daily volume                            |
| Max open orders        | Limits the number of concurrent active orders per trader                               |
| Market hours           | Rejects orders placed outside the trading session                                      |
| Gross notional limit   | Rejects orders that would take a trader above the gross notional limit                 |
| Daily loss stop        | Blocks new orders once a trader reaches the daily loss limit                           |
| Concentration limit    | Rejects orders that would put too large a share of the book in one instrument          |
| Max position size      | Rejects orders that would take a single position above the per-symbol notional limit   |

If the risk engine is unavailable, orders are **blocked, not bypassed** (hard-fail on outage).

## Trading limits

Each trader has personal limits enforced by the OMS when an order is submitted:

- **Max order quantity**: the largest single order allowed (e.g. 10,000 shares)
- **Max daily notional**: the total notional value of accepted orders allowed per trading day (e.g. $1,000,000). Market orders are valued at the latest price
- **Allowed strategies**: which algo strategies the trader can use

An order that breaches a limit is rejected with the reason. The order ticket greys out strategies that are not allowed.

## Kill Switch

The kill switch allows traders and administrators to halt trading activity immediately.

![Kill Switch](/veta-trading-platform/screenshots/08-kill-switch.png)

- **Traders** can kill their own orders.
- **Admins** can kill all orders firm-wide.
- **Scope options**: all orders, a specific symbol, a specific strategy, a specific user, or a market or exchange.

The kill switch broadcasts to all connected clients and cancels active orders on the bus.

## Risk Dashboard

The **Risk Dashboard** panel (available to desk-heads, risk-managers, admins and compliance) shows a firm-wide view of all positions:

- Every trader's book with gross and net exposure
- Unrealised and realised P&L per position
- Total firm P&L aggregated across all traders

![Risk Dashboard panel](/veta-trading-platform/screenshots/panels/risk-dashboard.png)

## My Positions

Individual traders see the **My Positions** panel with their own open positions, live mark-to-market P&L, average fill price, and number of fills.

![My Positions panel](/veta-trading-platform/screenshots/panels/my-positions.png)
