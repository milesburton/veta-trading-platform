# Runbook: Redpanda alerts

Covers `RedpandaScrapeDown`, `RedpandaTopicWriteRateHigh`, `RedpandaTopicWriteRateCritical`,
`RedpandaConsumerLagSustained` and `RedpandaUnavailablePartitions`. Most services depend on
the broker, so a Redpanda fault looks like a platform-wide fault.

## Broker health

1. `docker exec redpanda rpk cluster health`
2. `docker ps --filter name=redpanda` and `docker logs --tail 100 redpanda`.
3. Unavailable partitions mean a loss of quorum. Restarting the broker container is the
   first step. Check the disk is not full.

## High write rates

1. Identify the topic from the alert and the producer from `rpk topic consume <topic> -n 5`.
2. A runaway producer, often a forgotten load generator, can write tens of gigabytes per
   day. Stop the producer, not the broker. The `market.*` topics are excluded because they
   are high frequency by design.
3. Check the disk usage alert at the same time.

## Consumer lag

Find the group and topic from the alert. Check the consumer's logs for repeated failures or
slow handlers, and restart it if it is stuck. Lag that grows after a restart means the
consumer cannot keep up with the producer rate.
