# Runbook: authentication failure spike

Raised by Grafana when the gateway records more than 5 authentication failures in the alert
window.

## Triage

1. Read the gateway logs for `auth_failure` events and group them by source address and
   username.
2. One user repeating a wrong password is normal. Many usernames from one source, or one
   username from many sources, suggests guessing or credential stuffing.
3. Check whether a load generator or probe is using an expired or rotated credential, as
   this was the cause of repeated spikes after secret rotations.

## Act

For a hostile source, block the address at the edge. Confirm the targeted account has a
strong password and is not locked out unexpectedly. Treat any success from a suspicious
source as a compromise: rotate that user's credentials and review the audit log.
