---
title: Postgres backup
description: Scheduled, verified pg_dump backups with retention and Prometheus alerts for stale or failing runs.
---

The `postgres-backup` container takes a logical backup of the platform
database once a day, checks that it can be read back, prunes old copies and
exposes the result to Prometheus. It is the only scheduled backup of the
database.

## What it does

1. Runs `pg_dump` in custom format into the backup volume. The file is
   written under a `.partial` name and only renamed once it is complete.
2. Verifies the dump with `pg_restore --list`. A dump that cannot be listed
   is discarded and counted as a failure.
3. Prunes dumps older than the retention window, always keeping the newest
   few so a long outage of the job cannot empty the directory.
4. Writes a Prometheus metrics file served on port 8101.

A fresh deployment runs one backup immediately. After that the job runs in
the configured UTC hour. A failed attempt is retried every 15 minutes.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `POSTGRES_BACKUP_PATH` | `postgres-backups` (named volume) | Volume name or host path mounted at `/backups`. |
| `POSTGRES_BACKUP_HOUR_UTC` | `03` | Hour of day for the daily run. |
| `POSTGRES_BACKUP_RETENTION_DAYS` | `14` | Dumps older than this are pruned, except the newest three. |

Point `POSTGRES_BACKUP_PATH` at a directory on a different disk or a network
mount so that the backups survive the loss of the database host. The
container runs without capabilities, so that directory must be writable by
root inside the container.

## Alerts

| Alert | Fires when |
| --- | --- |
| `PostgresBackupStale` | No verified backup for more than 26 hours, or never. Critical. |
| `PostgresBackupFailing` | The latest attempt failed for 30 minutes. |
| `PostgresBackupScrapeDown` | Prometheus cannot scrape the container for 10 minutes. |

The metrics are `veta_postgres_backup_last_success_timestamp_seconds`,
`veta_postgres_backup_last_attempt_timestamp_seconds`,
`veta_postgres_backup_last_status`, `veta_postgres_backup_last_size_bytes`
and `veta_postgres_backup_files`.

## Not yet covered

- Copying backups off the host automatically. Today this relies on where
  `POSTGRES_BACKUP_PATH` points.
- A tested restore procedure. See the restore drill and disaster recovery
  work on the [Professional Standards](../../professional-standards/) page.
