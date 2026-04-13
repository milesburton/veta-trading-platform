---
title: Placing Orders
description: Submit equity, fixed income, and options orders through the order ticket.
---

Orders are placed through the **Order Ticket** panel. The ticket adapts based on your trading style and the instrument type.

![Order Ticket](/veta-trading-platform/screenshots/02-order-ticket.png)

## Equity orders

1. Select an instrument via the [Symbol Search](/veta-trading-platform/user-guide/finding-instruments/) or market ladder
2. Choose **BUY** or **SELL**
3. Enter a **Quantity** (shares) and **Limit Price**
4. Select a **Strategy** (LIMIT, TWAP, VWAP, POV, ICEBERG, SNIPER, ARRIVAL_PRICE)
5. Click **Place Order**

Available strategies depend on your [trading style](/veta-trading-platform/reference/trading-styles/). High-touch traders have access to LIMIT and basic algo strategies. Low-touch/algo traders have the full range including ICEBERG, SNIPER, and ARRIVAL_PRICE.

## Strategy parameters

Each algo strategy exposes additional parameters:

| Strategy | Parameters |
|----------|-----------|
| LIMIT | Limit price only |
| TWAP | Number of slices, participation cap |
| POV | Participation rate, min/max slice size |
| VWAP | Historical volume curve window |
| ICEBERG | Visible quantity per slice |
| SNIPER | Aggression threshold |
| ARRIVAL_PRICE | Slippage tolerance (bps) |

## Risk limit warnings

The ticket validates your order against your personal trading limits in real time:

- **Quantity limit** — Amber warning if quantity exceeds your max order size
- **Notional limit** — Amber warning if price x quantity exceeds your daily notional cap

Orders that exceed limits show a warning and the submit button is disabled.

## Fixed income orders

Switch to the **Bond** tab to place fixed income orders:

1. Select a bond from the dropdown (government and corporate bonds)
2. Enter a **Yield** — the platform calculates the bond price
3. Review the computed dirty price and accrued interest
4. Click **Submit**

## Options orders

Switch to the **Options** tab for Black-Scholes priced options:

1. Enter a **Strike Price**
2. Select **CALL** or **PUT**
3. Review the computed premium and Greeks (delta, gamma, theta, vega, rho)
4. Click **Submit**

![Option Pricing](/veta-trading-platform/screenshots/06-option-pricing.png)
