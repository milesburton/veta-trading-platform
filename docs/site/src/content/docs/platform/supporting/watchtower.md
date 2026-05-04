---
title: Watchtower
description: Auto-updates UAT containers when CI publishes a new image.
---

The internal UAT deployment runs [`containrrr/watchtower`](https://github.com/containrrr/watchtower) in label-enable mode. Containers tagged with `com.centurylinklabs.watchtower.enable=true` are pulled and restarted automatically when CI publishes a new `:latest` image to GHCR — typically within five minutes of a merge to `main`.

## Configuration

The UAT Watchtower runs with:

```
WATCHTOWER_LABEL_ENABLE=true
WATCHTOWER_INCLUDE_STOPPED=true
WATCHTOWER_REVIVE_STOPPED=true
WATCHTOWER_POLL_INTERVAL=300
```

The two `STOPPED` flags ensure that if a container has been intentionally stopped (e.g. because of a broken release), Watchtower will still pick up a fixed image once the issue is resolved. Without them an old broken container would sit in `Exited` state forever, even after a fix has been published.

## What Watchtower cannot do

It can update existing containers but **cannot create new ones** from a service definition added since the last deploy. When a brand-new service is added to `compose.yml`, the operator must run `docker compose pull && docker compose up -d <newservice>` once. After that, Watchtower keeps it current.

## Threat model

Watchtower has read-write access to the Docker socket — that is its job. A compromise of Watchtower would yield full host control. The mitigation is treating GHCR pulls as a supply-chain trust boundary; see [Security Posture](../../security/) for the full discussion.
