---
title: Positions and P&L
description: View your open positions with live mark-to-market P&L, and the firm-wide Risk Dashboard.
---

Positions are built by the risk engine from `orders.filled` events and marked to the latest prices from the market simulator. There are two views: **My Positions** for an individual trader and the **Risk Dashboard** for firm-wide oversight.

## My Positions panel

The panel shows the signed-in user's own open positions and refreshes every 2 seconds. The gateway only serves a user's own positions to that user, unless the caller holds a role that may read the risk engine directly.

![My Positions panel](/veta-trading-platform/screenshots/panels/my-positions.png)

| Column | Description |
| --- | --- |
| Symbol | Trading symbol (for example AAPL, US10Y) |
| Position | Signed net quantity: positive and green for long, negative and red for short |
| Avg Price | Average cost of the open quantity |
| Mark | Latest market price |
| Unreal | Unrealised P&L on the open quantity |
| Real | Realised P&L from quantity closed so far |
| Total P&L | Unrealised plus realised |
| Fills | Number of fills against the symbol |

The header shows gross notional and total P&L across all positions, and a Total row sums the P&L and fill columns. P&L figures are coloured green for a gain and red for a loss. The panel has no sorting, filtering or export.

## P&L calculations

For each symbol the risk engine keeps a net quantity, an average price and a realised P&L.

```
unrealisedPnl = netQty * (markPrice - avgPrice)
totalPnl      = unrealisedPnl + realisedPnl
```

`netQty` is negative for a short position, so the same formula covers both directions. If no price is available for a symbol, the average price is used as the mark and unrealised P&L is zero.

A fill in the direction of the position increases the quantity and moves the average price. A fill against the position realises P&L on the closed quantity, `closedQty * (fillPrice - avgPrice)`, with the sign inverted for shorts. A fill that closes the position exactly resets the average price to zero, and a fill that flips the position sets the average price to the fill price. There are no asset-class multipliers: quantity is treated as units of the instrument.

## Risk Dashboard (firm-wide)

The **Risk Dashboard** panel groups positions by trader and shows firm P&L in the header. See [RBAC and permissions](/veta-trading-platform/reference/rbac/) for the roles that can open it.

![Risk Dashboard panel](/veta-trading-platform/screenshots/panels/risk-dashboard.png)

- A header strip with the active risk configuration: price collar, maximum open orders, orders per second, ADV percentage and halt threshold.
- A circuit breaker strip.
- One row per trader with symbol count, fill count, gross and net notional, unrealised, realised and total P&L followed by that trader's per-symbol rows.
- Headroom bars per trader showing notional and loss against the configured limits.

## Position limits

Limits are enforced by the risk engine at order entry, not by the position panels. Defaults:

| Limit | Default |
| --- | --- |
| Maximum gross notional (also applied per symbol as `MAX_POSITION_SIZE`) | $5,000,000 |
| Maximum daily loss | -$50,000 |
| Maximum concentration in one symbol | 25% of gross notional |

See [Risk controls](/veta-trading-platform/user-guide/risk-controls/) for the full list of checks and how rejections appear in the order ticket. The limits can be changed at runtime through the risk engine configuration.

## Related panels

| Panel | Description |
| --- | --- |
| [My Positions](/veta-trading-platform/reference/panels/) | Individual trader positions and P&L |
| [Risk Dashboard](/veta-trading-platform/reference/panels/) | Firm-wide position and P&L overview |
| [Order Blotter](/veta-trading-platform/user-guide/managing-orders/) | Active orders linked to positions |
| [Child Orders](/veta-trading-platform/user-guide/managing-orders/#child-orders) | Execution slices for algo orders |
| [Decision Log](/veta-trading-platform/reference/panels/) | Audit trail for algo decisions |
