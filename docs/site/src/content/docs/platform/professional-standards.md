---
title: Professional Standards
description: What this platform implements at production-trading-system grade, and what it does not.
sidebar:
  order: 1
---

This page exists because the platform is built to a single rule:
every engineering decision should pass review by a counterparty
bank's security team. The trading network is a hypothetical we are
not seeking to enter, but the engineering bar that hypothetical implies
is the bar this codebase is held to.

The list below is the operational checklist. Each row names a
capability the platform either implements, partially implements, or
does not implement. Where it links back to source code, dashboards,
or runbooks, those links are the evidence that the claim holds.

A row that reads "not implemented" or "deferred" is also the
checklist of work in front of us.

## Authentication & authorisation

| Capability                                        | State       | Where                                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Real OAuth 2.0 / OIDC against an external IdP | Deferred | Session cookies with a dev-mode user picker. Tracked in [#974](https://github.com/milesburton/veta-trading-platform/issues/974). |
| Role-based access control with explicit role list | Implemented | [`frontend/src/auth/rbac.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/frontend/src/auth/rbac.ts), [`backend/src/user-service/user-service.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/backend/src/user-service/user-service.ts) |
| Per-route authorisation enforced server-side | Implemented | [`gateway-route-auth-inventory.unit.test.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/backend/src/tests/gateway-route-auth-inventory.unit.test.ts) probes every gateway route handler anonymously and fails if one answers without calling `requireAuth`; the public allowlist is the two WebSocket upgrade paths and five inline health/status routes. |
| Authorisation matrix tested per role per endpoint | Implemented | [`gateway-role-matrix.unit.test.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/backend/src/tests/gateway-role-matrix.unit.test.ts) probes every route as every role and compares against a committed matrix, plus the per-service proxy role sets. Regenerate with `UPDATE_ROLE_MATRIX=1`. |
| Session replay attack mitigation                  | Implemented | Tokens validated against user-service on every request; no client-side trust.                                                                                                                                                                                                  |
| Multi-factor authentication | Deferred | Depends on the IdP chosen in [#974](https://github.com/milesburton/veta-trading-platform/issues/974). |

## Pre-trade risk and limits

| Capability                                         | State       | Where                                                                                                                                                                                                                                              |
| -------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-trade limits enforced server-side, not just UI | Implemented | OMS calls `risk-engine /check` before publishing `orders.submitted`; fail-closed on risk-engine outage. See [Risk Architecture](../risk-architecture/).                                                                                            |
| Per-user limits configurable and versioned         | Implemented | Migration [`0014_risk_config_versions.sql`](https://github.com/milesburton/veta-trading-platform/blob/main/backend/db/migrations/0014_risk_config_versions.sql)                                                                                    |
| Position-aware sizing                              | Implemented | [Risk controls page](../risk/)                                                                                                                                                                                                                     |
| Kill switch with multi-scope cancel                | Implemented | [Risk controls page](../risk/)                                                                                                                                                                                                                     |
| Bypass-resistance proven by integration test       | Implemented | [`backend/src/tests/risk-bypass.test.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/backend/src/tests/risk-bypass.test.ts): grep-based allowlist of `orders.new` and `orders.submitted` producers; fails on any new producer. |

## Logging, audit, and observability

| Capability                                                      | State                | Where                                                                                                                                                                                    |
| --------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three-pillar OTel (metrics + traces + logs)                     | Implemented          | [Observability page](../observability/)                                                                                                                                                  |
| Audit log of every privileged action | Partially | `user.access` events captured; storage is not append-only. Tracked in [#961](https://github.com/milesburton/veta-trading-platform/issues/961). |
| Log retention policy documented | Deferred | No formal retention policy. Tracked in [#964](https://github.com/milesburton/veta-trading-platform/issues/964). |
| Per-stage pipeline latency tracking                             | Implemented          | [Performance page](../../analytics/performance/)                                                                                                                                         |
| Alerts on service offline, kill-switch events, order rejections | Implemented (in-app) | [`alertsMiddleware.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/frontend/src/store/middleware/alertsMiddleware.ts), though only visible to users with a tab open. |
| Active alert delivery to operators (Slack/Discord/email/page) | Implemented | The gateway [alert router](../observability/alerts/) delivers service-offline, kill-switch and order-rejection-spike alerts to the webhook with de-duplication and recovery messages; probe failures use the same channel. Email and paging are not wired. |
| NOC dashboard for unattended monitoring | Partially | `estate-overview` panel exists; dedicated NOC workspace tracked in [#969](https://github.com/milesburton/veta-trading-platform/issues/969). |
| Synthetic probes that emulate user journeys | Partially | [Synthetic probe](../supporting/synthetic-probe/) runs every 60 s from the edge and after each deploy: page load, guest login, gateway readiness, personas and market feed. No order flow yet. Tracked in [#970](https://github.com/milesburton/veta-trading-platform/issues/970). |
| Runbooks linked from each alert | Partially | One runbook in [`docs/incidents/runbooks/`](https://github.com/milesburton/veta-trading-platform/tree/main/docs/incidents/runbooks); alerts do not link to runbooks. Tracked in [#968](https://github.com/milesburton/veta-trading-platform/issues/968). |

### Live error-rate posture

The Service Performance dashboard's "Error rate" stat reflects the
percentage of traced HTTP/RPC spans tagged `STATUS_CODE_ERROR`. We
publish the live number rather than only the aspirational target,
on the principle that a healthy platform's claim about its error
rate should be falsifiable.

| Window          | Filter                                                                                            | Recent rate                                                    | Notes                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw (all spans) | None                                                                                              | ~5%                                                            | Includes by-design 401/403/404 responses (auth gates), `/health` probes that timeout, and connection-refused on services still starting. Not a useful "is it broken" signal on its own. |
| Filtered        | Excludes `/health`, `/healthz`, `/api/overview`, `/logs/query` paths and 401/403/404 status codes | **target <1%**, currently ~0.4% after the OMS-poll-timeout fix | This is the figure we treat as the operational SLO.                                                                                                                                     |

The journey here is non-trivial and worth recording: at one point the
filtered rate was 98% because of a feature-engine fan-out bug
([PR #96](https://github.com/milesburton/veta-trading-platform/pull/96))
that fired one Journal HTTP fetch per Kafka tick instead of per
schedule. The dashboard correctly flagged the failure but the
volume drowned out genuine signal until the bug was fixed and
the dashboard query was tightened to exclude by-design 4xx
responses.

#### What "Filtered" excludes and why

- `/health`, `/healthz`: periodic poll endpoints. The `gateway`
  service runs a 5-second `chk()` loop against ~30 downstream
  services. Even a 2% timeout rate on those probes shows up
  visibly in raw error rate, but it represents transient slowness,
  not a real failure.
- `/api/overview`: Traefik dashboard endpoint, only reachable on
  the server; absence is expected through the public edge.
- `/logs/query`: the gateway's logs route, returns 403 to viewer
  roles. By-design auth gating, not a server error.
- HTTP `401`, `403`, `404`: by-design auth/authz responses. A
  viewer hitting an admin route returns 401; the dashboard should
  not count that as a service failure.

#### What "Filtered" still includes (and we don't suppress)

- 5xx server errors from any service
- Connection refused / timeout on internal service-to-service calls
  _that aren't probes_. These are real degradation.
- Span exceptions raised by application code (`recordException`)

These are the signals we want to surface, and they show how we know
when something is genuinely wrong. The remaining ~0.4% is dominated
by transient `journal /orders` polls (OMS expire-orphan loop) that
sometimes time out under load. Each follow-up PR named in the
"Where" column above will reduce this further.

## Container hardening and runtime security

| Capability                                 | State       | Where                                                                                    |
| ------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------- |
| `cap_drop: ALL` on every service container | Implemented | [Security posture page](../security/)                                                    |
| Read-only root filesystems where feasible  | Implemented | [Security posture page](../security/)                                                    |
| Non-root user inside containers            | Implemented | [Security posture page](../security/)                                                    |
| `no_new_privileges: true`                  | Implemented | [Security posture page](../security/)                                                    |
| Resource limits per container              | Implemented | `compose.yml` per-service `mem_limit` / `cpus`                                           |
| Secrets in env vars vs proper secret store | Partially   | Production secrets in a self-hosted [OpenBao](../supporting/openbao/) with an audit log; `.env` used for dev only. Containers still receive them as env vars, and the vault auto-unseals on the same host. |
| mTLS between services | Deferred | Plain HTTP within the internal Docker network. Build or declare a non-goal: [#976](https://github.com/milesburton/veta-trading-platform/issues/976). |

## Network exposure and rate limiting

| Capability                                             | State       | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public surface area documented | Partially | [API gateway page](../../reference/api-gateway/) lists routes; no formal exposed-versus-internal classification. Tracked in [#972](https://github.com/milesburton/veta-trading-platform/issues/972). |
| Rate limiting per endpoint, per IP, per user           | Implemented | Token-bucket limiter at the gateway: per-IP cap on every request plus tighter per-user cap on authenticated routes. See [`backend/src/lib/rate-limit.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/backend/src/lib/rate-limit.ts), wired in [`backend/src/gateway/gateway.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/backend/src/gateway/gateway.ts).                                                                                                                                                                                                 |
| DDoS protection at edge | Deferred | The edge is a Traefik proxy reached over a reverse tunnel, with no CDN or WAF layer. Tracked in [#978](https://github.com/milesburton/veta-trading-platform/issues/978). |
| CSP and security headers (HSTS, X-Frame-Options, etc.) | Partially | The edge Traefik (`edge/dynamic.yml`) sets HSTS (one year, subdomains, preload), `nosniff`, a strict referrer policy, frame denial and a Content-Security-Policy with `default-src 'self'`. `script-src` and `style-src` still allow `'unsafe-inline'` (theme script in `index.html`, React inline styles). Remaining: nonce or hash for the script, then drop `'unsafe-inline'`. |
| WebSocket origin checking                              | Implemented | Gateway WS handler validates `Origin` header.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Egress control from application containers | Partially | `trading-net` is a Docker `internal: true` network (verified against production dockerd: container-to-container DNS and TCP still work, direct internet connections are refused); every other service, including the OMS, EMS, risk engine, journal, algos and market simulator, has no route to the internet at all. `gateway`, `market-data`, `discord-bot`, and `traefik` also join an unrestricted `egress-net` for genuine external connectivity, and `ollama-model-pull` joins it briefly during startup bootstrap. A DNS-aware allowlisting proxy, scoping internet-capable services to only their known destinations, is planned, tracked in [#975](https://github.com/milesburton/veta-trading-platform/issues/975). |

## Code provenance and supply chain

| Capability                                    | State       | Where                                                                                                                                                                                             |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency scanning                           | Implemented | Dependabot alerts and security updates are enabled. |
| Secret scanning                               | Implemented | GitHub secret scanning with push protection and generic-secret patterns. Pre-commit blocks staged secret files. |
| Static analysis                               | Implemented | CodeQL `javascript-typescript` through GitHub default setup, on pull requests, pushes to main and a weekly schedule. |
| SBOM generation per build | Deferred | Planned: `syft` in the image build. Tracked in [#965](https://github.com/milesburton/veta-trading-platform/issues/965). |
| Container image signatures | Deferred | Planned: `cosign` in the image publish workflow. Tracked in [#965](https://github.com/milesburton/veta-trading-platform/issues/965). |
| Reproducible builds with pinned image digests | Partially | Compose uses `:latest` tags from GHCR; digest pinning tracked in [#966](https://github.com/milesburton/veta-trading-platform/issues/966). |

## Data classification and retention

| Capability                                        | State       | Where                                                                 |
| ------------------------------------------------- | ----------- | --------------------------------------------------------------------- |
| Data classification documented | Deferred | Fields not yet classified. Tracked in [#963](https://github.com/milesburton/veta-trading-platform/issues/963). |
| Retention policy per data class | Deferred | Journal events are retained indefinitely. Tracked in [#964](https://github.com/milesburton/veta-trading-platform/issues/964). |
| Log scrubbing (no PII / tokens leaking into logs) | Deferred | The logger performs no redaction and no test covers it. Tracked in [#962](https://github.com/milesburton/veta-trading-platform/issues/962). |
| Encryption at rest | Partially | Postgres on an encrypted disk on the server; not enforced in the stack. Tracked in [#973](https://github.com/milesburton/veta-trading-platform/issues/973). |
| Encryption in transit (public surfaces only)      | Implemented | TLS at the public edge proxy.                                         |

## Performance and capacity

| Capability                          | State       | Where                                                                                                                                                                                     |
| ----------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repeatable load-test harness        | Implemented | k6 scenarios in [`k6/`](https://github.com/milesburton/veta-trading-platform/tree/main/k6); see [k6 load testing](../../development/testing/k6-load-testing/).                            |
| Mixed-strategy load (all 9 algos)   | Implemented | [`k6/mixed-strategy.js`](https://github.com/milesburton/veta-trading-platform/blob/main/k6/mixed-strategy.js): weighted realistic distribution.                                           |
| Open-bell burst pattern             | Implemented | [`k6/burst-open.js`](https://github.com/milesburton/veta-trading-platform/blob/main/k6/burst-open.js): 0 to 200 VUs in 30s, hold 5min.                                                    |
| Sustained soak for memory leaks     | Implemented | [`k6/soak.js`](https://github.com/milesburton/veta-trading-platform/blob/main/k6/soak.js): 25 VUs for 30min, configurable.                                                                |
| Risk-engine pressure test           | Implemented | [`k6/risk-stress.js`](https://github.com/milesburton/veta-trading-platform/blob/main/k6/risk-stress.js): weighted under/at/over-limit mix.                                                |
| Live load-test telemetry to Grafana | Implemented | k6 writes to Prometheus via remote-write; rendered on the **k6 Prometheus** dashboard.                                                                                                    |
| Performance regression tracking | Partially | JSON summaries written per run to [`docs/site/src/data/loadtest/`](https://github.com/milesburton/veta-trading-platform/tree/main/docs/site/src/data/loadtest); no CI gate. Tracked in [#971](https://github.com/milesburton/veta-trading-platform/issues/971). |
| Load tests scheduled in CI          | Implemented | `load-tests.yml` runs `mixed-strategy.js` daily at 06:15 UTC and on manual dispatch; scheduled runs skip when all markets are closed.                                                     |

## Recovery and operational drills

| Capability                            | State    | Where                                                                          |
| ------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| Postgres backup running on schedule | Partially | [Daily verified `pg_dump`](../supporting/postgres-backup/) with retention and Prometheus alerts for stale or failing runs. Off-host copy relies on where the backup path is mounted. Tracked in [#955](https://github.com/milesburton/veta-trading-platform/issues/955) and the restore drill in [#956](https://github.com/milesburton/veta-trading-platform/issues/956). |
| Restore drill performed at least once | Deferred | Untested. Tracked in [#956](https://github.com/milesburton/veta-trading-platform/issues/956). |
| Redpanda topic snapshots | Deferred | No snapshotting; snapshots versus journal replay is tracked in [#977](https://github.com/milesburton/veta-trading-platform/issues/977). |
| Documented disaster-recovery runbook | Deferred | No DR runbook. Tracked in [#957](https://github.com/milesburton/veta-trading-platform/issues/957). |
| Incident log and postmortems          | Implemented | [`docs/incidents/`](https://github.com/milesburton/veta-trading-platform/tree/main/docs/incidents) holds a template, seven incident entries and two postmortems. |

## Deliberate non-goals

These would each be appropriate for a real platform but are
out of scope for this codebase. The reasoning is documented so that
the gaps are obvious choices rather than oversights.

| Non-goal                                          | Reasoning                                                                                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer fund custody                             | Trading platforms either custody funds themselves (heavily regulated) or route to a broker. We route hypothetically, with no real funds in flight. |
| Real-time market data redistribution              | Bloomberg / Refinitiv vendor licensing is six-figures-per-year. We use synthetic data plus delayed Alpha Vantage quotes.                           |
| Multi-tenancy                                     | A platform serving multiple users is a different system. This is single-user (your own account, your own broker).                                  |
| Real money                                        | Even with a real broker, we don't intend to wire this up to live execution. The simulation provides what we need to demonstrate the engineering.   |
| Regulatory reporting (MiFID II, EMIR, Dodd-Frank) | Real platforms ship reports to trade repositories. We log enough to _generate_ such reports if needed but don't wire up the submission.            |
| Compliance surveillance hooks                     | Spoofing detection, layering detection, wash-trade detection. Out of scope; would need a separate surveillance service.                            |

## How this page stays honest

Each "Implemented" row above has a link to source code, a dashboard,
or a runbook. If any of those rot, the row should drop to "Partially"
or "Deferred" and a follow-up PR opens. The page is reviewed alongside
every PR that touches an implementing component.

If you find a row that says "Implemented" but the underlying evidence
has rotted, that is a bug. Open an issue and we will either fix the
underlying gap or downgrade the row.
