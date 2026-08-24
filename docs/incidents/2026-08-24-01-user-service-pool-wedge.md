# Incident: user-service wedged after a leaked idle-in-transaction connection, sign-in and demo personas down

- **Started**: 2026-08-24 09:39 UTC (leaked connection opened). User-visible failure confirmed live 11:2X-11:55 UTC.
- **Resolved**: 2026-08-24 11:55 UTC.
- **MTTR**: at minimum ~16 minutes from first user report to restored service; the underlying leak had been open for over two hours before it was noticed.
- **User-visible impact**: sign-in failed for all users ("Sign in failed. Check that the user-service is reachable."), demo personas list failed to load ("Failed to load personas — demo mode may be disabled on this deployment"), guest login failed. The GUI did not fail over to the public holding page even though the platform was effectively unusable, because the frontend shell and `/health` endpoints kept responding normally — only specific DB-backed routes were wedged.
- **Detection**: user-reported, from a live screenshot of the sign-in page showing the failure banners.
- **Severity**: SEV1 (core auth path fully down)

## What happened

`/personas` and `/oauth/guest` on user-service hung for exactly the edge's 8-second upstream timeout on every request, then fell through to a 302 redirect to the public status page — but only for those specific routes. `/health` and the frontend static shell kept responding normally throughout, so the top-level domain never failed over to the holding page as a whole; users landed on a half-working sign-in screen instead.

## Root cause

Two distinct problems stacked:

1. A Postgres backend opened by user-service (`application_name=deno_postgres`, pid 929955, `backend_start=2026-08-24 09:39:11 UTC`) was left `idle in transaction` on a bare `BEGIN` for over two hours, holding one slot in the 12-connection `usersPool` (`backend/src/lib/db.ts`). No `BEGIN`/`COMMIT`/`ROLLBACK` appears anywhere in `backend/src/user-service/user-service.ts`'s application code, so this was not an application-level unclosed transaction — most likely a `deno-postgres` driver/session artefact from an earlier aborted request. This alone would only reduce pool capacity by one of twelve; it should not have caused a full hang.
2. After terminating that one connection server-side with `pg_terminate_backend`, the symptom did not clear. Postgres itself was confirmed fully healthy afterward (0 idle-in-transaction sessions, no locks, 7 live `deno_postgres` connections, no blocked queries visible during a live repro of the hang). The in-process `deno-postgres` `Pool` in user-service almost certainly retained stale internal bookkeeping for the externally-killed connection — the pool believes a slot is still checked out because it was closed abnormally (by the server) rather than released by the client (`client.release()` in a `finally` block, present at every call site). New `pool.connect()` calls then queue indefinitely behind a slot that will never be returned. Only a process restart resets that in-process state; there is no live remediation for it once triggered.

`/health` does not touch the database, which is why it kept passing while every DB-backed route hung.

## Diagnostic trail (chronological, with exact commands and results)

1. Confirmed all core containers running and healthy on the homelab (`docker ps`) — ruled out a crash-loop.
2. Ruled out the OVH edge/tunnel as the cause: `edge-status-redirect-1`'s access log showed it answering requests, but following the actual request chain showed Traefik on the homelab returning genuine `502`/`499` for `/personas` and `/oauth/guest` specifically (not `503`/connection-refused), with `Duration` fields of exactly ~8.0s and ~10.0s — i.e. the edge was correctly relaying a real upstream timeout, not itself the fault. `/api/gateway/api/user-service/health` in the same log window returned `200` in single-digit milliseconds throughout.
3. Bypassed the gateway and edge, calling user-service directly inside its own container. Initial probes against port 8080 returned `000` for everything including `/health`, which looked like the process was fully dead — this was a red herring caused by testing the wrong port. `docker inspect`'s `Config.Healthcheck` showed the real port is 5008 (`curl -sf http://localhost:5008/health`). Retested against 5008: `/health` → `200` instantly; `/personas` → hang for the full timeout, `000`.
4. Checked Postgres directly: `pg_isready` OK, CPU/memory nominal, only 13 total connections. `pg_stat_activity` showed one row `state=idle in transaction`, `pid=929955`, query `BEGIN`, `backend_start=2026-08-24 09:39:11.430319+00`. No blocking locks (`pg_locks WHERE NOT granted` was empty).
5. Ran the personas query's `SELECT` directly against Postgres by hand — completed in 1.8s, no hang, 26 rows. Confirmed the query itself and the schema were not at fault.
6. With explicit user confirmation for the production write, ran `SELECT pg_terminate_backend(929955)` — returned `t`. Confirmed immediately after: 0 rows with `state='idle in transaction'`.
7. Re-tested `/personas` and `/oauth/guest` — both still hung for the full timeout. Re-checked Postgres mid-hang (fired a background request, sampled `pg_stat_activity`/`pg_locks` 2s later): no blocked or long-running query visible from user-service at all during the hang window, and no ungranted locks — the request was not reaching Postgres as a fresh query, consistent with it being stuck queued on `pool.connect()` inside the Deno process rather than stuck waiting on the database server.
8. Concluded the in-process connection pool was left in a wedged state by the abnormal (server-side) termination of one of its connections, and that this cannot be fixed without a process restart. No further live, non-destructive diagnostic was available (no debug/introspection endpoint exists on user-service for pool state; a Deno stack-dump signal was not attempted as it is not a supported, safe operation).
9. With explicit user confirmation, ran `docker restart veta-user-service-1`.
10. Confirmed recovery: `docker inspect` showed `status=running health=healthy` ~4s after restart; `GET https://veta.mnetcs.com/api/gateway/api/user-service/personas` returned real persona JSON; `POST .../oauth/guest` returned `200` in 0.46s.

## Fix

Restarted `veta-user-service-1`, which reset the wedged in-process connection pool. This was a same-shape action to a documented prior incident's recovery step, not a new kind of production intervention — see Process notes below on why this did not require the same escalation as a code change.

## Action items

- [ ] Add a startup/periodic connection-age check or `idle_in_transaction_session_timeout` at the Postgres role/database level for `deno_postgres`, so a leaked transaction is auto-reaped by Postgres itself well before it can accumulate for two hours.
- [ ] Investigate whether the `deno-postgres` driver version in use (`v0.19.3`) has a known issue with pool state after an externally-terminated connection, and whether a newer version or a pool-level idle/max-lifetime setting avoids the wedge entirely.
- [ ] Add a liveness check for user-service that specifically exercises a pooled DB query (not just `/health`), so a wedged pool trips the container healthcheck and is caught by monitoring/auto-recovery rather than requiring a user to notice sign-in is down.
- [ ] Consider whether `pg_terminate_backend` should ever be used as a first response to a leaked connection in this codebase, given it appears to have triggered the pool wedge rather than resolving the issue — a targeted app-level fix (or accepting the leak until a scheduled restart) may be safer than a server-side kill for `deno-postgres`-backed services.
- [ ] Investigate why the edge does not fail over the whole domain to the holding page when only specific API routes are down but `/health` and the static shell remain up — the current per-request 8s-timeout-then-redirect behaviour left users on a broken sign-in page instead of a clear "platform down" holding page.
- [ ] Write the required postmortem (MTTR/impact threshold met) — see `postmortems/2026-08-24-user-service-pool-wedge.md`.

## Related

- Incidents: `2026-08-23-01-market-sim-oom-loop.md` (established the "no direct production edits, no admin-merge" rules referenced below)
- Postmortem: `postmortems/2026-08-24-user-service-pool-wedge.md`
