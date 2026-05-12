# Incident: Tabs stuck disconnected after watchtower deploy cycles

- **Started**: rolling; intermittently throughout the day 2026-05-12
- **Resolved**: rolling; PR #194 + PR #196 deployed by ~05:50 UTC
- **MTTR**: per-tab — user-side recovery (hard refresh) was the only path until PR #196 added auto-reload
- **User-visible impact**: Feed disconnected indicator, dashboard rendered with stale prices. Multiple repeated reports from a single user across the day.
- **Detection**: user-reported, repeatedly
- **Severity**: SEV2 — degraded UX during routine deploys

## What happened

Each Watchtower deploy cycle (every 5 min when a new image landed) recreated the gateway and user-service containers, causing all open WebSocket connections to drop. The frontend reconnect logic existed but:

1. After 5 consecutive failures it stopped retrying entirely (PR #190's "gave up" state).
2. The user's stale-tab `/__version` poll silently ignored 404 responses during the deploy window (PR #196's `if (!res.ok) return;` swallow).
3. There was no visibility-change hook to retry on tab refocus.
4. The "Reload now" banner only appeared when `/__version` returned a *new* hash, not when it returned errors.

Net effect: a tab open during a deploy stayed broken until the user noticed and pressed F5.

The user reported this state at least four times during the day with phrasing along the lines of "the feed is still down" — even though the live system was healthy on every check.

## Root cause

Reconnect logic was designed for "transient blip then heal", not for "the server is rebuilding itself every 5 minutes". The threshold for permanent give-up was 5 attempts × exponential backoff = ~62 seconds — shorter than a Watchtower deploy cycle. Once stuck, no mechanism brought the tab back automatically. Documented in the source as "User action required" — itself an admission that the design was wrong.

## Action items

- [x] Remove the permanent give-up state; retry forever at 60s cadence after 3 failures (PR #194). Owner: M, done.
- [x] Add `visibilitychange` and `online` listeners that force an immediate reconnect (PR #194). Owner: M, done.
- [x] Add health-probe before reconnect to detect 401 (session expired) vs other failures (PR #194). Owner: M, done.
- [x] `/__version` poll: track consecutive failures; after 60s of outage AND user is anonymous, auto-reload the tab (PR #196). Owner: M, done.
- [ ] Underlying cause — replacing Watchtower with Swarm (Phase 2) means deploy cycles use rolling restart with `start-first` ordering and zero WS drops. After Phase 2 the tab-stuck class of bug ceases to exist. Owner: M, by: 2026-05-13.
- [ ] Add a Playwright test that simulates a 90-second gateway outage and asserts the tab auto-recovers. Owner: M, by: 2026-05-13.

## Related

- PRs: #190 (introduced give-up state), #194 (removed it, added visibilitychange), #196 (anonymous auto-reload, 15s polling).
