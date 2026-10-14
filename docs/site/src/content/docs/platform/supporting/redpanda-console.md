---
title: Redpanda console
description: Optional Kafka UI for debugging the message bus.
---

`redpanda-console` (an Apache Kafka UI) ships with the Compose stack as an optional debugging aid. It is not required for the platform to run.

## What it provides

- Topic browser
- Consumer-group inspector
- Live message tail

Useful for confirming event flow during integration debugging or when investigating a missing event in the pipeline.

## Access

In the development stack, Traefik routes it at:

```
http://<host>/admin/redpanda/
```

The console listens on port 8081 inside `trading-net` and publishes no host port. In production its Traefik routing is disabled, so it is not reachable from outside the Docker network.
