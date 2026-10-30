# Runbook: kill switch alert

Raised by the gateway alert router for every kill and resume audit event.
The message gives the scope, who issued it, their role, and how many open
orders were cancelled.

## Confirm it was intended

1. Check that the issuer is a known operator acting deliberately. The audit
   event is the source of truth.
2. If nobody expected it, treat it as a security event: review recent
   `user.access` entries for the issuing account and rotate its credentials.

## While trading is halted

- New orders in the killed scope are held or rejected, so expect an
  order-rejection alert shortly afterwards. That is correct behaviour.
- Cancelled orders are not restored by resuming. Traders must resubmit.

## Resuming

1. Fix or understand the reason for the halt before resuming.
2. Resume the same scope from the kill-switch dialog. A resume audit event
   produces an informational alert.
3. Watch the order-rejection and service alerts for a few minutes. A
   recurring halt means the root cause is not fixed.

## Afterwards

Record the reason and duration of any halt that affected users in the
[incident log](../README.md).
