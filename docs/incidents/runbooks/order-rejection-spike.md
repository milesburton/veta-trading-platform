# Runbook: order rejection spike alert

Raised by the gateway alert router when the number of rejected orders in a
rolling window reaches a threshold. The alert includes the most common
reason. A recovery message is sent when the rate falls.

## Read the dominant reason

| Reason contains | Likely cause | Action |
| --- | --- | --- |
| `Risk check failed` | A pre-trade risk limit or collar is tripping. | Check which code. A single runaway algo or user is common. See the risk controls page. |
| `Risk-engine unreachable` | Risk engine down, orders fail closed. | Follow the service offline runbook for the risk engine. |
| `Trading limits are temporarily unavailable` | User service or limits lookup failing. | Follow the service offline runbook for the user service. |
| `daily limit` or `exceeds your limit` | Users hitting their own limits. | Usually expected. Confirm no limit change was deployed. |
| `MARKET_CLOSED` | Orders submitted outside the session, often from a load generator. | Stop the load generator if it was left running. |
| `schema_invalid` | A client or service is sending malformed orders. | Find the producer and fix it. A recent deploy is the likely cause. |

## Narrow it down

1. Check whether one user or one algo accounts for most rejections, using
   the Orders blotter filtered to rejected.
2. Check whether a load generator or synthetic trader is running.
3. If a single account is flooding, engage the kill switch for that user
   rather than waiting for limits to catch up.

## Afterwards

If the spike was caused by a platform fault, add an incident entry. If the
alert fired from expected load, adjust the threshold through the alert
router settings instead of ignoring it.
