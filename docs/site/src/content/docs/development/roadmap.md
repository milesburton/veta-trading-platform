---
title: Roadmap
description: Planned features and improvements for the VETA Trading Platform.
---

Planned features and improvements, roughly prioritised. Complexity is in story points (1 = trivial, 13 = major effort).

## Recently completed

| Feature | Purpose | Complexity |
|---------|---------|:----------:|
| System status bar | Header showing market data depth, service health, and data quality warnings | 5 |
| Upgrade-in-progress banner | Orange pulsing banner when system upgrade in progress, admin-toggled via API | 2 |
| E2E user workflow tests | 12 Playwright tests covering equity, algo, risk rejection, system status, and order expiry | 8 |
| Multi-select on grids | Checkbox column, shift-click range, ctrl-click toggle in order blotter | 3 |
| Right-click context menus | Hold, unhold, cancel, force kill — permission-gated by role | 5 |
| Symbol search bar | Typeahead search on symbol, RIC, BBG, ISIN with Bloomberg trade paste parser | 5 |
| Identifier aliases | RIC, BBG ticker, ISIN, and company names on all 270+ instruments | 3 |

## High priority

| Feature | Purpose | Complexity |
|---------|---------|:----------:|
| Alert / notification system | Severity-tiered notifications with criteria builder, shared filter presets, red overlay for emergencies | 13 |
| SNIPER / IS / MOMENTUM fixes | Root-cause venue book data gaps causing consistent algo test failures in CI | 3 |
| LLM trade parsing | Enhance the trade paste parser with Ollama for natural language trade instructions | 5 |
| True reference data source | Replace deterministic identifiers with a real symbology provider (OpenFIGI, LSEG) | 5 |

## Medium priority

| Feature | Purpose | Complexity |
|---------|---------|:----------:|
| Keyboard shortcuts | Ctrl+N new order, Escape cancel ticket, arrow keys in grids | 3 |
| Audit trail panel | Compliance/admin view showing every state change for an order with timestamps | 5 |
| Watchlist panel | Persistent symbol lists with live prices and configurable columns | 5 |
| Shared DataGrid component | Extract a common grid with consistent column formatting, sorting, filtering, and row styling | 5 |
| Electron integration | Wrap the frontend as a desktop app with native menus and pop-out panels | 8 |
| Load / performance testing | Stress-test the full pipeline to measure throughput limits and find bottlenecks | 5 |
| Per-service architecture pages | Clickable Mermaid nodes linking to dedicated pages showing internals and key functions | 5 |

## Low priority

| Feature | Purpose | Complexity |
|---------|---------|:----------:|
| Path-filtered CI | Only run backend/frontend/docs jobs when relevant paths change | 3 |
| Single-panel test mode | `?panel=order-blotter` query param renders one panel full-screen for rapid iteration | 2 |
| VaR (Value at Risk) | Historical and parametric VaR using return distributions from journal data | 8 |
| Backtesting engine | Replay historical market data through algo strategies to evaluate performance | 13 |
| Dark pool analytics | Post-trade reporting on dark pool fill rates, price improvement, and information leakage | 5 |
| Multi-leg order support | Spread, straddle, and butterfly orders across the OMS → algo → EMS pipeline | 8 |
| FIX 4.4 conformance | Align FIX message tags and session-level behaviour with the FIX 4.4 specification | 5 |
