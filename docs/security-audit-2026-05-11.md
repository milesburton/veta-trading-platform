# Security audit — public-internet readiness (2026-05-11)

## Scope and threat model

In scope: the public attack surface of `https://veta.mnetcs.com/` — the OVH
edge Traefik (`edge/`), the SSH-tunnelled homelab Traefik (`traefik.yml`,
`compose.prod.yml`), the gateway HTTP/WebSocket routes
(`backend/src/gateway/`), the user-service OAuth/session surface, and the
shipped frontend bundle. Out of scope: in-process trading-algo correctness,
Postgres internals, LAN-side service-to-service trust, supply-chain attacks
on GHCR/Watchtower (already covered in `docs/site/src/content/docs/platform/threat-model.md`).
The threat model is the casual external attacker described in that file
(adversary row 1) now able to hit every path the homelab Traefik routes,
not just `/` and `/api/gateway/*`.

## Findings

### F-1 — Default OAuth shared passcode `veta-dev-passcode` is the production fallback

- **Severity:** Critical
- **Where:** `backend/src/user-service/user-service.ts:96`; `env.example:21`; `frontend/src/components/LoginPage.tsx:273`
- **What:** `OAUTH_SHARED_SECRET` defaults to the literal string `veta-dev-passcode` when the env var is unset. No GitHub Actions workflow, compose override, or deploy script sets a different value, and the frontend bundle ships the same string as a hardcoded fallback for the "Demo Personas" auto-fill (`VITE_DEMO_PASSCODE` is also never set at build time). The string is documented publicly in `docs/site/src/content/docs/guides/personas.md:67` and `quick-start.md:38`.
- **Why it matters publicly:** Any internet visitor can read the shipped JS bundle, find `veta-dev-passcode`, and combine it with any seeded user ID (alice, bob, admin) to obtain a valid `veta_user` session cookie with full role privileges including `admin`. The OAuth `/register` endpoint accepts the same passcode and lets attackers mint unlimited `viewer` accounts at will.
- **Recommended fix:** In `compose.prod.yml` set `OAUTH2_SHARED_SECRET` from a homelab `.env` value that is generated per deployment (32+ random chars). Treat the fallback as fatal in production: in `user-service.ts:96`, refuse to start when `OAUTH2_SHARED_SECRET` equals `veta-dev-passcode` and `VETA_ALLOW_DEMO_PASSCODE` is not explicitly set. Rebuild the frontend bundle with `VITE_DEMO_PASSCODE` empty so the demo-fill becomes a no-op.

### F-2 — Redpanda admin console publicly reachable at `/admin/redpanda` with no auth

- **Severity:** Critical
- **Where:** `compose.yml:128-134`; `compose.prod.yml:586-596`
- **What:** `redpanda-console` is labelled `traefik.enable=true` with `PathPrefix(\`/admin/redpanda\`)` and entrypoint `websecure` on the homelab Traefik. The edge `dynamic.yml` matches `Host(\`veta.mnetcs.com\`)` only and forwards every path to the homelab Traefik, which then routes `/admin/redpanda` straight to the Redpanda Console UI. There is no `forwardAuth`, `basicAuth`, or IP allowlist middleware on this router.
- **Why it matters publicly:** Redpanda Console exposes topic browse + message produce + cluster admin to anonymous visitors. Topics including `user.access` (which carries session-correlated `userId`/`userRole`/`path` events), `orders.new`, `orders.kill`, and `risk.breaker` are readable by anyone who navigates to `https://veta.mnetcs.com/admin/redpanda`. An attacker with produce rights can inject fake `orders.new` messages bypassing the gateway entirely.
- **Recommended fix:** Either remove the public router (set `traefik.enable=false` on `redpanda-console` in `compose.prod.yml:588`) and reach it only over the homelab LAN, or add a `basicAuth` middleware in front of the `redpanda-console` router with credentials provisioned from a sealed secret. Verify with `curl -i https://veta.mnetcs.com/admin/redpanda` returns 401, not 200.

### F-3 — Gateway CORS allows any origin

