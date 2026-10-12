---
title: Algo Trading
description: Monitor and manage algorithmic order execution strategies.
---

VETA supports 9 algo strategies, each running as an independent microservice. The algo workspace provides tools for monitoring execution quality and strategy performance.

![Algo Workspace](/veta-trading-platform/screenshots/04-algo-workspace.png)

## Available strategies

| Strategy      | Approach                                                              | Best for                              |
| --- | --- | --- |
| LIMIT         | Passive limit order with configurable aggression                      | Small orders, price-sensitive fills   |
| TWAP          | Time-Weighted Average Price, uniform slices over time                 | Spreading execution evenly            |
| VWAP          | Volume-Weighted Average Price, historically-shaped slices             | Matching the day's volume curve       |
| POV           | Percentage of Volume, tracks market participation rate                | Controlling market impact             |
| ICEBERG       | Hidden quantity, only reveals a visible portion per slice             | Large orders on lit venues            |
| SNIPER        | Aggressive opportunistic fills at favourable price levels             | Catching liquidity                    |
| ARRIVAL_PRICE | Benchmarks execution against the price at submission                  | Minimising slippage                   |
| IS            | Implementation Shortfall, balances market impact against timing risk  | Optimal execution                     |
| MOMENTUM      | EMA crossover, routes tranches on favourable price signals            | Trend-following                       |

## Child order sizing

Each algo releases its parent order as a series of child orders. Every child is matched against the venue's order book, so a child larger than the visible depth fills only in part and walks through the price levels.

TWAP and VWAP limit the size of each child to a share of the estimated book depth:

- Depth is estimated as half the current tick volume for the instrument, because the algos receive the prices-only feed and not the venue books.
- A child is capped at `ALGO_DEPTH_PARTICIPATION` times that estimate. The default is `0.5`, so a child never exceeds a quarter of tick volume.
- When no volume is available for the instrument, the cap is not applied.

The cap means a large parent order on a thinly traded instrument may not complete within its window. TWAP then reports the order as expired with the quantity filled so far, instead of sending oversized children. The shared logic is in [`depth-cap.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/backend/src/algo/depth-cap.ts).

POV already sizes children from tick volume and SNIPER from the available quantity. The remaining strategies still use fixed or evenly divided sizes, tracked in issue 785.

## Algo Monitor

The **Algo Monitor** panel shows all active algo strategies with real-time heartbeat status. Each strategy reports:

- Last heartbeat timestamp
- Number of active orders
- Current execution progress

A heartbeat gap above 10 seconds triggers an alert in the alert centre.

![Algo Monitor panel](/veta-trading-platform/screenshots/panels/algo-monitor.png)

## Executions Panel

The **Executions** panel shows detailed fill analytics for each order:

- Fill percentage progress bar
- Average fill price vs arrival price
- Market impact (bps)
- Commission costs
- Expandable fill timeline chart

![Executions panel](/veta-trading-platform/screenshots/panels/executions.png)

## Algo Leaderboard

The **Algo Leaderboard** ranks strategies by performance metrics:

- Fill rate (percentage of orders fully filled)
- Average slippage (bps from arrival price)
- Total filled quantity over the last 5 minutes

![Algo Leaderboard panel](/veta-trading-platform/screenshots/panels/algo-leaderboard.png)

## Trade Recommendations

The **Trade Recommendation** panel shows rule-based signals scored by the intelligence pipeline. Each recommendation includes:

- Symbol and action (BUY/SELL/HOLD)
- Confidence score (0 to 1)
- Reason text with factor analysis
- Target price

![Trade Recommendation panel](/veta-trading-platform/screenshots/panels/trade-recommendation.png)
