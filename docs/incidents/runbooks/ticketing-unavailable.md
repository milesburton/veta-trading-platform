# Runbook: GitHub ticketing unavailable

Raised when the gateway cannot validate its GitHub ticketing credential or reach the
configured repository for 10 minutes. User bug reports can still reach Discord, but GitHub
issues are not created.

## Diagnose

1. Open the Platform Status ticketing state. It reports `unauthorised`, `forbidden` or
   `unreachable`.
2. `unauthorised` or `forbidden` means the token is expired, revoked or missing repository
   scope. Create a new fine-grained token with issue write access to the repository.
3. `unreachable` means the host cannot reach GitHub. Check DNS and outbound connectivity
   from the host before changing credentials.

## Fix

Store the new token in OpenBao at the path used for the `github_ticketing_token` secret, then
redeploy the gateway. Confirm the ticketing state returns to healthy.
