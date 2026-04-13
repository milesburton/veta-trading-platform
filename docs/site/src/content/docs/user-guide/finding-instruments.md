---
title: Finding Instruments
description: Search for instruments by symbol, RIC, Bloomberg ticker, ISIN, or paste a trade.
---

The **Symbol Search Bar** is the primary way to find and select instruments on the platform. It supports multiple identifier formats used across the trading industry.

![Symbol Search Bar](/veta-trading-platform/screenshots/ug-symbol-search.png)

## Opening the search

- Click the search bar in the **Symbol Search** panel
- Press **Ctrl+/** (or **Cmd+/** on macOS) from anywhere in the platform

## Searching by identifier

Type any of the following and the search bar will match instantly:

| Format | Example | Description |
|--------|---------|-------------|
| Symbol | `AAPL` | Exchange ticker symbol |
| Company name | `Apple` | Full or partial company name |
| RIC | `AAPL.OQ` | Reuters Instrument Code |
| Bloomberg | `AAPL US Equity` | Bloomberg terminal identifier |
| ISIN | `US0378331005` | International Securities Identification Number |
| Sector | `Technology` | All instruments in a sector |
| Exchange | `XNAS` | All instruments on an exchange |

Results appear as you type, showing the symbol, name, exchange, RIC, and live price.

## Selecting an instrument

- **Click** a result or press **Enter** to select
- **Arrow keys** navigate the result list
- **Escape** clears the search

Selecting an instrument broadcasts it to all linked panels (market ladder, charts, order ticket).

## Pasting a Bloomberg trade

You can paste a trade instruction directly into the search bar. The platform parses common Bloomberg-style formats:

```
BUY 5000 AAPL US Equity @ 185.50 TWAP
SELL 200 MSFT @ 420 LIMIT
BUY 10000 NVDA VWAP
```

When a trade is detected, a green preview bar appears showing the parsed fields. Click **Apply** to populate the order ticket with the symbol, side, and strategy.

![Trade Parse Preview](/veta-trading-platform/screenshots/ug-trade-paste.png)

## Supported fields in trade paste

| Field | Detection | Example |
|-------|-----------|---------|
| Side | `BUY` or `SELL` keyword | `BUY` |
| Quantity | Number followed by optional `shares`/`lots` | `5000`, `5,000 shares` |
| Symbol | Any known symbol, BBG ticker, RIC, or ISIN | `AAPL US Equity` |
| Price | Number after `@` | `@ 185.50` |
| Strategy | Strategy name keyword | `TWAP`, `VWAP`, `LIMIT` |
