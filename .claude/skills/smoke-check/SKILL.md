---
name: smoke-check
description: Verify the locally-running VETA platform actually works end to end (fleet, HTTP, WebSocket, market-data feed, logs) after a change or deploy. Use whenever a change has been applied and you need to confirm the running stack is healthy, not just that CI or unit tests passed. CI-green does not mean the platform works.
---

# Smoke-check the running platform

The full procedure lives in the docs playbook and is the source of truth:
`docs/site/src/content/docs/development/playbooks/smoke-check.mdx`. Read it, then execute
the five layers against the running stack.

Walk the layers in order and **stop at the first failing layer** — a later layer rarely
passes when an earlier one is broken:

1. **Fleet** — `deno run --allow-run --allow-env scripts/status.ts --once`. Core services
   must be running; idle-safe groups may be down unless the change touches them.
2. **Gateway HTTP** — `curl -sf http://localhost/api/gateway/health` should return
   `status:"ok"`.
3. **WebSocket** — confirm the client path is `/ws/gateway` (not `/ws`) in
   `frontend/src/store/middleware/gatewayMiddleware.ts`; a GET to the route returns `426`
   when wired correctly.
4. **Feed** — `curl -s http://localhost/api/market-sim/prices` should return a populated
   price map; confirm Kafka with `docker compose exec -T redpanda rpk topic consume market.ticks -n 5`.
5. **Logs** — tail the services the change touched for crash loops or reconnect storms.

Report per-layer what you ran and observed. Name any failing layer with its exact output;
do not declare the platform healthy on the strength of CI. If you skipped layers, say which
and why.
