---
title: db-migrate
description: One-shot Postgres migration runner.
---

Applies SQL migrations from [`backend/db/migrations/`](https://github.com/milesburton/veta-trading-platform/tree/main/backend/db/migrations) to the Postgres instance on container start, then exits.

## Idempotency

Every migration uses `CREATE TABLE IF NOT EXISTS` / `ON CONFLICT DO NOTHING` patterns and is recorded in `public.schema_migrations`. The runner records each successful migration itself rather than relying on the SQL to do it — that closes a class of failure where a migration ran but its `INSERT` was missing, causing it to retry forever on next start.

## Ordering

Services that depend on Postgres (`oms`, `journal`, `user-service`, `replay-service`) declare:

```yaml
depends_on:
  db-migrate:
    condition: service_completed_successfully
```

so they wait for migrations to finish before starting. The migration container exits 0 on success and stays in `Exited` state — that is the healthy steady state, not an error.
