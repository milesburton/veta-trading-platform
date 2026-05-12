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

```
http://<host>:8080/
```

In UAT it is reverse-proxied via Traefik but typically not exposed on the public URL — operators reach it over LAN.
