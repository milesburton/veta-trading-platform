# Runbook: Postgres backup alerts

Covers `PostgresBackupStale` (no success for 26 hours), `PostgresBackupFailing` (latest
attempt failed) and `PostgresBackupScrapeDown` (metrics not scraped for 10 minutes).

## Check the job

1. `docker ps -a --filter name=postgres-backup`. The container should be running.
2. `docker logs --tail 50 veta-postgres-backup` shows each attempt and any `pg_dump` or
   `pg_restore` verification error.
3. Confirm the backups volume has space and a recent dump exists.

## Common causes

| Symptom | Cause | Action |
| --- | --- | --- |
| Container exited with 127 | The script or a binary it needs is missing, often a stale bind mount. | Restart the container after the deploy has synced the script. |
| `pg_dump` authentication error | The database password changed. | Check the container receives the current secret and recreate it. |
| Dump written but verification failed | Corrupt or partial dump. | Keep the file, investigate, and run a manual backup. |
| Scrape down but dumps are written | The metrics server died. | Restart the container. |

Restoring from a backup is covered by the Postgres restore runbook.
