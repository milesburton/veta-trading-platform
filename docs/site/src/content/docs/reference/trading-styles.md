---
title: Trading Styles
description: The 8 trading styles and which panels each can access.
---

Every trader has exactly one trading style. The style determines which panels they can access.

## Style → panel matrix

| Panel | high_touch | low_touch | fi_voice | fx_electronic | commodities_voice | derivs_high_touch | derivs_low_touch | oversight |
|-------|-----------|-----------|----------|--------------|------------------|------------------|-----------------|-----------|
| Order Ticket | Yes | No | Yes | Yes | Yes | Yes | No | No |
| Basket Order | Yes | No | No | No | No | No | No | No |
| Algo Monitor | No | Yes | No | Yes | No | No | Yes | Yes |
| Algo Leaderboard | No | Yes | No | Yes | No | No | Yes | Yes |
| Decision Log | No | Yes | No | No | No | No | Yes | Yes |
| Yield Curve | No | No | Yes | No | No | No | No | Yes |
| Duration Ladder | No | No | Yes | No | No | No | No | Yes |
| Spread Analysis | No | No | Yes | No | No | No | No | Yes |
| Vol Surface | No | No | Yes | No | No | Yes | Yes | Yes |
| Greeks Surface | No | No | No | No | No | Yes | Yes | Yes |
| Option Pricing | No | No | No | No | No | Yes | Yes | Yes |
| Scenario Matrix | No | No | No | No | No | Yes | Yes | Yes |
| Price Fan | No | No | Yes | No | Yes | No | No | Yes |

Panels not listed (market-ladder, candle-chart, news, blotter, etc.) are accessible to all trading styles.

## Default workspaces

| Style | Default workspace |
|-------|-------------------|
| `high_touch` | Trading |
| `low_touch` | Algo |
| `fi_voice` | FI Trading |
| `fx_electronic` | Algo |
| `commodities_voice` | Commodities |
| `derivatives_high_touch` | Options |
| `derivatives_low_touch` | Algo |
| `oversight` | Trading |
