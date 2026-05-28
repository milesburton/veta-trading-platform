---
title: Admin Tools
description: Mission Control, session replay, user management, and system administration.
---

Admin users have access to additional tools for system management, user oversight, and compliance.

## Mission Control

The **Mission Control** workspace provides a unified operations view:

![Mission Control](/veta-trading-platform/screenshots/10-mission-control.png)

- **Estate Overview**: live health grid for all 32 backend services with status, version, and event timeline. The same set drives the [daily Discord summary](/veta-trading-platform/platform/observability/alerts/#daily-summary) — frontend grid and Discord rollup are always in sync.

  ![Estate Overview panel](/veta-trading-platform/screenshots/panels/estate-overview.png)

- **Throughput Gauges**: orders/min, fills/min, and fill rate metrics

  ![Throughput Gauges panel](/veta-trading-platform/screenshots/panels/throughput-gauges.png)

- **News Feed**: live headlines with sentiment scoring
- **Market Data Sources**: configure per-symbol data sources (synthetic or Alpha Vantage)

  ![Market Data Sources panel](/veta-trading-platform/screenshots/panels/market-data-sources.png)

## Session Replay

Record and play back browser sessions for training, audit, and post-incident review.

![Session Replay](/veta-trading-platform/screenshots/11-session-replay.png)

- **Recording toggle**: admin-controlled, affects all connected traders
- **Session list**: browse all recorded sessions by user, time, and duration
- **Timeline playback**: play, pause, and scrub through recorded sessions
- Uses [rrweb](https://www.rrweb.io/) for DOM-level recording

## User Management

The admin panel includes:

- **Trading limits editor**: set max order quantity, max daily notional, and allowed strategies per user
- **Audit journal**: chronological log of all trade lifecycle events with filters

## Demo Day

The **Demo Day** panel provides one-click trading scenarios for demonstrations:

![Demo Day panel](/veta-trading-platform/screenshots/panels/demo-day.png)

| Scenario      | Description                                            |
| ------------- | ------------------------------------------------------ |
| Standard      | Mixed LIMIT and TWAP orders across multiple assets     |
| Market Open   | High-volume burst simulating market open               |
| Volatile      | Rapid price moves with algo reactions                  |
| Institutional | Large block orders with ICEBERG and dark pool routing  |

## Upgrade Management

Admins can signal a platform upgrade via the gateway API:

```
PUT /api/gateway/upgrade-status
{
  "inProgress": true,
  "message": "Scheduled maintenance until 18:00 UTC"
}
```

This displays an orange banner to all connected traders. Set `inProgress: false` to dismiss.
