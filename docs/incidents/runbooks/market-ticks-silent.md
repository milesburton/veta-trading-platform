# Runbook: market.ticks silent while the market is open

Raised when `market.ticks` has no traffic although at least one asset class is in session.
Prices on every screen freeze, and the algos stop slicing.

## Check in order

1. Is market-sim running and healthy? `docker ps --filter name=market-sim`.
2. Is the broker healthy? See the Redpanda runbook.
3. `docker exec redpanda rpk topic consume market.ticks -n 5` shows whether ticks arrive.
4. Check market-sim logs for Kafka producer errors or a "message too large" failure.

## Recover

Restart market-sim once the broker is healthy. If the market is configured closed for the
session, confirm the schedule before treating it as an incident.
