---
title: Data classification
description: Every stored data set in the platform, grouped by sensitivity class, as the input for retention and log redaction work.
---

This page classifies the data the platform stores. It is the input for retention policy and
log redaction ([#962](https://github.com/milesburton/veta-trading-platform/issues/962)).

## Classes

| Class | Meaning | Handling |
| --- | --- | --- |
| Secret | Credentials, tokens and key material. Disclosure lets an attacker act as a user or service. | Never logged, never returned by an API, stored hashed or in the vault. |
| Personal | Identifies a person: display name, avatar, role and firm. | Returned only to the owner and to roles that need it. |
| Confidential | Order, execution, position and limit data, and the audit trail. | Authenticated access only, scoped by role. Retained for audit. |
| Operational | Service state, configuration, telemetry and derived analytics. | Authenticated access. No retention constraint beyond storage cost. |
| Reference | Market data, simulated or fetched from public sources. | Freely shareable inside the platform. |

The platform trades simulated instruments for demonstration accounts. Real personal data is
limited to what an operator enters when creating a user, so the Personal class is small.

## Retention policy by class

| Class | Retention policy |
| --- | --- |
| Secret | Keep for the shortest practical period. Session tokens expire at `expires_at`; service credentials are rotated in OpenBao and are not exported in cleartext. |
| Personal | Keep while the account or shared resource exists. Deletion is owner/admin-driven, not time-pruned. |
| Confidential | Split by purpose: hot operational views (for example `journal.events`) are retained 90 days; regulatory order records are append-only and exported with five-year object-lock retention. |
| Operational | Keep only for operational usefulness and storage cost. Defaults are short windows where configured, for example Prometheus 7 days and Tempo 24 hours. |
| Reference | No compliance minimum. Retain while useful for simulation and analytics, bounded by topic/table retention settings. |

## Postgres tables

| Schema | Table | Class | Notes |
| --- | --- | --- | --- |
| `users` | `users` | Personal | `name`, `avatar_emoji`, `description`, `firm` and `role`. |
| `users` | `users` (`password_hash` column) | Secret | Salted PBKDF2 hash, read only to verify a login. Never selected by an API response. |
| `users` | `sessions` | Secret | `token` is the session credential. Rows expire at `expires_at`. |
| `users` | `trading_limits` | Confidential | Per-user order, notional, strategy and desk limits. |
| `users` | `user_preferences` | Personal | Free-form UI preferences, keyed by user. |
| `users` | `user_alerts` | Operational | Alert text can name a user or an order. |
| `users` | `shared_workspaces` | Personal | Layout JSON authored by a user and shared by name. |
| `journal` | `events` | Confidential | Every order lifecycle event with `user_id`, `limit_price`, `fill_price` and the raw payload. |
| `journal` | `candles` | Reference | Aggregated prices. |
| `fix_archive` | `executions` | Confidential | FIX execution reports with `account`, `counterparty` and `commission`. |
| `risk` | `config`, `config_versions` | Operational | Risk limits and their change history, with the editing user. |
| `risk` | `events` | Confidential | Risk check outcomes per order and user. |
| `audit` | `events` | Confidential | Hash-chained record of privileged actions. `detail` can name users and targets. |
| `replay` | `sessions` | Personal | `user_name` and `user_role` for each recorded session. |
| `replay` | `chunks` | Confidential | Recorded UI events, which can show order and position data. |
| `replay` | `config` | Operational | Recording on or off. |
| `scenarios` | `scenarios`, `runs` | Confidential | User-authored order scenarios and their results. |
| `llm_advisory` | `jobs`, `advisory_notes` | Confidential | Advisory requests and generated notes, including signal and recommendation snapshots. |
| `llm_advisory` | `prompt_audit`, `response_audit` | Confidential | Full prompt and raw model response text. Treat as order data. |
| `llm_advisory` | `worker_sessions`, `runtime_config` | Operational | Worker lifecycle and feature flags. |
| `intelligence` | `feature_vectors`, `signal_weights` | Operational | Derived signals. |
| `intelligence` | `market_events`, `yield_curve_snapshots` | Reference | Public calendar and curve data. |
| `market_sim` | `settings` | Operational | Simulator settings. |
| `public` | `schema_migrations` | Operational | Applied migration versions. |

## Data outside Postgres

| Store | Content | Class |
| --- | --- | --- |
| Redpanda topics | Order, fill, risk and market events | Confidential for order topics, Reference for market topics |
| Service logs (Loki) | Structured application logs | Operational, but a log line can carry Confidential or Personal fields until redaction lands |
| Traces and metrics | OpenTelemetry spans and Prometheus series | Operational |
| OpenBao | Service credentials, signing keys and webhook URLs | Secret |
| Browser storage | Session cookie and UI state | Secret for the cookie, Personal for UI state |
| Postgres backups | Full dump of every table above | Highest class present in the dump, so Secret |

## Rules that follow from the classes

- A Secret field must never appear in a log line, an API response or a backup that leaves the
  trust boundary unencrypted. The redaction work in
  [#962](https://github.com/milesburton/veta-trading-platform/issues/962) enforces this for logs.
- Backups inherit the highest class they contain. See [Postgres backup](../supporting/postgres-backup/).
- A new table or column must be added to this page in the same change. Retention periods per class
  are set in the class policy table above.
