---
title: Algo Trading
description: Monitor and manage algorithmic order execution strategies.
---

VETA supports 9 algo strategies, each running as an independent microservice. The algo workspace provides tools for monitoring execution quality and strategy performance.

![Algo Workspace](/veta-trading-platform/screenshots/04-algo-workspace.png)

## Available strategies

| Strategy | Approach | Best for |
|----------|----------|----------|
| LIMIT | Passive limit order with configurable aggression | Small orders, price-sensitive fills |
| TWAP | Time-Weighted Average Price — uniform slices over time | Spreading execution evenly |
| VWAP | Volume-Weighted Average Price — historically-shaped slices | Matching the day's volume curve |
| POV | Percentage of Volume — tracks market participation rate | Controlling market impact |
| ICEBERG | Hidden quantity — only reveals a visible portion per slice | Large orders on lit venues |
| SNIPER | Aggressive opportunistic fills at favourable price levels | Catching liquidity |
| ARRIVAL_PRICE | Benchmarks execution against the price at submission | Minimising slippage |
| IS | Implementation Shortfall — balances market impact vs timing risk | Optimal execution |
| MOMENTUM | EMA crossover — routes tranches on favourable price signals | Trend-following |

## Algo Monitor

The **Algo Monitor** panel shows all active algo strategies with real-time heartbeat status. Each strategy reports:
- Last heartbeat timestamp
- Number of active orders
- Current execution progress

A heartbeat gap > 10 seconds triggers an alert in the alert centre.

## Executions Panel

The **Executions** panel shows detailed fill analytics for each order:
- Fill percentage progress bar
- Average fill price vs arrival price
- Market impact (bps)
- Commission costs
- Expandable fill timeline chart

## Algo Leaderboard

The **Algo Leaderboard** ranks strategies by performance metrics:
- Fill rate (percentage of orders fully filled)
- Average slippage (bps from arrival price)
- Total filled quantity over the last 5 minutes

## Trade Recommendations

The **Trade Recommendation** panel shows rule-based signals scored by the intelligence pipeline. Each recommendation includes:
- Symbol and action (BUY/SELL/HOLD)
- Confidence score (0–1)
- Reason text with factor analysis
- Target price
