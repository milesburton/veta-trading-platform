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

| Capability | State | Where |
|---|---|---|
| Real OAuth 2.0 / OIDC against an external IdP | Deferred | Currently uses session cookies + dev-mode user-picker. PR pending: switch to GitHub OAuth or self-hosted Keycloak. |
| Role-based access control with explicit role list | Implemented | [`frontend/src/auth/rbac.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/frontend/src/auth/rbac.ts), [`backend/src/user-service/user-service.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/backend/src/user-service/user-service.ts) |
| Per-route authorisation enforced server-side | Partially | Most routes go through `requireAuth`, but no integration test proves *every* route does. Audit pending. |
| Authorisation matrix tested per role per endpoint | Deferred | Test suite exists for individual routes; no consolidated matrix. |
| Session replay attack mitigation | Implemented | Tokens validated against user-service on every request; no client-side trust. |
| Multi-factor authentication | Deferred | Depends on the OAuth IdP we choose. |

## Pre-trade risk and limits

| Capability | State | Where |
|---|---|---|
| Pre-trade limits enforced server-side, not just UI | Implemented | OMS calls `risk-engine /check` before publishing `orders.submitted`; fail-closed on risk-engine outage. See [Risk Architecture](../risk-architecture/). |
| Per-user limits configurable and versioned | Implemented | Migration [`0014_risk_config_versions.sql`](https://github.com/milesburton/veta-trading-platform/blob/main/backend/db/migrations/0014_risk_config_versions.sql) |
| Position-aware sizing | Implemented | [Risk controls page](../risk/) |
| Kill switch with multi-scope cancel | Implemented | [Risk controls page](../risk/) |
| Bypass-resistance proven by integration test | Implemented | [`backend/src/tests/risk-bypass.test.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/backend/src/tests/risk-bypass.test.ts): grep-based allowlist of `orders.new` and `orders.submitted` producers; fails on any new producer. |

## Logging, audit, and observability

| Capability | State | Where |
|---|---|---|
| Three-pillar OTel (metrics + traces + logs) | Implemented | [Observability page](../observability/) |
| Audit log of every privileged action | Partially | `user.access` events captured; needs append-only / hash-chained storage. |
| Log retention policy documented | Deferred | No formal retention policy yet. |
| Per-stage pipeline latency tracking | Implemented | [Performance page](../../reference/performance/) |
| Alerts on service offline, kill-switch events, order rejections | Implemented (in-app) | [`alertsMiddleware.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/frontend/src/store/middleware/alertsMiddleware.ts), though only visible to users with a tab open. |
| Active alert delivery to operators (Slack/Discord/email/page) | Deferred | Planned: alert-router service. |
| NOC dashboard for unattended monitoring | Partially | `estate-overview` panel exists; dedicated NOC workspace planned. |
| Synthetic probes that emulate user journeys | Deferred | Planned. |
| Runbooks linked from each alert | Deferred | Planned. |

### Live error-rate posture

The Service Performance dashboard's "Error rate" stat reflects the
percentage of traced HTTP/RPC spans tagged `STATUS_CODE_ERROR`. We
publish the live number rather than only the aspirational target,
on the principle that a healthy platform's claim about its error
rate should be falsifiable.

| Window | Filter | Recent rate | Notes |
|---|---|---|---|
| Raw (all spans) | None | ~5% | Includes by-design 401/403/404 responses (auth gates), `/health` probes that timeout, and connection-refused on services still starting. Not a useful "is it broken" signal on its own. |
| Filtered | Excludes `/health`, `/healthz`, `/api/overview`, `/logs/query` paths and 401/403/404 status codes | **target <1%**, currently ~0.4% after the OMS-poll-timeout fix | This is the figure we treat as the operational SLO. |

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
  homelab; absence is expected on Fly.
- `/logs/query`: the gateway's logs route, returns 403 to viewer
  roles. By-design auth gating, not a server error.
- HTTP `401`, `403`, `404`: by-design auth/authz responses. A
  viewer hitting an admin route returns 401; the dashboard should
  not count that as a service failure.

#### What "Filtered" still includes (and we don't suppress)

- 5xx server errors from any service
- Connection refused / timeout on internal service-to-service calls
  *that aren't probes*. These are real degradation.
- Span exceptions raised by application code (`recordException`)

These are the signals we want to surface, and they show how we know
when something is genuinely wrong. The remaining ~0.4% is dominated
by transient `journal /orders` polls (OMS expire-orphan loop) that
sometimes time out under load. Each follow-up PR named in the
"Where" column above will reduce this further.

## Container hardening and runtime security

| Capability | State | Where |
|---|---|---|
| `cap_drop: ALL` on every service container | Implemented | [Security posture page](../security/) |
| Read-only root filesystems where feasible | Implemented | [Security posture page](../security/) |
| Non-root user inside containers | Implemented | [Security posture page](../security/) |
| `no_new_privileges: true` | Implemented | [Security posture page](../security/) |
| Resource limits per container | Implemented | `compose.yml` per-service `mem_limit` / `cpus` |
| Secrets in env vars vs proper secret store | Partially | `.env` files used for dev; production secrets via host env. No Vault/sealed-secrets yet. |
| mTLS between services | Deferred | Currently plain HTTP within the docker network. |

## Network exposure and rate limiting

| Capability | State | Where |
|---|---|---|
| Public surface area documented | Partially | [API gateway page](../../reference/api-gateway/) lists routes; no formal exposed-vs-internal classification. |
| Rate limiting per endpoint, per IP, per user | Implemented | Token-bucket limiter at the gateway: per-IP cap on every request plus tighter per-user cap on authenticated routes. See [`backend/src/lib/rateLimit.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/backend/src/lib/rateLimit.ts), wired in [`backend/src/gateway/gateway.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/backend/src/gateway/gateway.ts). |
| DDoS protection at edge | Deferred | Cloudflare tunnel is the intended posture. |
| CSP and security headers (HSTS, X-Frame-Options, etc.) | Deferred | Frontend currently scores ~B at securityheaders.com. Target A+. |
| WebSocket origin checking | Implemented | Gateway WS handler validates `Origin` header. |

## Code provenance and supply chain

| Capability | State | Where |
|---|---|---|
| Dependency scanning on PRs | Implemented | Dependabot enabled + CodeQL `security-and-quality` query suite via [`.github/workflows/codeql.yml`](https://github.com/milesburton/veta-trading-platform/blob/main/.github/workflows/codeql.yml). |
| Secret scanning of git history | Implemented | [`gitleaks` workflow](https://github.com/milesburton/veta-trading-platform/blob/main/.github/workflows/gitleaks.yml) runs on every push, every PR, and weekly against full history. |
| Static analysis on every PR | Implemented | CodeQL [`javascript-typescript`](https://github.com/milesburton/veta-trading-platform/blob/main/.github/workflows/codeql.yml) on every PR + main + weekly. |
| SBOM generation per build | Deferred | Planned: `syft` in the docker-base build step. |
| Container image signatures | Deferred | Planned: `cosign` in the docker-services matrix. |
| Reproducible builds with pinned image digests | Partially | Compose uses `:latest` tags from GHCR; pinning by digest planned. |

## Data classification and retention

| Capability | State | Where |
|---|---|---|
| Data classification documented | Deferred | Need to identify which fields are PII / PII-equivalent / operational. |
| Retention policy per data class | Deferred | Journal events currently retained indefinitely. |
| Log scrubbing (no PII / tokens leaking into logs) | Partially | Logger has some redaction; no test proving completeness. |
| Encryption at rest | Partially | Postgres on encrypted disk on the homelab; not enforced for Fly. |
| Encryption in transit (public surfaces only) | Implemented | TLS at the Cloudflare/Fly edge. |

## Performance and capacity

| Capability | State | Where |
|---|---|---|
| Repeatable load-test harness | Implemented | k6 scenarios in [`k6/`](https://github.com/milesburton/veta-trading-platform/tree/main/k6); see [k6 load testing](../supporting/k6-load-testing/). |
| Mixed-strategy load (all 9 algos) | Implemented | [`k6/mixed-strategy.js`](https://github.com/milesburton/veta-trading-platform/blob/main/k6/mixed-strategy.js): weighted realistic distribution. |
| Open-bell burst pattern | Implemented | [`k6/burst-open.js`](https://github.com/milesburton/veta-trading-platform/blob/main/k6/burst-open.js): 0 to 200 VUs in 30s, hold 5min. |
| Sustained soak for memory leaks | Implemented | [`k6/soak.js`](https://github.com/milesburton/veta-trading-platform/blob/main/k6/soak.js): 25 VUs for 30min, configurable. |
| Risk-engine pressure test | Implemented | [`k6/risk-stress.js`](https://github.com/milesburton/veta-trading-platform/blob/main/k6/risk-stress.js): weighted under/at/over-limit mix. |
| Live load-test telemetry to Grafana | Implemented | k6 writes to Prometheus via remote-write; rendered on the **k6 Prometheus** dashboard. |
| Performance regression tracking | Partially | JSON summaries written per-run to [`docs/site/src/data/loadtest/`](https://github.com/milesburton/veta-trading-platform/tree/main/docs/site/src/data/loadtest); no automated CI gate yet. |
| Load tests scheduled in CI | Deferred | Currently manual; nightly k6 run on the homelab is a planned follow-up. |

## Recovery and operational drills

| Capability | State | Where |
|---|---|---|
| Postgres backup running on schedule | Deferred | No scheduled backup yet. |
| Restore drill performed at least once | Deferred | Untested. |
| Redpanda topic snapshots | Deferred | No snapshotting. |
| Documented disaster-recovery runbook | Deferred | No DR runbook yet. |
| Incident postmortems | Deferred | No incidents to post-mortem yet, but template should exist before they happen. |

## Deliberate non-goals

These would each be appropriate for a real platform but are
out of scope for this codebase. The reasoning is documented so that
the gaps are obvious choices rather than oversights.

| Non-goal | Reasoning |
|---|---|
| Customer fund custody | Trading platforms either custody funds themselves (heavily regulated) or route to a broker. We route hypothetically, with no real funds in flight. |
| Real-time market data redistribution | Bloomberg / Refinitiv vendor licensing is six-figures-per-year. We use synthetic data plus delayed Alpha Vantage quotes. |
| Multi-tenancy | A platform serving multiple users is a different system. This is single-user (your own account, your own broker). |
| Real money | Even with a real broker, we don't intend to wire this up to live execution. The simulation provides what we need to demonstrate the engineering. |
| Regulatory reporting (MiFID II, EMIR, Dodd-Frank) | Real platforms ship reports to trade repositories. We log enough to *generate* such reports if needed but don't wire up the submission. |
| Compliance surveillance hooks | Spoofing detection, layering detection, wash-trade detection. Out of scope; would need a separate surveillance service. |

## How this page stays honest

Each "Implemented" row above has a link to source code, a dashboard,
or a runbook. If any of those rot, the row should drop to "Partially"
or "Deferred" and a follow-up PR opens. The page is reviewed alongside
every PR that touches an implementing component.

If you find a row that says "Implemented" but the underlying evidence
has rotted, that is a bug. Open an issue and we will either fix the
underlying gap or downgrade the row.
