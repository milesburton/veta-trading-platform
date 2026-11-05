# Runbook: audit log hash chain broken

Raised by the gateway alert router when the periodic call to the journal
`/audit/verify` endpoint reports a broken hash chain. The alert includes the
first broken sequence number. A recovery message is sent when verification
passes again.

A broken chain means a row in `audit.events` was altered, deleted or inserted
out of order. Treat it as a possible tampering event until shown otherwise.

## Confirm

1. Request the verification result again as an admin:
   `GET /api/gateway/audit/verify`. A transient database error does not raise
   this alert, so a repeat result of `ok: false` is real.
2. Read the events around the reported sequence with
   `GET /api/gateway/audit/events`, and compare the neighbouring rows for
   missing sequence numbers or out of order timestamps.

## Anchor mismatch

The alert "Audit log no longer matches its external anchor" means the database
disagrees with the newest chain head stored in the `audit-anchors` MinIO bucket.
Either the newest rows were removed (the database ends before the anchored
sequence) or the row at the anchored sequence was rewritten.

1. List the anchors: objects under `anchors/` are named by zero padded sequence.
   Compare the newest with the anchor message in the operator channel.
2. If the two anchor copies agree, trust them over the database and follow the
   Investigate and Contain sections below, restoring from backup into a scratch
   database to recover the removed rows.
3. If a bogus anchor sits above the real one, the bucket credentials may be
   compromised. Rotate `MINIO_ROOT_PASSWORD` as well.

The warning "Audit anchor store is unreachable" means the comparison cannot run.
Check the `minio` container and the `audit-anchors` bucket, which `minio-init`
creates with object lock.

## Investigate

| Finding | Likely cause | Action |
| --- | --- | --- |
| A gap in the sequence | Rows were deleted. | Restore from the latest backup into a scratch database and compare. Check who held database write access. |
| A row with changed fields | Row was updated directly. | Identify the change from the backup copy. Check the Postgres logs for the statement. |
| Break appears right after a migration | A migration touched `audit.events`. | Review the migration. Restore the chain only with the owner's approval. |

## Contain

1. Do not delete or rewrite audit rows to make the chain verify.
2. Rotate the database and internal service credentials if direct access is
   suspected, following the secrets rotation runbook in the deployment docs.
3. Preserve a dump of `audit.events` before any repair.

## Afterwards

Add an incident entry with the first broken sequence, the cause and the
credentials rotated.
