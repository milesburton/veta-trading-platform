# Incident: Playwright screenshot tests failing on main blocked all image publishes

- **Started**: 2026-05-12 04:34 UTC (first failing CI on main)
- **Resolved**: 2026-05-12 05:54 UTC (PR #197 merged with fix)
- **MTTR**: ~80 minutes from first red CI to green
- **User-visible impact**: No new container images published during this window. Stale frontend bundles served to users with no path to recovery (older bundles missing recent reconnect-recovery improvements).
- **Detection**: user-reported ("Lets find out why CI and the docker builds are failing")
- **Severity**: SEV2 — silent failure mode, no immediate outage but degraded recovery for stale browser tabs

## What happened

PR #192 (auth-gate refactor) made `AuthGate` strictly require a real user payload from `/sessions/me` before mounting the dashboard. The test mock for `/sessions/me` was registered at the direct path `/api/user-service/sessions/me`, but `App.tsx` actually fetches the gateway-proxied path `/api/gateway/api/user-service/sessions/me`. The catch-all `/api/**` route returned body `"null"`. AuthGate parsed `null`, dispatched `setUser(null)`, redirected to LoginPage, and the screenshot test `screenshot: session-replay-panel` hung waiting for a tab that doesn't exist on the LoginPage.

CI was red on main for three consecutive merges before being noticed.

## Root cause

Two layers:

1. **Direct cause**: route pattern mismatch in `GatewayMock`. One-character fix in PR #197.
2. **Underlying cause**: tests pass against the **Vite dev server** but never against the **built containers**. Many path mismatches, env-var differences, and proxy configuration issues are invisible to the current test suite. We are running production with a fundamentally different wiring than what we test.

## Action items

- [x] Fix route pattern in `GatewayMock` (PR #197). Owner: M, done.
- [ ] Add CI deploy-gate that builds containers + runs Playwright against the running stack — Phase 1 of [operations strategy](../site/src/content/docs/platform/operations-strategy.mdx). This would have caught the regression on PR #192 before it merged. Owner: M, by: 2026-05-12 EOD.
- [ ] Add a CI alert (email to `veta@mnetcs.com`) when main goes red and stays red for more than one merge. Owner: M, by: 2026-05-14.

## Related

- PRs: #192 (introduced), #197 (fixed).
