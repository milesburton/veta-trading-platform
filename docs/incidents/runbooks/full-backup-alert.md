# Runbook: full backup alerts

Covers `FullBackupStale` (no success for 26 hours) and `FullBackupFailing` (the latest run
failed). The metrics come from the host backup script through the disk monitor, so a missing
series means either the first backup has not run or the disk monitor is down.

## Check the job

1. `systemctl status veta-full-backup.service veta-full-backup.timer` shows the last result and
   the next run.
2. `journalctl -u veta-full-backup.service -n 50` shows each step and the failing one.
3. `cat /opt/stacks/veta/state/full-backup.prom` shows what the monitor serves.

## Common causes

| Symptom | Cause | Action |
| --- | --- | --- |
| `could not take the deploy lock` | A deploy held the lock for over 30 minutes. | Check the auto-pull service, then start the backup unit again. |
| `no age recipient file` | The recipient file was removed. | Restore `secrets/backup-age-recipient.txt` with the public key. |
| `dump cannot be read back` | The database container was unhealthy. | Fix the container, then start the unit. |
| `the vault did not come back` | The vault is slow to unseal after the brief stop. | Check `docker exec veta-openbao bao status` first. |
| Run succeeds but the alert persists | The disk monitor is not serving the file. | Check the `veta-disk-monitor` container and that the state directory is world readable. |

A failed run removes its partial output and leaves the previous backups untouched. Start a run
by hand with `sudo systemctl start veta-full-backup.service`.
