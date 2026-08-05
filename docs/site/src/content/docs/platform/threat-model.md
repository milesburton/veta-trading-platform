---
title: Threat Model
description: Adversaries we defend against, attack surfaces, attack chains, and the controls that interrupt each step.
sidebar:
  order: 2
---

This page is the structured walk-through of who would attack the
platform, what they would aim for, and which controls interrupt each
step of the chain. It is the companion to
[Professional standards](../professional-standards/): that page is the
_what_ (the capability checklist), this page is the _why_ (the
adversaries and chains those capabilities exist to disrupt). Container
hardening details are kept on the [Security posture](../security/)
page and only referenced here. The residual-risks section is
honest about gaps, and each gap maps back to a "Deferred"
or "Partially" row on the standards checklist.

## Adversaries

| Adversary                       | Capability                                                           | What they want                                                                      | Out of scope                                |
| ------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------- |
| Casual external attacker        | Mass scanners, public CVE exploits, no targeted research             | Any easy win such as an exposed admin panel, default credentials, or leaked secrets | Targeted social engineering of the operator |
| Skilled remote attacker         | Custom exploits, RCE chains, lateral movement, willing to spend days | Persistence inside the trading network, data exfiltration, ransom                   | Nation-state-grade zero-days                |
| Compromised dependency author   | Indirect access via a malicious npm/Deno package update              | Supply-chain foothold inside any service that imports the package                   | A backdoored Postgres or Linux kernel       |
| Insider with viewer credentials | Legitimate session cookie, viewer role only                          | Privilege escalation to trader or admin; reading data outside their role            | Physical access to the host                 |
| Insider with admin credentials  | Full admin role; can configure risk, kill, run scenarios             | Mistakes that cause loss; or deliberate manipulation of trading                     | Subverting database-level audit             |
| Network-adjacent attacker       | LAN access on the server subnet                                      | Sniffing inter-service traffic, hitting Postgres or Redpanda directly               | Compromise of the upstream router or ISP    |

For each adversary the assumption is that they are remote unless the
row says otherwise; that they cannot break TLS at the edge; and that
they cannot trivially compromise GitHub itself or GHCR.

## Assets

| Asset                                 | Sensitivity                                        | Where it lives                                                          | Who legitimately reads it               |
| ------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------- |
| Trading limits and risk configuration | High (bypass equals unbounded loss)                | Postgres `risk_config_versions`                                         | `risk-engine`, admin role               |
| Order history                         | High (regulatory artefact, must be tamper-evident) | Postgres `orders`, journal Kafka topic                                  | `journal`, trader, admin                |
| User session tokens                   | High (direct authentication bypass)                | Browser cookie, validated by `user-service` per request                 | `user-service`                          |
| Backend service credentials           | High (DB password, broker keys when wired)         | `.env` files, host environment                                          | The service that owns the credential    |
| Trading-decision pipeline             | High (manipulation is market abuse)                | In-memory state across `feature-engine`, `signal-engine`, `risk-engine` | The pipeline services                   |
| Audit log integrity                   | High (needed to reconstruct any incident)          | Postgres `audit_events`, journal Kafka topic                            | `journal`, admin (read), no one (write) |
| Market data                           | Low (synthetic or delayed-public)                  | `market-data` service memory, Redpanda topics                           | All trading services                    |

## Attack surfaces

Every entry point an unauthenticated or authenticated attacker can
reach. The professional-standards page tracks which of these have
formal controls; this page enumerates them so that nothing slips into
production unclassified.

- **Public HTTP and WebSocket via the gateway.** Every browser-reachable
  route, including the `Origin`-checked WebSocket handler.
- **Internal service-to-service HTTP.** Plain HTTP within the docker
  network, currently trusted by network position.
- **Kafka/Redpanda topic publish and subscribe.** Any container that
  reaches the broker can produce or consume.
- **Postgres direct access.** On the server, the database port is
  reachable from the LAN.
- **CI/CD pipeline.** GitHub Actions runners, GHCR, the `BOT_PAT` token
  used to push artefacts.
- **Container escape.** Any service compromise that turns into host
  control via a kernel or runtime bug.
- **Docker image supply chain.** The server auto-pull will deploy
  whatever GHCR serves under the configured tags.

## Attack chains and controls

Each chain is a plausible end-to-end path; the bullets are the
hurdles in order.

### Chain 1: RCE in any service, attacker pivots to read another service's data

1. Attacker finds a remote-code-execution bug in a service.
2. They get shell as the service's UID inside its container.
   - **Control**: Deno services run as `deno:deno` (UID 1993), not root.
3. They try to escalate via setuid binary.
   - **Control**: `no-new-privileges:true` blocks the bit.
4. They try raw-socket scanning the docker network.
   - **Control**: `cap_drop: [ALL]` removes `CAP_NET_RAW` and friends.
5. They try to read another service's secrets from disk.
   - **Control**: each service has its own env file; no shared secret
     mounts; read-only filesystem on the highest-privilege containers.
6. They try to escape to the host via the docker socket.
   - **Control**: only Traefik (label discovery) mounts the socket
     read-only; nothing else mounts it. Disk-monitor was the previous
     offender and is now socket-free.

### Chain 2: Stolen viewer cookie, attacker tries to submit orders

1. Attacker steals a session cookie (XSS, malware, shared device).
2. They replay the cookie against an order-submission endpoint.
   - **Control**: every privileged route runs through `requireAuth`
     plus an explicit role check; the trader role is not on the cookie,
     it is resolved server-side from `user-service`.
