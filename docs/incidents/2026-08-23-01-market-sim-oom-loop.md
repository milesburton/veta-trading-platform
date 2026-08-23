# Incident: market-sim OOM-restart loop takes trading fully offline

- **Started**: not known precisely; likely began shortly after the market-hours-per-asset-class and per-desk synthetic-trader changes landed. Confirmed live on 2026-08-23, mid-afternoon UTC.
- **Resolved**: 2026-08-23, same afternoon.
- **MTTR**: under 30 min from first reproduction to a stable service.
- **User-visible impact**: zero trades. The signal-engine service reported healthy but was silent — it consumes a downstream topic that depends on market-sim's tick output, so the entire signal pipeline was dark with no forward progress.
- **Detection**: user-reported ("why is our fake trader not live? There are no trades at all").
- **Severity**: SEV1

## What happened

market-sim was being killed by the kernel OOM killer and restarted roughly every 15-30 seconds, continuously, several hundred times. Each restart looked healthy in isolation (clean startup log lines, a passing container healthcheck window before the kill), which made the outage easy to miss from surface-level monitoring — nothing was crash-looping in an obviously broken way, it just never survived long enough to produce a tick.

## Root cause

market-sim ran on a shared memory tier sized for a lighter load than it now carries. Two independent changes had landed since that tier was sized: the market simulator now runs a per-tick, per-asset-class market-hours calendar check on every 250ms cycle, and eight synthetic-trader desk instances now run concurrently, each polling and holding a live connection against market-sim. Combined with the existing startup price-prewarm step (a CPU/allocation burst across the full instrument universe), the container's memory usage spiked to its limit within 1-2 seconds of every boot, well before the tick loop could stabilise.

## Fix

Gave market-sim its own memory limit instead of sharing the smaller tier used by lighter services. Also added a metric distinguishing "market genuinely closed" from "market-sim stopped producing while it should be open," and a monitoring rule on it, so this class of failure pages automatically rather than waiting for a user to notice no trades are happening.

## Process failure (the part that matters more than the bug)

The technical diagnosis and fix were correct, but the immediate fix was applied by hand-editing the running production configuration directly, before the corresponding pull request had even been merged. This was done under direct, explicit permission from the user in the moment — given while frustrated at a live outage — but it was still wrong: an untested change reaching a live trading platform during what would be a trading day is not an acceptable trade-off for faster recovery, even when the change is believed correct and even when the person authorising it is the platform owner. This platform models real trading discipline; the discipline has to hold under outage pressure, not just when things are calm.

The user reversed this decision after the fact. Direct production edits, and merges that bypass required checks (`--admin`), are now both permanently disallowed with no ask-first exception for either. The correct response to a live outage is to diagnose and fix fast and push the fix through the full review-and-deploy pipeline fast — never to go around it.

## Action items

- [x] Fix market-sim's memory ceiling and add the silent-feed alert. PR #584.
- [x] Codify "no admin-merge" and "no direct production edits, ever" as standing rules.
- [ ] Backfill the incident log for outages between 2026-05-13 and today — several SEV-worthy incidents referenced in project history were never filed here, which is why this pattern (technically-correct-fix-applied-the-wrong-way) wasn't caught by a documented precedent until now.
- [ ] Write the required postmortem (MTTR/impact threshold met) — see `postmortems/2026-08-23-market-sim-oom-loop.md`.

## Related

- PRs: #584
- Postmortem: `postmortems/2026-08-23-market-sim-oom-loop.md`
