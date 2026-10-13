---
title: Placing Orders
description: Submit equity, fixed income, and options orders through the order ticket.
---

Orders are placed through the **Order Ticket** panel. The ticket adapts based on your trading style and the instrument type.

![Order Ticket](/veta-trading-platform/screenshots/02-order-ticket.png)

## Equity orders

1. Select an instrument via the [Symbol Search](/veta-trading-platform/user-guide/finding-instruments/) or market ladder.
2. Choose **BUY** or **SELL**.
3. Enter a **Quantity** (shares) and **Limit Price**.
4. Select a **Strategy** (LIMIT, TWAP, VWAP, POV, ICEBERG, SNIPER, ARRIVAL_PRICE, IS, MOMENTUM).
5. Click **Place Order**.

Available strategies depend on the strategies enabled on your account, which an admin sets and which usually follow your [trading style](/veta-trading-platform/ux/trading-styles/).

## Strategy parameters

Each algo strategy exposes additional parameters:

| Strategy | Parameters |
| --- | --- |
| LIMIT | Limit price only |
| TWAP | Number of slices, participation cap |
| POV | Participation rate, minimum and maximum slice size |
| VWAP | Maximum deviation, start and end offsets in seconds |
| ICEBERG | Visible quantity per slice |
| SNIPER | Aggression percentage, maximum venues |
| ARRIVAL_PRICE | Urgency, maximum slippage (bps) |
| IS | Urgency, maximum slippage (bps), minimum and maximum slices |
| MOMENTUM | Entry threshold (bps), maximum tranches, short and long EMA periods, cooldown ticks |

## Trading limits

Strategies your account is not allowed to use are greyed out in the strategy list with "(not permitted)". The ticket does not pre-check quantity or notional. The OMS enforces your personal limits when the order is submitted and rejects the order with a reason, for example "Order quantity 5000 exceeds your limit of 1000" or "Order notional exceeds your daily limit". A rejected order has the Rejected status in the blotter. The [risk engine](/veta-trading-platform/user-guide/risk-controls/) applies further pre-trade checks.

## Fixed income orders

Switch to the **Bond** tab to place fixed income orders:

1. Select a bond from the dropdown (government and corporate bonds).
2. Enter a **Yield**; the platform calculates the bond price.
3. Review the computed dirty price and accrued interest.
4. Click **Submit**.

## Options orders

Switch to the **Options** tab for Black-Scholes priced options:

1. Enter a **Strike Price**.
2. Select **CALL** or **PUT**.
3. Review the computed premium and Greeks (delta, gamma, theta, vega, rho).
4. Click **Submit**.

![Option Pricing](/veta-trading-platform/screenshots/06-option-pricing.png)
