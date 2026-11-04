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