- **Severity:** High
- **Where:** `backend/src/gateway/gateway.ts:71-75`; `backend/src/user-service/user-service.ts:118-122`
- **What:** Both gateway and user-service set `Access-Control-Allow-Origin: *` plus `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`. Combined with `SameSite=Lax` cookies, cross-origin requests cannot read responses by browser policy, but `*` paired with `Access-Control-Allow-Credentials` absent still means any site can fire authenticated `Authorization`-bearing fetches (currently none used) and the headers list `Authorization` even though sessions are cookie-bound.
- **Why it matters publicly:** A wildcard ACAO is the kind of thing a security scanner flags first. With future moves to `SameSite=None` or token-in-header auth this becomes directly exploitable. Even today, it lets any origin probe `/health`, `/ready`, `/system` and enumerate the gateway's service-health JSON which leaks the full backend topology.
- **Recommended fix:** In `gateway.ts:71-75`, replace `"*"` with an exact allowlist of origins (`https://veta.mnetcs.com`, and optionally `http://localhost:5173` for dev). Drop `Authorization` from `Access-Control-Allow-Headers` since auth is cookie-only. Mirror the change in `user-service.ts:118-122`.

### F-4 — Session cookie missing `Secure` flag and uses `SameSite=Lax`

- **Severity:** High
- **Where:** `backend/src/user-service/user-service.ts:320,692`
- **What:** The `veta_user` cookie is set with `HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`. It is missing the `Secure` attribute (so it would be sent over plain HTTP if a downgrade or local interception occurred) and uses `Lax` rather than `Strict`.
- **Why it matters publicly:** The site is now reachable over a real HTTPS origin where browsers honour `Secure`. Without it, a single mixed-content path, accidental :80 listener on the homelab Traefik, or local-network HTTP redirect can leak the session cookie. `SameSite=Lax` permits the cookie on top-level cross-site navigation, which is enough for CSRF on state-changing GETs and for a malicious site to drive a victim into a logged-in state on `veta.mnetcs.com`.
- **Recommended fix:** Change both `Set-Cookie` lines in `user-service.ts` to include `Secure; SameSite=Strict`. If a desktop or Electron client requires `Lax`, add a build-time switch rather than weakening the public deployment.

### F-5 — No frame-level rate limiting on WebSocket after upgrade

- **Severity:** High
- **Where:** `backend/src/gateway/gateway.ts:440` (skips IP limiter on WS upgrades); `backend/src/gateway/routes/websocket.ts:69-321` (`socket.onmessage` has no per-socket rate limit)
- **What:** Once a socket is upgraded, the gateway's `ipLimiter` and `userLimiter` no longer apply (the IP limiter is explicitly skipped for upgrades, and the user limiter only fires inside `requireAuth`, which is HTTP-only). Inside `socket.onmessage`, `submitOrder`, `cancelOrders`, `holdOrders`, `unholdOrders`, `killOrders`, `resumeOrders` all run with no per-socket message budget and each call `ctx.producer.send(...)` to Redpanda.
- **Why it matters publicly:** Any authenticated trader (and after F-1, any internet visitor) can flood `orders.new` from a single tab. The edge Traefik rate-limit middleware only acts on HTTP requests and does not see post-upgrade frames. Even unauthenticated sockets can sit open subscribing to broadcasts (marketUpdate, orderEvent for anonymous fallback) and consume a connection slot.
- **Recommended fix:** Add a per-socket token bucket in `websocket.ts` (e.g. 10 control messages/sec, 100 burst) keyed on `socketUserId ?? remoteAddr`, applied at the top of `socket.onmessage`. Use the existing `@veta/rate-limit` `RateLimiter` so the algorithm matches HTTP. Reject (or close) sockets that exceed it and emit `auth_failure` to `user.access`.

### F-6 — Any logged-in user can read every other user's orders, limits, and persona detail

