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

All strategies except LIMIT, POV and SNIPER limit the size of each child to a share of the estimated book depth. This covers TWAP, VWAP, ICEBERG, ARRIVAL_PRICE, IS and MOMENTUM:

- Depth is estimated as half the current tick volume for the instrument, because the algos receive the prices-only feed and not the venue books.
- A child is capped at `ALGO_DEPTH_PARTICIPATION` times that estimate. The default is `0.5`, so a child never exceeds a quarter of tick volume.
- When no volume is available for the instrument, the cap is not applied.

The cap means a large parent order on a thinly traded instrument may not complete within its window. The order is then reported as expired with the quantity filled so far, instead of sending oversized children. The shared logic is in [`depth-cap.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/backend/src/algo/depth-cap.ts).

POV already sizes children from tick volume and SNIPER from the available quantity. LIMIT sends the whole remaining quantity at the order's limit price and is not capped.

For ICEBERG the visible quantity set on the order is the requested size, so a visible quantity larger than the cap is reduced to the cap on each slice. For MOMENTUM and the slice-count strategies the unsent remainder stays on the parent and is worked in later tranches or slices until the order expires.

## Algo Monitor

The **Algo Monitor** panel lists algo parent orders with their execution progress. Its tabs are:

- **Active**: orders that are pending or working
- **Needs Action**: orders that expired with quantity unfilled, or that have been working for more than 30 seconds with no fill
- **History**: orders that have filled or expired. Selecting a row shows its execution performance.

Each row shows the asset, side, strategy, filled, unfilled and total quantity, a progress bar, the limit and last prices, market impact in basis points and commission. A strategy filter narrows the list to one execution strategy.

Algo heartbeats do not appear in this panel. They feed the algo feed indicator in the status bar.

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

The **Trade Recommendation** panel ranks option contracts for a chosen underlying. Select a symbol and click **Analyse**. When a live signal exists for the symbol, a banner shows its score, direction (long, short or neutral), confidence and the three largest contributing factors.

Each recommendation row shows:

- A signal strength badge: strong buy, buy, neutral, sell or strong sell
- Option type, strike and expiry
- Theoretical price and a score bar
- On expansion: Greeks (delta, gamma, theta, vega), implied volatility, the scoring mode and the reasons behind the score

![Trade Recommendation panel](/veta-trading-platform/screenshots/panels/trade-recommendation.png)