3. They try to fake the role by editing the cookie.
   - **Control**: the cookie carries an opaque token; role is looked up
     server-side every request.
4. They try to bypass the risk engine by hitting an undocumented route.
   - **Control**: gateway routes are explicitly enumerated; an audit
     test for "every order-creating route invokes risk-engine" is on
     the deferred list (see professional-standards: _Bypass-resistance
     proven by integration test_).

### Chain 3: Compromised npm dependency ships a crypto-miner

1. A transitive dep is hijacked and pushes a malicious patch release.
2. CI builds the image with the bad dep and pushes to GHCR.
   - **Control**: Dependabot watches for advisories; planned CodeQL
     and `gitleaks` will catch a class of compromises but not all.
3. The server auto-pull deploys the image to prod.
   - **Control**: per-container CPU and memory limits cap how much
     the miner can consume; alerts on sustained CPU saturation are
     planned.
4. The miner attempts to phone home.
   - **Control**: `trading-net` is a Docker `internal: true` network, so
     the ~18 services that never legitimately call out (OMS, EMS,
     risk-engine, journal, every algo container, market-sim, and more)
     have no route to the internet at all, verified directly against
     production dockerd. A compromise landing in any of them has
     nowhere to exfiltrate to. The gap is not fully closed: `gateway`
     (Discord webhook), `market-data` (external quote providers),
     `discord-bot` (Discord API), `traefik` (public ingress), and the
     one-shot `ollama-model-pull` bootstrap container also join a
     second, internet-capable `egress-net` network. A compromise in the
     long-running internet-facing services still has an outbound path.
     A DNS-aware allowlisting proxy in front of `egress-net`,
     restricting those services to only their known destinations, is
     the natural next step and remains planned.

### Chain 4: Bot exhausts Kafka topics to OOM the journal

1. Attacker, authenticated or otherwise, finds a write-amplifying
   endpoint.
2. They produce orders or events at high rate.
   - **Control**: journal subscribes with a bounded consumer; per-topic
     retention is configured; backpressure surfaces as visible lag.
3. Topic disk fills up.
   - **Control**: Redpanda retention plus disk-monitor reporting; rate
     limiting per consumer is planned (see professional-standards:
     _Rate limiting per endpoint, per IP, per user_).

### Chain 5: XSS via a market-data string, attacker reads session token

1. Attacker arranges for a malicious string to appear in market-data
   (synthetic feed manipulation, future broker integration).
2. The frontend renders it.
   - **Control**: React escapes content by default; `dangerouslySetInnerHTML`
     is not used on untrusted strings; no inline event handlers.
3. They try to read the cookie from JavaScript.
   - **Control**: session cookie is `httpOnly`, so JS cannot read it.
4. They try to exfiltrate other DOM state.
   - **Control**: a Content Security Policy is on the deferred list;
     today the defence is React's escaping plus the `httpOnly` cookie.

### Chain 6: Replay attack with an old auth token after revocation

1. Attacker obtains a valid token, then the user logs out.
2. They replay the token.
   - **Control**: `user-service` is the source of truth for token
     validity; every request validates against it. A revoked token
     fails immediately, not at TTL expiry.
3. They try to forge a new token from the old one.
   - **Control**: tokens are opaque; the server-side store is the only
     authority.

## Residual risks

These are the chains we currently lose. Each one corresponds
to a row on [Professional standards](../professional-standards/) that
is "Deferred" or "Partially".

- **No active alert delivery.** A successful attacker has unbounded
  dwell time. In-app alerts only fire when an operator has a tab open.
- **Audit log is not hash-chained.** Anyone with Postgres write access
  can rewrite history. Tamper-evident storage is planned.
- **Plain HTTP between services.** A network-adjacent attacker on the
  docker bridge or the server LAN can sniff and inject.
- **Secrets in env vars.** Host compromise yields every credential at
  once; a vault is planned.
- **No rate limiting on public endpoints.** Anyone who finds the
  gateway can attempt a denial-of-service.
- **CI/CD trust boundary.** GHCR plus `BOT_PAT` is a single failure
  domain; image signing (`cosign`) is planned.
- **No restore drill.** Backups themselves are deferred; the rehearsal
  is consequently deferred too.
- **Unrestricted egress from internet-capable services.**
  `gateway`, `market-data`, `discord-bot`, and `traefik` join
  `egress-net` and can reach any destination on the internet, not just
  their known providers. `ollama-model-pull` also joins `egress-net`
  but only runs briefly at startup. Everything else on `trading-net`
  alone has no route out at all. A DNS-aware allowlisting proxy for
  `egress-net` is planned.

## Out of scope (intentional)

Real-money execution, customer fund custody, multi-tenancy,
regulatory submission, and surveillance hooks (spoofing/layering/wash
detection) are all out of scope. The reasoning is on
[Professional standards: Deliberate non-goals](../professional-standards/#deliberate-non-goals).
The threat model assumes those features do not exist and therefore are
not attack surfaces. If any of them is ever wired up, this page must
gain a new chain before the feature ships.

## How this page stays current

The threat model is reviewed alongside any pull request that touches
an attack-surface file: the gateway, any auth path, the risk engine,
the journal, container compose files, or CI workflows. New surface
area means a new row in _Attack surfaces_ and a new chain if it
introduces a class of attack that the existing chains do not already
cover. A new control means the relevant chain gets a new bullet. A new
residual risk means a new entry both here and on
[Professional standards](../professional-standards/) so the two pages
do not drift.

If a chain reads as defended but the underlying control has rotted,
that is a bug. Open an issue and either fix the control or downgrade
this page to match reality.