- **Severity:** High
- **Where:** `backend/src/gateway/routes/proxied.ts:72-76` (`/orders`); `backend/src/journal/journal-server.ts:539-547`; `backend/src/user-service/user-service.ts:254-296` (`/personas`); `user-service.ts:357-380` (`/users/{id}/limits` GET)
- **What:** Gateway `/orders` proxies to journal `/orders` with no user filter — journal returns all orders for all users including `userId`. `/personas` and `/users/{id}/limits` (reachable via SVC_PROXY `/api/user-service/...`) are auth-gated only at the gateway boundary (login required) but apply no role check, so a fresh viewer-role account reads every trader's `max_order_qty`, `max_daily_notional`, `allowed_strategies`, and `dark_pool_access`.
- **Why it matters publicly:** Once F-1 is fixed and viewer self-registration remains open, a curious visitor can still enumerate the entire user directory and watch all order flow live. For "friends-and-family soft-launch" this leaks every guest's trading activity to every other guest.
- **Recommended fix:** In `proxied.ts` `/orders` handler, append `userId=auth.user.id` to the journal query unless `auth.user.role in {admin, compliance}` (mirrors the WS broadcast logic in `gateway.ts:188-198`). Add a role check inside the `/personas` handler (`user-service.ts:254`) and `/users/{id}/limits` GET (`user-service.ts:360`) so only the user themselves or admin/compliance can read. The corresponding journal-side filter should also be added in `journal-server.ts:539` keyed on a header the gateway sets (similar to the existing `x-user-id` pattern on `/grid/query`).

### F-7 — Frontend ships no Content-Security-Policy

- **Severity:** Medium
- **Where:** `frontend/index.html:1-23`; `frontend-server.ts:33-56`; `edge/dynamic.yml:39-47` (security-headers middleware sets HSTS/X-Frame but not CSP)
- **What:** No `<meta http-equiv="Content-Security-Policy">` in `index.html`, no CSP response header from `frontend-server.ts`, and no `contentSecurityPolicy` field in the Traefik `security-headers` middleware. The threat-model doc (chain 5 step 4) explicitly notes CSP is deferred and the only XSS defence is React escaping plus the HttpOnly cookie.
- **Why it matters publicly:** Public exposure raises the value of any XSS-via-market-data-string or supply-chain-injection bug. CSP is the single highest-value mitigation a static SPA gets for free and is required by most security-scanner baselines.
- **Recommended fix:** Add a CSP response header in `edge/dynamic.yml` via `customResponseHeaders`, e.g. `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' wss://veta.mnetcs.com; frame-ancestors 'none'`. Validate that the bundle doesn't need `'unsafe-eval'` (Vite production bundles should not).

### F-8 — Homelab Traefik dashboard exposed with `insecure: true`

- **Severity:** Medium (needs human verify)
- **Where:** `traefik.yml:6-8`
- **What:** The homelab Traefik runs with `api.dashboard: true` and `api.insecure: true`, exposing the dashboard on the container port 8080 with no auth.
- **Why it matters publicly:** The SSH tunnel only forwards `443`, so the dashboard is not reachable through `veta.mnetcs.com`. However, if a docker-compose label or port mapping ever publishes 8080 to the homelab LAN (or worse, the host), the entire route table — including any auth tokens injected via headers — becomes browsable. The risk is one config change away.
- **Recommended fix:** Set `api.insecure: false` in `traefik.yml:8`, or add `api.dashboard: false` for the homelab deployment. If the dashboard is genuinely useful, expose it behind a `basicAuth` middleware on a non-public hostname only.

### F-9 — Health/ready/system endpoints leak full backend topology unauthenticated

- **Severity:** Medium
- **Where:** `backend/src/gateway/gateway.ts:89-94, 445-488`
- **What:** `/health`, `/ready`, `/metrics`, `/system` are in `RATE_LIMIT_BYPASS_PATHS` and require no auth. `/ready` returns a JSON object naming all 30 services and their up/down state; `/system` is similar (see `system-status.ts`).
- **Why it matters publicly:** This is reconnaissance gold. An attacker scanning `veta.mnetcs.com/ready` gets a full inventory of running services and infers what code paths exist (e.g. `fixArchive`, `darkPool`, `replay`). It also makes a quick liveness oracle for a denial-of-service campaign.
- **Recommended fix:** Keep `/health` open (200/OK with empty body suffices for the LB), and either gate `/ready` and `/system` behind `requireAuth` plus an admin role check, or strip them to a boolean `{ ready: true|false }` with no per-service detail. The Traefik `/ping` already covers external monitoring needs.

### F-10 — Frontend bundle leaks dev URLs and a Traefik dashboard URL fallback

