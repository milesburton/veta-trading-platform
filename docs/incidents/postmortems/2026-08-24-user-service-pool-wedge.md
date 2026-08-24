# Postmortem: user-service connection-pool wedge

Blameless. See `docs/incidents/2026-08-24-01-user-service-pool-wedge.md` for the incident record.

## What happened (timeline, UTC)

- **09:39** — A Postgres backend from user-service opened a bare `BEGIN` and never completed it, going `idle in transaction` and holding one of twelve `usersPool` slots. No application code path issues an explicit `BEGIN`; this was most likely a `deno-postgres` driver artefact from an earlier request that didn't clean up correctly.
- **~11:2X** — User reported the sign-in page showing "Sign in failed" and "Failed to load personas", with the top-level status bar still showing 40/40 services green and the feed marked disconnected. The platform was not failed over to the public holding page.
- Investigation ruled out, in order: a container crash-loop (none — all containers healthy, 0 restarts), the OVH tunnel/edge (healthy, correctly relaying real upstream timeouts rather than failing itself), and a wrong-port red herring during direct-container testing that briefly looked like the whole process was down.
- Root cause narrowed to Postgres: one connection stuck `idle in transaction` since 09:39, discovered via `pg_stat_activity`.
- With the user's explicit confirmation, the stuck backend was terminated via `pg_terminate_backend`. Postgres was immediately confirmed clean (no idle-in-transaction sessions, no locks). The user-visible symptom did not clear.
- Further investigation (firing a request and sampling `pg_stat_activity`/`pg_locks` mid-hang) showed the hung request was not reaching Postgres as a live query at all — ruling out the database server as the ongoing cause and pointing at the in-process connection pool inside user-service itself, left in a bad state by the abnormal, server-side termination of one of its connections.
- With the user's explicit confirmation, `veta-user-service-1` was restarted. Service recovered within seconds: `/personas` returned real data, `/oauth/guest` returned `200` in under half a second.
- **11:55** — Confirmed resolved.

## What went well

- The diagnosis stayed evidence-driven throughout: every hypothesis (crash-loop, tunnel flap, wrong port, Postgres lock contention, pool exhaustion) was tested directly against live output rather than assumed, including catching and correctly discarding a self-inflicted wrong-port red herring instead of letting it stand as "the process is dead."
- Root cause was traced two layers deep — not just "a connection leaked" but "terminating that connection server-side likely wedged the in-process pool," which is the more useful and more specific finding for prevention.
- Every production-affecting action (the `pg_terminate_backend` call and the container restart) was proposed with its reasoning and blast radius stated up front, and executed only after explicit per-action user confirmation — including a case where the auto-mode permission classifier itself blocked the first attempt and required a direct follow-up confirmation before proceeding. No action was taken on the strength of an earlier, more general approval.
- Recovery was fast once the correct root cause was found: under a minute from "restart confirmed" to a verified, fully working sign-in/personas/guest-login path.

## What could have gone better

- The leaked connection sat for over two hours before anyone noticed. There is currently no automated detection for `idle in transaction` sessions or for a wedged connection pool — this was caught only because a user happened to look at the sign-in page and report what they saw.
- The first remediation attempt (`pg_terminate_backend`) turned out to plausibly make things worse rather than better, by moving the failure from "one leaked connection, eleven of twelve slots still usable" to "the whole pool wedged." This wasn't knowable in advance without prior experience of this specific driver's behaviour, but it's now a documented risk for this codebase specifically.
- The edge's behaviour when only some API routes are down (timeout-then-redirect per request, only for one route family) produced a confusing, half-broken UI rather than a clean "platform down" signal — the user saw a live sign-in form with red error banners rather than a holding page, even though the platform was, in effect, fully unusable for its primary purpose.

## Relationship to the standing "no direct production edits, no admin-merge" rules

Both actions taken here — terminating a Postgres backend, and restarting a container — are standard, reversible operational recovery actions using the platform's own approved tooling (`psql`, `docker restart`), not code changes, not hand-edited configuration, and not a bypass of any CI or review gate. They are categorically different from the market-sim incident's direct hand-edit of a running service's configuration to work around an untested fix. The standing rule against direct production edits targets *unreviewed code/config changes reaching production outside the pipeline*; it was not intended to and does not forbid restarting a wedged process or terminating one bad database session as part of live incident response. Each such action was still gated on explicit, per-action user confirmation rather than assumed from a general "go ahead," consistent with how operational (non-code) production actions are handled elsewhere in this project.

## What we'll change

- Add `idle_in_transaction_session_timeout` (or equivalent periodic reaper) for the `deno_postgres` role so a leaked transaction is auto-cleared long before it can sit for hours.
- Add a DB-touching liveness probe for user-service (not just the current dependency-free `/health`) so a wedged pool trips the container healthcheck automatically instead of waiting for a user to notice sign-in is broken.
- Investigate the `deno-postgres` pool's behaviour after an externally-terminated connection, and prefer a safer remediation than `pg_terminate_backend` for this driver if one exists (e.g. restart-first, or a pool `maxLifetime`/idle-eviction setting that self-heals without a server-side kill).
- Investigate making the edge fail over the whole domain to the holding page when core user-facing flows (sign-in, personas) are down, even if `/health` and static assets remain reachable, so the user experience during a partial outage is a clear "down" state rather than a misleadingly live but broken sign-in form.
