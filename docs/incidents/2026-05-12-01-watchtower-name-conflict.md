# Incident: Watchtower partial-recreate left 19 services offline

- **Started**: 2026-05-12 06:42 UTC
- **Resolved**: 2026-05-12 06:55 UTC
- **MTTR**: ~13 minutes (from detection to recovery; actual outage began at 06:42 but went undetected until ~06:50)
- **User-visible impact**: `https://veta.mnetcs.com/` returned 404. Sign-in unavailable. Order flow unavailable. Live feed disconnected for all tabs.
- **Detection**: user-reported ("Looks like the homelab is entirely offline now")
- **Severity**: SEV1 — full platform outage

## What happened

Watchtower 1.7.0 began a deploy cycle at 06:42 UTC, sending SIGTERM to 30+ containers in a batch over the following 35 seconds. It then began recreating them. The first 14 recreations succeeded. From 06:46 UTC onward, every subsequent `Creating` step failed with:

> Error response from daemon: Conflict. The container name "/veta-frontend-1" is already in use by container "<hash>". You have to remove (or rename) that container to be able to reuse that name.

19 services (frontend, market-sim, user-service, journal, ems, oms, kafka-relay, news-aggregator, fix-archive, fix-exchange, feature-engine, signal-engine, recommendation-engine, llm-advisory, llm-worker, replay-service, risk-engine, product-service, ccp-service, dark-pool, market-data, market-data-adapters, rfq-service, db-migrate) failed to recreate and stayed offline.

Recovery was a single `docker compose up -d --remove-orphans` on the homelab.

## Root cause

Known bug in Watchtower 1.7.0 batch-stop / batch-recreate logic: stopped containers' names are not released back to Docker's namespace before the recreation phase begins. Recreations of the same name fail with a conflict; Watchtower does not retry or remove the conflicting stopped shells. The stack ends up half-deployed indefinitely.

The deeper root cause is **using Watchtower at all** for a platform with availability requirements. It is designed for personal lab toys where occasional breakage is acceptable.

## Action items

- [ ] Replace Watchtower with single-node Docker Swarm + `docker stack deploy` — Phase 2 of [operations strategy](../site/src/content/docs/platform/operations-strategy.mdx). Owner: M, by: 2026-05-13.
- [ ] Stand up external synthetic probe so the next outage of this class is detected within 4 minutes, not after a user notices. — Phase 4. Owner: M, by: 2026-05-14.
- [ ] Add a deploy-time smoke gate that fails non-zero (with rollback) if not every named service is healthy after the deploy completes. — Part of Phase 2. Owner: M, by: 2026-05-13.

## Related

- PRs: this PR (operations strategy doc itself); future Phase 2 PR.
- Postmortem: see strategy doc — outage is the worked example justifying the entire strategy. No separate postmortem; this entry plus the strategy doc serves the same purpose.