- **Severity:** Low
- **Where:** `frontend/.env:1-8`; `frontend/src/store/servicesApi.ts:28`
- **What:** `frontend/.env` ships `VITE_*` URLs pointing at `http://localhost:5000-5006`. These are committed to the repo but only used in dev — production builds typically override them. However `servicesApi.ts:28` falls back to `${_origin}:8888` for the Traefik dashboard URL, meaning the bundle contains a probe to that port.
- **Why it matters publicly:** Minimal — these strings are inert unless the user clicks a "services" panel link. But they advertise the dev port layout to anyone reading the bundle, helping an attacker fingerprint internal services if they ever land on the homelab LAN.
- **Recommended fix:** In `frontend/.env`, leave the values blank or commented out so the bundle defaults to same-origin `/api/...` paths. In `servicesApi.ts:28`, when `VITE_TRAEFIK_DASHBOARD_URL` is unset, omit the dashboard link from the UI entirely.

### F-11 — Auth events go to Kafka and Loki but no alert on auth-failure spikes

- **Severity:** Low (info)
- **Where:** `backend/src/gateway/gateway.ts:106-114, 124, 140` (publishes to `user.access` topic); `observability/kafka-relay.ts:35` (relays to Loki)
- **What:** `auth_failure` and `http_request` events flow through the `user.access` Kafka topic and are relayed to Loki by `kafka-relay`. There is no alert rule that fires on a burst of `auth_failure` events from a single IP, so a brute-force run against `/oauth/authorize` is invisible until someone manually queries Loki.
- **Why it matters publicly:** Once F-1 is fixed and OAuth has a real per-user secret, the next attack is credential spraying. Logging without alerting means dwell time is unbounded (this is exactly residual risk row 1 in the threat-model doc).
- **Recommended fix:** Add a Grafana alert (or Loki alert rule under `observability/`) for `sum(rate(({service_name="gateway"} |= "auth_failure")[5m])) > 5` per source IP. Wire to whatever the alerting destination is — even just a recorded ring-buffer panel in the UI is an improvement.

### F-12 — `/me`, `/preferences`, and `/personas` enumerate via cookie reuse — no CSRF token

- **Severity:** Medium (needs human verify)
- **Where:** `backend/src/gateway/routes/proxied.ts:48-54, 261-278`; `backend/src/user-service/user-service.ts:413-441`
- **What:** State-changing endpoints (`PUT /preferences`, `PUT /users/{id}/limits`, `POST /shared-workspaces`, `DELETE /shared-workspaces/{id}`) are protected only by the cookie. `SameSite=Lax` blocks cross-site `POST/PUT/DELETE` via form submission but not via fetch from a malicious origin if `withCredentials` is set — and the `Access-Control-Allow-Origin: *` (F-3) means the cross-origin response is readable when no credentials flag is set, but cookies still won't go cross-site under `Lax`. Today this is mostly defended-in-depth by `SameSite=Lax`, but there is no anti-CSRF token, double-submit cookie, or `Origin` header check.
- **Why it matters publicly:** Defence currently rests entirely on `SameSite=Lax`. Any future change to `SameSite=None` (e.g. for cross-subdomain SSO) instantly opens CSRF on every state-changing route. Browser-version-specific bugs in `SameSite` enforcement have happened before.
- **Recommended fix:** Add an `Origin` / `Referer` header check at the top of `requireAuth` in `gateway.ts:102` — reject non-`https://veta.mnetcs.com` origins on state-changing methods. Document the dependency in the threat-model so the next person changing SameSite knows what they're disabling.

### F-13 — OAuth `/register` endpoint creates new users on a shared secret

- **Severity:** High (compounds with F-1)
- **Where:** `backend/src/user-service/user-service.ts:697-724`
- **What:** `POST /oauth/register` accepts a `username` and `password` and creates a new `viewer`-role user with zero trading limits, gated only by `verifyOAuthCredentials(userId, password)` — which accepts either a per-user secret or the global shared secret. With F-1 default, anyone can mass-register accounts.
- **Why it matters publicly:** Even if mass-registered accounts are viewer-only, they (a) reveal the existence of other accounts via username collisions (HTTP 409 vs 201), and (b) become a corpus of valid sessions to use the read endpoints in F-6, and (c) produce noise in `user.access` that complicates any future anomaly detection.
- **Recommended fix:** Disable `/oauth/register` in production by default (gate on a new env var `OAUTH_ALLOW_PUBLIC_REGISTER=true`, default false). For friends-and-family, hand out pre-created accounts and per-user secrets via `OAUTH2_USER_SECRETS` rather than letting anyone self-register.

