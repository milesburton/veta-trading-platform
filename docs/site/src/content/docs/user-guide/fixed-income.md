---
title: Fixed Income
description: Bond pricing, yield curves, spread analysis, duration ladders, and vol surfaces.
---

VETA provides a full fixed income analytics suite for government and corporate bond traders.

![Fixed Income Workspace](/veta-trading-platform/screenshots/05-fixed-income.png)

## FI Trading workspace

FI traders (trading style: `fi_voice`) land on the **FI Trading** workspace by default, which includes:
- Yield Curve panel
- Spread Analysis panel
- Duration Ladder panel
- Vol Surface panel

Navigate to this workspace via `?ws=ws-fi-analysis` or select it from the workspace picker.

## Yield Curve

The **Yield Curve** panel shows a Nelson-Siegel interpolated spot yield curve with forward rates. It visualises the term structure from 3-month to 30-year maturities.

## Spread Analysis

Compute credit spreads for corporate bonds against the government curve:

| Spread | Description |
|--------|-------------|
| G-Spread | Simple yield spread vs the interpolated government curve |
| Z-Spread | Zero-volatility spread — constant spread over the spot curve that prices the bond |
| OAS | Option-Adjusted Spread — adjusts for any embedded optionality |

Click **Compute Spreads** to calculate all three metrics for the selected bond.

## Duration Ladder

The duration ladder shows **DV01 key-rate attribution** across tenor buckets:
- Portfolio DV01 summary at the top
- Stacked bar chart showing exposure by maturity bucket (1y, 2y, 3y, 5y, 7y, 10y, 20y, 30y)
- Useful for identifying interest rate risk concentrations

## Vol Surface

The **Vol Surface** panel displays an implied volatility heatmap:
- 5 expiries x 9 strikes (moneyness from 0.70 to 1.30)
- Click any cell to prefill the Option Pricing panel with that strike and expiry
- OTM puts show higher IV due to skew
- Darker colours indicate higher implied volatility

## Bond Order Ticket

Switch to the **Bond** tab in the order ticket to place FI orders:
1. Select a bond from the dropdown
2. Enter a yield
3. Review the computed bond price (clean + accrued = dirty)
4. Submit the order
