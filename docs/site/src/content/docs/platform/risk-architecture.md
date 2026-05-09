---
title: Risk Architecture
description: How the platform enforces pre-trade risk on every order path, and the integration test that proves no path bypasses it.
sidebar:
  order: 3
---

This page describes the **single chokepoint** through which every
order in the platform must pass to reach execution, and the
guarantees that follow.

## The chokepoint

Every order, regardless of source, is published to the Kafka topic
`orders.new`. The only consumer of that topic is the OMS service.
The OMS performs three pre-trade checks before publishing
`orders.submitted` (which is the topic downstream services act on):

1. **Local limit checks** in the OMS itself: `max_order_qty`,
   `max_daily_notional`, `allowed_strategies`,
   `dark_pool_access` enforced against the user's `trading_limits`
   row.
2. **Risk-engine pre-trade check** via HTTP `POST /check` to the
   risk-engine service. The check evaluates configured risk rules
   (position concentration, order count, kill-switch state, etc.)
   and returns `{ allowed, reasons, warnings }`.
3. **Risk-engine availability gate**. If the risk-engine call fails
   (timeout, network error, non-200), the OMS publishes
   `orders.rejected` with reason `"Risk engine unavailable — all orders
   are blocked until the risk service is restored"`. **Fail-closed,
   not fail-open**.

If any check rejects, the order is published to `orders.rejected`
with a structured reason and never reaches `orders.submitted`. No
downstream service (algo strategies, EMS, dark-pool router,
RFQ service) consumes from `orders.new` directly — they all
consume `orders.submitted` (or further-downstream topics).

## Producers of `orders.new`

The following six call sites publish to `orders.new`. Each is a
known and intentional entry point. The integration test described
below fails if any new producer is added without being added to
the allowlist.

| Source | Producer | Trigger |
|---|---|---|
| User browser → Gateway WS | `backend/src/gateway/routes/websocket.ts` | Trader submits order via UI |
| Admin / load-test | `backend/src/gateway/routes/admin.ts` | Admin endpoint for stress testing |
| Admin scenario | `backend/src/gateway/routes/admin.ts` | Admin "demo day" canned sequence |
| Admin replay | `backend/src/gateway/routes/admin.ts` | Replay a saved scenario |
| Continuous load agent | `backend/src/gateway/loadAgent.ts` | Admin/oncall toggles in-platform load generator |
| RFQ acceptance | `backend/src/rfq/rfq-service.ts` | Sales accepts a client RFQ quote |
| Scenario orchestrator | `backend/src/scenarios/orchestrator.ts` | Deterministic scenario replay |

Every one of these passes through OMS, which performs the three
checks above. There is no path that publishes to `orders.submitted`
or downstream topics directly.

## What this design guarantees

- **No route bypasses risk.** A new feature can only submit an
  order by publishing to `orders.new`. OMS is the only consumer of
  that topic; no other service consumes from it. Bypassing risk
  requires modifying OMS, not a new feature service.
- **Risk-engine outages reject, not allow.** The catch branch in
  OMS publishes `orders.rejected` with a "risk service unavailable"
  reason. The platform is unavailable when risk is down — by design.
- **Per-user limits are versioned.** Migration `0014_risk_config_versions`
  added a versioned config table so risk rules can be changed
  without restarting services and so a regression in rule behaviour
  is auditable to a specific config version.

## Residual risks (honest)

These are not currently defended against and are tracked as
follow-ups on the [Professional Standards](../professional-standards/)
page.

- **`RISK_ENGINE_ENABLED=false` is a kill switch for the risk check.**
  This env var exists for local development convenience. In any
  production-like deployment it must not be set to `false`. There is
  not yet a startup-time guard that refuses to start the OMS with
  this set on a non-development deployment. **Follow-up: fail loudly
  on startup if `RISK_ENGINE_ENABLED=false` and `DEPLOYMENT != local`.**
- **Direct database write.** Anyone with Postgres credentials can
  insert into `journal.events` directly, bypassing the entire pipeline.
  This is the same reason audit-log integrity (hash-chained appends)
  is on the standards backlog.
- **Direct Kafka publish.** Anyone who can reach the Redpanda broker
  on the docker network and knows the topic name can publish to
  `orders.submitted` directly, bypassing OMS. The defence is
  network-level: only OMS, EMS, the journal, and the algo strategies
  are on the trading-net network. **Follow-up: ACLs on Redpanda
  topics so only OMS can publish to `orders.submitted`.**
- **A new service that produces to `orders.new` without going via
  the gateway/OMS path.** Caught at PR review by the integration
  test described next, but only at PR time — a malicious commit to
  main would bypass the test. Branch protection requiring CI green
  is the mitigation.

## Integration test

`backend/src/tests/risk-bypass.test.ts` enforces the producer
allowlist with a static-analysis grep. It scans the entire
`backend/src/` tree for any call to `producer.send("orders.new", ...)`
or `producer.send("orders.submitted", ...)` and fails if the calling
file is not in the allowlist.

The allowlist is small and the rule is simple:

- **`orders.new` producers** — six files listed above.
- **`orders.submitted` producers** — exactly one file: `oms/oms-server.ts`.

If a future PR adds a producer outside this set, the test fails. The
PR author then either adds the producer to the allowlist with a clear
justification (and updates this doc) or rewrites the feature to go
through OMS. The path of least resistance is "go through OMS".

## How this page stays current

When a new producer is added or removed, both the table above and
the allowlist constants in `risk-bypass.test.ts` must be updated in
the same PR. The integration test enforces that the constant
matches reality; this doc relies on PR review to enforce that the
table matches the constant.
