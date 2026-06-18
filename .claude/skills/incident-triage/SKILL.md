---
name: incident-triage
description: Triage a VETA platform outage by mapping the observed symptom to the responsible subsystem, then checking root dependencies (Redpanda, Postgres) and known resource-exhaustion modes before drilling into individual services. Use when the platform appears broken — GUI blank, feed disconnected, sign-in timeout, orders stuck — and you need to find the cause rather than restart the service that looks wrong.
---

# Triage a platform incident

The full procedure lives in the docs playbook and is the source of truth:
`docs/site/src/content/docs/development/playbooks/incident-triage.mdx`. Read it, then triage
outside-in. Service names and ports come from `shared/serviceRegistry.ts` — treat that file
as authoritative rather than relying on remembered ports.

Most outages on this stack trace back to a shared root dependency or a resource-exhaustion
mode, not the service surfacing the symptom. Resist restarting the obvious service first.

1. **Classify the symptom** — GUI blank → frontend/gateway; feed disconnected →
   redpanda/market-sim/gateway WS; sign-in timeout → user-service/postgres; orders stuck →
   oms/ems/journal/redpanda.
2. **Check the two root dependencies** — `rpk cluster health` and `pg_isready` (both via
   `docker compose exec -T`). A broker or DB fault presents as several unrelated service
   failures.
3. **Check resource-exhaustion modes** — unbounded Kafka topics (order/intelligence topics
   lack topic-level retention and have wedged the broker before; check `rpk group describe`
   for lag), Postgres connection saturation (`select count(*) from pg_stat_activity`), and
   OOM crash loops (`docker compose ps`, `docker stats --no-stream`).
4. **Sweep service health root-first** — every backend service exposes `GET /health`; the
   first unhealthy one in dependency order is usually the cause, the rest are symptoms.

Report the symptom, the layer where the break was found, the evidence, and the **root
cause** — not just the service that surfaced it.
