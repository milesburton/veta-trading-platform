# Runbook: regulatory record retention

The journal service keeps the legal order record in `regulatory.order_events`
and exports each completed UTC day to the object-locked `regulatory-records`
bucket. This runbook covers checking both and recovering from a gap.

## Verify the chain

1. Call the journal `/regulatory/verify` endpoint. `ok: true` means every row
   hashes correctly and the sequence has no gaps. `ok: false` returns the first
   broken sequence number.
2. A broken chain means a row was altered, removed or inserted out of order.
   Treat it as possible tampering. Follow the Investigate and Contain steps in
   the audit chain runbook, which applies unchanged.
3. `/regulatory/head` returns the newest sequence and hash. Record it alongside
   the audit anchor when taking a manual snapshot.

## Check the export

1. List objects under `orders/` in the `regulatory-records` bucket. Each
   completed day that had orders has a `YYYY/MM/DD/` prefix holding one or
   more `<firstSeq>-<lastSeq>.ndjson` segments. More than one segment means
   records arrived after the first export and were appended, which is expected
   after a reconciliation or a delayed delivery.
2. The journal logs `Exported regulatory records` when it writes a day and
   `Regulatory export failed` on error. It retries every six hours and looks
   back three days.
3. If MinIO credentials are not set on the journal service the export is
   disabled and nothing is logged. Set `MINIO_ENDPOINT`, `MINIO_ROOT_USER` and
   `MINIO_ROOT_PASSWORD`.

## Recover a missing day

1. Confirm the rows exist in `regulatory.order_events` for that day.
2. Restart the journal service. The next export run backfills any missing day
   within the three day lookback.
3. For an older gap, export the rows with a read-only query ordered by `seq`
   and upload them as NDJSON to the matching key. Do not modify the table.

## Retention settings

| Item | Value | Setting |
| --- | --- | --- |
| Hot journal | 90 days | `JOURNAL_RETENTION_DAYS` |
| Hot journal prune mode | Dry-run in `compose.yml` | `JOURNAL_RETENTION_DRY_RUN` |
| Regulatory table | Not pruned | None |
| Export bucket | 1825 days, COMPLIANCE lock | `mc retention set` in `compose.yml` |
| Postgres backups | 14 days | `POSTGRES_BACKUP_RETENTION_DAYS` |

Object lock in COMPLIANCE mode cannot be shortened or removed, including by the
root user. Do not change the retention period on a bucket that holds records.
