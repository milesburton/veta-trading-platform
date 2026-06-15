---
title: Positions and P&L
description: View, filter, and export your positions with live mark-to-market P&L calculations.
---

The **Positions** system in VETA tracks every open position derived from fills in real time. It provides both individual trader views (**My Positions**) and firm-wide oversight (**Risk Dashboard**) with live mark-to-market P&L, average fill price, and detailed fill history.

## My Positions panel

Every trader has access to the **My Positions** panel, which shows their own open positions with live updates.

![My Positions panel](/veta-trading-platform/screenshots/panels/my-positions.png)

### Viewing your positions

The panel displays the following columns:

| Column | Description |
| ------ | ------ |
| Symbol | Trading symbol (e.g. AAPL, US10Y) |
| Side | BUY or SELL |
| Quantity | Open quantity remaining |
| Avg Fill Price | Volume-weighted average of all fills |
| Current Price | Latest market price from the simulator |
| Unrealised P&L | Mark-to-market profit/loss on open positions |
| Realised P&L | Closed P&L from fully filled/cancelled legs |
| Total P&L | Unrealised + realised combined |
| # Fills | Number of individual fills against this position |
| Duration | How long the position has been open |

### Filtering and sorting

- **Click any column header** to sort ascending or descending.
- **Use the Filter Bar** to build expressions (AND/OR logic with 13 operators).
- **Filter by symbol**: type a partial symbol name to narrow the list.
- **Filter by side**: show only BUY or SELL positions.
- **Filter by P&L range**: find positions within a profit/loss band.
- **Filter by status**: show only positions with unrealised P&L above/below a threshold.

### Colour coding

| Condition | Colour |
| ------ | ------ |
| Positive unrealised P&L | Green |
| Negative unrealised P&L | Red |
| Zero or no unrealised P&L | Grey |
| Position open > 1 day | Amber border |
| Position open > 1 week | Red border |

## P&L calculations

### Unrealised P&L

Unrealised P&L is calculated in real time using the formula:

```
unrealisedPnL = (currentPrice - avgFillPrice) * quantity * multiplier
```

For short positions, the formula is inverted:

```
unrealisedPnL = (avgFillPrice - currentPrice) * quantity * multiplier
```

The **multiplier** varies by asset class:
- Equities: 1
- Fixed Income: 1,000 (per bond notional)
- FX: contract size based on currency pair
- Commodities: contract size based on commodity type

### Realised P&L

Realised P&L is the sum of P&L from all fully closed positions. Each fill contributes to realised P&L based on the difference between the fill price and the average cost basis.

### Total P&L

```
totalPnL = unrealisedPnL + realisedPnL
```

## Risk Dashboard (firm-wide)

Desk-heads, risk-managers, and admins can view the **Risk Dashboard** panel for a firm-wide perspective.

![Risk Dashboard panel](/veta-trading-platform/screenshots/panels/risk-dashboard.png)

The Risk Dashboard aggregates positions across all traders:

| Metric | Description |
| ------ | ------ |
| Gross Exposure | Total long + short notional (absolute) |
| Net Exposure | Long notional minus short notional |
| Unrealised P&L | Firm-wide unrealised profit/loss |
| Realised P&L | Firm-wide realised profit/loss |
| Total P&L | Combined firm-wide P&L |
| Per-Trader Breakdown | Individual trader P&L and exposure |
| Per-Symbol Breakdown | Position concentration by instrument |

## Exporting position data

Positions and P&L data can be exported for external analysis:

1. Click the **Export** button in the panel toolbar.
2. Choose the export format:
   - **CSV** — flat file compatible with Excel and spreadsheet applications
   - **JSON** — structured data for programmatic processing
3. Choose the scope:
   - **My Positions** — only your own positions
   - **All Positions** — firm-wide (requires desk-head, risk-manager, or admin role)

### CSV export format

A CSV export includes the following columns:

```
symbol,side,quantity,avgFillPrice,currentPrice,unrealisedPnl,realisedPnl,totalPnl,fills,openTime,trader,desk
```

### JSON export format

A JSON export includes nested structure with position details, fill history, and metadata:

```json
{
  "exportedAt": "2026-06-15T10:30:00Z",
  "scope": "my-positions",
  "positions": [
    {
      "symbol": "AAPL",
      "side": "BUY",
      "quantity": 500,
      "avgFillPrice": 178.50,
      "currentPrice": 182.30,
      "unrealisedPnl": 1900.00,
      "realisedPnl": 0.00,
      "totalPnl": 1900.00,
      "fills": 3,
      "openTime": "2026-06-14T09:15:00Z",
      "trader": "alice",
      "desk": "equities"
    }
  ]
}
```

## Position limits

Each trader has position limits enforced by the risk engine:

| Limit | Description | Default |
| ------ | ------ | ------ |
| Max position size | Largest single position allowed (shares or notional) | 50,000 shares |
| Max net exposure | Maximum net long or short exposure | $5,000,000 |
| Max gross exposure | Maximum total long + short exposure | $10,000,000 |
| Max symbol concentration | Maximum % of portfolio in a single symbol | 25% |

Limit violations appear as amber warnings in the order ticket and prevent new orders that would breach the limit.

## Position reconciliation

The **Journal** service persists every fill to PostgreSQL. Positions are derived from the journal and reconciled on each page load:

1. The frontend requests the latest positions from the **OMS** service.
2. The OMS queries the journal for all fills attributed to the trader.
3. The OMS computes current position state from the fill history.
4. The OMS returns the position data to the frontend.

If the journal is unavailable, positions are served from the last known state with a warning indicator.

## Related panels

| Panel | Description |
| ------ | ------ |
| [My Positions](/veta-trading-platform/reference/panels/) | Individual trader positions and P&L |
| [Risk Dashboard](/veta-trading-platform/reference/panels/) | Firm-wide position and P&L overview |
| [Order Blotter](/veta-trading-platform/user-guide/managing-orders/) | Active orders linked to positions |
| [Child Orders](/veta-trading-platform/user-guide/managing-orders/#child-orders) | Execution slices for algo orders |
| [Decision Log](/veta-trading-platform/reference/panels/) | Audit trail for position-related decisions |

## Related documentation

- [Risk Controls](/veta-trading-platform/user-guide/risk-controls/) — pre-trade risk checks and position limits
- [Managing Orders](/veta-trading-platform/user-guide/managing-orders/) — order lifecycle and blotter management
- [RBAC & Permissions](/veta-trading-platform/reference/rbac/) — who can view and export position data
- [Journal Service](/veta-trading-platform/platform/services/) — fill persistence and reconciliation
