---
title: Roadmap
description: Planned features and improvements for the VETA Trading Platform.
---

Planned features and improvements, roughly prioritised. Complexity is in story points (1 = trivial, 13 = major effort).

## High priority

| Feature | Purpose | Complexity |
|---------|---------|:----------:|
| System status bar | Header/footer showing market data depth per exchange, service health, and data quality warnings (e.g. "Analytics: limited — 2 days data") | 5 |
| Upgrade-in-progress banner | Warn traders when a system update is in progress — orders may be delayed or rejected | 2 |
| E2E user workflow tests | Full trade lifecycle Playwright tests: login → place order → fill → blotter. Cover equity high-touch, algo, FI RFQ, and risk rejection flows | 8 |
| SNIPER / IS / MOMENTUM fixes | Root-cause venue book data gaps causing consistent algo test failures in CI | 3 |

## Medium priority

| Feature | Purpose | Complexity |
|---------|---------|:----------:|
| Alert / notification system | Severity-tiered notifications (info → warning → critical → emergency). Criteria builder for suppression, shared filter presets between traders, red overlay for system-wide emergencies | 13 |
| Right-click context menus | Cancel, hold/unhold, restart orders from blotter. Permission-gated: traders own orders, desk-heads their desk, risk-managers can kill anything | 5 |
| Multi-select on grids | Checkbox column for bulk operations (cancel, hold, export). Companion to context menus | 3 |
| Shared DataGrid component | Extract a common grid with consistent column formatting, sorting, filtering, and row styling across all panels | 5 |
| Keyboard shortcuts | Ctrl+N new order, Escape cancel ticket, arrow keys in grids. Power traders live on the keyboard | 3 |
| Audit trail panel | Compliance/admin view showing every state change for an order with timestamps | 5 |
| Watchlist panel | Persistent symbol lists with live prices and configurable columns | 5 |
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
