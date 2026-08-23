# Postmortem: market-sim OOM-restart loop

Blameless. See `docs/incidents/2026-08-23-01-market-sim-oom-loop.md` for the incident record.

## What happened (timeline)

- Platform reported zero trades and an apparently offline signal engine, despite every service showing a healthy container status.
- Investigation traced the chain: signal-engine consumes a downstream topic fed by market-sim's tick output; market-sim was OOM-killed and restarted every 15-30 seconds, never surviving long enough to produce a tick.
- Root cause identified: market-sim's shared memory tier no longer had headroom for its startup allocation burst once stacked against newer per-tick market-hours logic and a larger set of concurrent synthetic-trader connections.
- A fix (a dedicated, larger memory limit for market-sim) was applied directly to the running production configuration, by hand, before the corresponding PR existed — done with the user's explicit in-the-moment authorisation, given while the platform was down and trading was fully offline.
- The same fix was then written up properly, tested, reviewed via CI, and merged.
- Afterward, the user reflected on the sequence and reversed the earlier authorisation: direct production edits should never have been offered as an option, regardless of outage pressure or explicit sign-off in the moment.
- Two standing rules were then codified: no merges that bypass required CI checks, and no direct edits to the running production configuration under any circumstance.

## What went well

- The diagnosis was thorough and evidence-driven: distinguishing "market genuinely closed" (expected, e.g. weekends) from "market-sim itself failed" required tracing container restart events, memory sampling over time, and the actual code path introduced by recent changes, rather than assuming the first plausible explanation (market-hours gating) was the cause.
- The fix was minimal and directly targeted at the measured problem, not a broad rewrite.
- Follow-on monitoring was added in the same pass, so the same failure mode pages automatically next time instead of relying on a user noticing no trades are happening.
- The user caught the process problem themselves, on reflection, without prompting, and was specific about why it mattered (a real trading platform cannot let an untested change reach production during a trading day) rather than leaving it as a vague "let's be more careful."

## What we'll change

- Direct edits to the running production configuration are never an option again, including as an emergency escape hatch, including with explicit in-the-moment permission. The recovery path for any outage, however severe, is: branch, fix, PR, checks, merge, deploy — the full pipeline, run fast, not skipped.
- Merges that bypass required status checks (`--admin` or equivalent) are likewise never an option again.
- Both rules are recorded as standing guardrails rather than one-off feedback, specifically so a future moment of outage pressure doesn't recreate the same in-the-moment reasoning that led to the exception being granted this time.
- The incident log itself had a gap: several SEV-worthy outages referenced elsewhere in project history were never filed here, which meant there was no documented precedent to point to when this situation arose. Backfilling that gap is a tracked action item on the incident record.