### F-14 — Edge rate-limit `ipStrategy.depth=0` is correct today; will break if Cloudflare orange-clouded

- **Severity:** Info (documentation)
- **Where:** `edge/dynamic.yml:36-38`; `edge/README.md:51-63` (already calls this out)
- **What:** The edge rate-limit middleware uses `ipStrategy.depth: 0`, meaning the source IP is taken directly from the TCP peer and no `X-Forwarded-For` hops are trusted. This is correct when Cloudflare is in DNS-only mode. If Cloudflare proxy is ever enabled (orange cloud), every visitor's IP collapses to a small set of Cloudflare edge IPs and the rate limit becomes useless.
- **Why it matters publicly:** No exploit today, but a one-config-change footgun. The edge README already documents it; the security audit should reference it so it stays visible.
- **Recommended fix:** Leave configuration as-is. Add a CI check (or a `make audit` script) that fails if Cloudflare's proxy flag is detected via the DNS API. Annotate `dynamic.yml:36-38` with a comment pointing to the README warning.

### F-15 — TLS at origin uses `insecureSkipVerify=true` — intentional but should be documented

- **Severity:** Info
- **Where:** `edge/traefik.yml:30-31`; `edge/README.md:13-27`
- **What:** The edge Traefik proxies to `https://127.0.0.1:18443` with `serversTransport.insecureSkipVerify: true` because the homelab Traefik presents a self-signed cert. The SSH reverse tunnel provides transport security, so cert verification at this hop is redundant.
- **Why it matters publicly:** This will look wrong to anyone reviewing the config and may be "fixed" by adding a CA bundle in a future PR, which would then either break the chain or trigger ongoing cert rotation work for no security gain.
- **Recommended fix:** Keep as-is. Add a comment in `edge/traefik.yml:30-31`: `# insecureSkipVerify is required because the destination is 127.0.0.1:18443 reached via an SSH reverse tunnel from the homelab. Transport security is provided by the tunnel; do not "fix" this without redesigning the tunnel.`

### F-16 — Gateway `/upgrade-status` accepts arbitrary admin-supplied message broadcast to all clients

- **Severity:** Medium
- **Where:** `backend/src/gateway/gateway.ts:490-506`
- **What:** `PUT /upgrade-status` is admin-only (good) but the `message` field flows straight into `broadcastAll` and is rendered in the frontend banner. There is no length cap or HTML/JS sanitisation in the handler.
- **Why it matters publicly:** If an admin account is compromised (the most plausible chain after F-1), or if a future feature loosens the role check, the attacker has a one-call XSS into every connected client. React's auto-escaping mitigates this if the message is rendered as text, but anything passing it into `dangerouslySetInnerHTML` or a Markdown renderer would be exploitable.
- **Recommended fix:** In `gateway.ts:499` validate the body shape with a Zod schema (the schemas package is already in use elsewhere) and cap `message` length to e.g. 280 chars. Audit the frontend banner component to confirm it renders as plain text.

### F-17 — Gateway `/api/<service>/*` SVC_PROXY allows direct reach to `risk-engine`, `journal`, `oms`, etc. for any logged-in user

- **Severity:** Medium
- **Where:** `backend/src/gateway/gateway.ts:567-624`
- **What:** The SVC_PROXY map exposes 32 service prefixes. Auth is required (good), but there is no role check — any logged-in viewer can hit `/api/risk-engine/config`, `/api/journal/grid/query`, `/api/oms/orders`, etc. Internal services trust the gateway and do not re-check the caller's role.
- **Why it matters publicly:** This expands the reachable surface from the curated routes in `proxied.ts` / `admin.ts` / `analytics.ts` to "everything every service exposes over HTTP." Many of those internal services have no auth at all (e.g. journal — see F-6). Combined with F-1, this is the path of least resistance to admin-equivalent read.
- **Recommended fix:** Either (a) restrict SVC_PROXY to a hard-coded allowlist of `{user-service, market-sim}` with explicit per-path role rules, or (b) add a default-deny role gate in `gateway.ts:615` that requires `auth.user.role in {admin, compliance, oncall}` for everything not pre-allowlisted. The curated routes in `proxied.ts` already enforce per-user filtering; SVC_PROXY is the bypass.

