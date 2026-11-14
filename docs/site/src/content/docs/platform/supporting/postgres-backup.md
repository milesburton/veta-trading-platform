---
title: Postgres backup
description: Scheduled, verified pg_dump backups with retention and Prometheus alerts for stale or failing runs.
---

The `postgres-backup` container takes a logical backup of the platform
database once a day, checks that it can be read back, prunes old copies and
exposes the result to Prometheus. The [full platform backup](../full-backup/) is a separate daily job that
also covers the Authentik database, the vault and the stack config.

## What it does

1. Runs `pg_dump` in custom format into the backup volume. The file is
   written under a `.partial` name and only renamed once it is complete.
2. Runs `pg_dumpall --roles-only --no-role-passwords` into a matching
   `veta-<stamp>.roles.sql` file, also written via a `.partial` file.
3. Verifies the dump with `pg_restore --list`. A dump that cannot be listed
   is discarded and counted as a failure.
4. Prunes dumps older than the retention window, always keeping the newest
   few so a long outage of the job cannot empty the directory.
5. Writes a Prometheus metrics file served on port 8101.

A fresh deployment runs one backup immediately. After that the job runs in
the configured UTC hour. A failed attempt is retried every 15 minutes.

## Configuration

| Variable                         | Default                           | Meaning                                                    |
| -------------------------------- | --------------------------------- | ---------------------------------------------------------- |
| `POSTGRES_BACKUP_PATH`           | `postgres-backups` (named volume) | Volume name or host path mounted at `/backups`.            |
| `POSTGRES_BACKUP_HOUR_UTC`       | `03`                              | Hour of day for the daily run.                             |
| `POSTGRES_BACKUP_RETENTION_DAYS` | `14`                              | Dumps older than this are pruned, except the newest three. |

Point `POSTGRES_BACKUP_PATH` at a directory on a different disk or a network
mount so that the backups survive the loss of the database host. The
container runs without capabilities, so that directory must be writable by
root inside the container.

## Alerts

| Alert                      | Fires when                                                     |
| -------------------------- | -------------------------------------------------------------- |
| `PostgresBackupStale`      | No verified backup for more than 26 hours, or never. Critical. |
| `PostgresBackupFailing`    | The latest attempt failed for 30 minutes.                      |
| `PostgresBackupScrapeDown` | Prometheus cannot scrape the container for 10 minutes.         |

The metrics are `veta_postgres_backup_last_success_timestamp_seconds`,
`veta_postgres_backup_last_attempt_timestamp_seconds`,
`veta_postgres_backup_last_status`, `veta_postgres_backup_last_size_bytes`
and `veta_postgres_backup_files`.

## Checking that it is running

```bash
docker ps -a --format '{{.Names}} {{.Status}}' | grep postgres-backup
docker logs --tail 20 veta-postgres-backup
```

A healthy container stays up and logs one line per run. A container that shows `Restarting (0)` with no logs is not running the script. Check that `/opt/stacks/veta/scripts/postgres-backup.sh` is a regular file. If it is an empty directory the script was never synced, see [Troubleshooting the auto-pull deploy](../../../development/deployment/#troubleshooting-the-auto-pull-deploy). The `PostgresBackupStale` alert fires after 26 hours without a verified backup, so this state raises an alert rather than passing silently.

## Restoring a backup

Restore in this order:

1. Restore the roles file into the target cluster:

   ```bash
   psql -U "$PGUSER" -d postgres < veta-<stamp>.roles.sql
   ```

2. Restore the dump into an empty database:

   ```bash
   pg_restore -U "$PGUSER" -d "$PGDATABASE" --no-owner veta-<stamp>.dump
   ```

   A non-zero exit code means the restore is incomplete. Do not treat the
   database as usable until it exits 0.

3. Run `db-migrate`. It reconciles role membership, recreates the
   `veta_audit` login from
   `AUDIT_DB_PASSWORD` and applies any migrations newer than the dump.

The restore drill in `backend/src/tests/postgres-restore-drill.integration.tc.test.ts`
follows these steps against a backup taken with the production script and
checks that every table's row count matches the source.

## Not yet covered

- Copying backups off the host automatically. Today this relies on where
  `POSTGRES_BACKUP_PATH` points.
