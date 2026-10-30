# Runbook: restore Postgres from a backup

Use this to recover from data loss or corruption, to move the database to a
new host, or to rehearse recovery. Backups come from the
[Postgres backup](https://milesburton.github.io/veta-trading-platform/platform/supporting/postgres-backup/)
container: one verified custom-format `pg_dump` per day, named
`veta-<UTC timestamp>.dump`, in the backup volume.

Worst-case data loss is one backup interval, about 24 hours, plus whatever
was written since the last dump.

## Rehearsal

The restore path is exercised on every CI run by
`postgres-restore-drill.integration.tc.test.ts`. It takes a backup with the
production script inside a Postgres container, restores it into a second
empty container, and compares the row count of every table. Run it locally
with `RUN_TESTCONTAINERS=1 ./scripts/run-testcontainers.sh vp test run --config vitest.testcontainers.config.ts backend/src/tests/postgres-restore-drill.integration.tc.test.ts`.

A drill against a real production backup is still a manual step. Do one
after any change to the backup job, and at least quarterly. Record the date,
the dump used, the elapsed time, and any problems in the incident log.

## Choose the backup

```bash
scripts/veta-compose.sh exec postgres-backup ls -lt /backups
```

Prefer the newest dump unless the corruption is older than it. Check the
metrics page for the last success time before relying on it.

## Restore into a scratch database first

Always prove the dump restores before touching the live database.

```bash
scripts/veta-compose.sh exec postgres createdb -U veta veta_restore_check
scripts/veta-compose.sh exec -T postgres pg_restore -U veta -d veta_restore_check --no-owner < veta-YYYYMMDDTHHMMSSZ.dump
scripts/veta-compose.sh exec postgres psql -U veta -d veta_restore_check -c 'SELECT count(*) FROM public.schema_migrations'
```

Compare a few table counts with expectations, then drop the scratch
database.

## Restore over the live database

1. Stop every service that writes to Postgres so nothing writes during the
   restore. Stopping the gateway and the trading services is enough; leave
   Postgres running.
2. Take a fresh dump of the current state first, even if it is damaged. It is
   evidence and a fallback.
3. Recreate the database and restore:

   ```bash
   scripts/veta-compose.sh exec postgres dropdb -U veta --if-exists veta
   scripts/veta-compose.sh exec postgres createdb -U veta veta
   scripts/veta-compose.sh exec -T postgres pg_restore -U veta -d veta --no-owner < veta-YYYYMMDDTHHMMSSZ.dump
   ```

4. Run the migration job so the schema matches the running version, then
   start the services.
5. Verify with the smoke check: fleet health, an authenticated request, the
   market feed, and recent logs.

## After the restore

- Orders and other events written after the dump are lost from Postgres. Retained
  bus messages may allow some replay; check before relying on it.
- Write an incident entry. See the [incident log](../README.md).