### F-18 — `Access-Control-Allow-Origin: *` echoed by Set-Cookie response on `/oauth/token`

- **Severity:** Medium (needs human verify)
- **Where:** `backend/src/user-service/user-service.ts:683-694`
- **What:** `POST /oauth/token` returns `Set-Cookie: veta_user=...` with `Access-Control-Allow-Origin: *` in `CORS_HEADERS`. Browsers refuse to honour `Set-Cookie` when ACAO is `*` and credentials are involved, but the response is still readable by a foreign origin which means the bearer token (`access_token`) goes back in the JSON body too.
- **Why it matters publicly:** A foreign origin that tricks a victim into POSTing to `/oauth/token` cannot do so under `SameSite=Lax` for the new cookie, but the access_token in the body is readable by JavaScript on a foreign origin (the response body is returned as the JSON the foreign script requested, gated only by the standard `cors` mode). Today this is mitigated by the fact that you need a valid `code` (PKCE) which requires a prior authorize step — but tightening CORS removes a class of subtle bugs.
- **Recommended fix:** Restrict CORS to the public origin (see F-3). Verify with a manual test: from a third-party origin, attempt `fetch('https://veta.mnetcs.com/api/user-service/oauth/token', { method: 'POST', credentials: 'include', body: ... })` and confirm the response is blocked.

## Things audited and found clean

- **WebSocket origin/upgrade auth path** (`backend/src/gateway/routes/websocket.ts:18-45`): correctly validates token before assigning a userId; rejects non-upgrade requests with 426; anonymous sockets are allowed but their privileged messages all re-check `currentAuth.user.role`. Frame-level rate-limit is the gap (F-5), not the auth surface.
- **Order-creating routes invoke the risk-engine pipeline:** every `submitOrder` produces to `orders.new`; risk-engine subscribes and is in the in-process path. There is no order-creating route that bypasses the topic.
- **Session-cookie tampering:** the token is opaque (UUID-without-dashes), validated server-side every request via `sessions.token` lookup with `expires_at > now()` (`user-service.ts:217-225`). No JWT, no role-in-cookie, no forge surface.
- **Watchtower docker-socket scope:** only Watchtower mounts the socket (`compose.prod.yml:601-620`); `cap_drop: [ALL]` and `no-new-privileges:true` applied.
- **Auth event publishing:** every privileged HTTP and WS code path emits to `user.access` (`gateway.ts:106-124`, `websocket.ts:56-203`) — coverage is wide, F-11 is about the missing alert, not the missing event.
- **Edge HSTS / X-Frame-Options / Referrer-Policy:** all set in `edge/dynamic.yml:39-47`.
- **SSH tunnel principal locked down:** `veta-tunnel` user has `restrict,port-forwarding,permitlisten="18443"` per `edge/README.md:72-77`.
- **PKCE in OAuth flow:** `derivePkceChallenge` uses SHA-256 and base64url encoding (`user-service.ts:182-189`); challenge is compared constant-time via `===` on a fixed-length hash (acceptable for SHA-256 base64 strings).

## Out of scope but worth a separate review

- **Internal service-to-service trust on the Docker bridge.** The threat-model doc already flags "Plain HTTP between services" as residual risk. Public-internet exposure does not change this directly, but moving to mTLS or a sidecar mesh becomes higher priority once F-6 / F-17 are closed because the bridge is now the soft middle of a public system.
- **Disk-monitor data-volume access pattern.** Not in scope here; recently refactored to drop the docker-socket mount per `git log`.
- **CI/CD trust boundary (GHCR + BOT_PAT).** Image-signing with `cosign` is on the deferred list and remains a single point of compromise for the whole stack — out of this audit's scope, but the highest-leverage residual risk for the casual external attacker model.
- **Grafana / LGTM exposure under `/grafana`.** `scripts/homelab-deploy.sh:118` mentions a public Grafana sub-path. The labels in `observability/docker-compose.lgtm.yml` were not read in this audit and should be reviewed for the same auth questions as the Redpanda console (F-2).
- **Postgres backup / restore drill.** Residual risk row from the threat-model doc, unchanged by public exposure.
- **News-aggregator content sanitisation.** News strings flow into the WS broadcast (`gateway.ts:207-211`) and are rendered in the frontend. Public exposure raises the value of XSS-via-news-string; needs a focused review of the rendering path.
