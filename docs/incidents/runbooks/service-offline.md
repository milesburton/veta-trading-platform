# Runbook: service offline alert

Raised by the gateway alert router when a non-optional service fails its
health check for several consecutive polls. The alert names the service.
A recovery message is sent when it returns.

## Triage

1. Open the Estate Overview panel, or call the gateway `GET /services/status`
   endpoint, and confirm the service is still reported as `error`. A recovery
   message in the alert channel means it has already cleared.
2. Check whether it is isolated. If several services are down together, the
   cause is almost always shared infrastructure: Postgres, Redpanda, or the
   host itself. Work on that first.
3. Check what changed. A deploy in the last few minutes is the most likely
   cause. A service that is `starting` is not an outage.

## Diagnose

```bash
scripts/veta-compose.sh ps
scripts/veta-compose.sh logs --tail 200 <service>
```

Look for out-of-memory kills, crash loops, failed migrations, and
connection errors to Postgres or Redpanda.

## Recover

- Crash loop on a bad deploy: roll back to the previous image and file an
  incident.
- Out of memory: restart the service, then raise the limit only if the
  growth is expected. Otherwise treat it as a leak and file an issue.
- Dependency down: restore the dependency first, then restart dependants
  that did not reconnect.

```bash
scripts/veta-compose.sh up -d <service>
```

## Afterwards

Any outage with more than five minutes of user-visible impact needs an
incident entry. See the [incident log](../README.md) and
[template](../TEMPLATE.md).
