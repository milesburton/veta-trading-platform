---
title: Roadmap
description: Planned features and improvements for the VETA Trading Platform.
---

Planned features and improvements, roughly prioritised. Complexity is in story points (1 = trivial, 13 = major effort).

| Feature | Purpose | Complexity | Priority |
|---------|---------|:----------:|:--------:|
| Path-filtered CI | Only run backend/frontend/docs jobs when relevant paths change | 3 | Low |
| Electron integration | Wrap the frontend as a desktop app with native menus and pop-out panels | 8 | Medium |
| Load / performance testing | Stress-test the full pipeline to measure throughput limits and find bottlenecks | 5 | Medium |
| Per-service architecture pages | Clickable Mermaid nodes linking to dedicated pages showing internals and key functions | 5 | Medium |
| VaR (Value at Risk) | Historical and parametric VaR using return distributions from journal data | 8 | Low |
| SNIPER / IS / MOMENTUM fixes | Root-cause venue book data gaps causing consistent algo test failures in CI | 3 | High |
| Backtesting engine | Replay historical market data through algo strategies to evaluate performance | 13 | Low |
| Dark pool analytics | Post-trade reporting on dark pool fill rates, price improvement, and information leakage | 5 | Low |
| Multi-leg order support | Spread, straddle, and butterfly orders across the OMS → algo → EMS pipeline | 8 | Low |
| FIX 4.4 conformance | Align FIX message tags and session-level behaviour with the FIX 4.4 specification | 5 | Low |
