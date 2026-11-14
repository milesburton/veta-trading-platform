---
title: Authentik (identity provider)
description: Self-hosted Authentik that provides OIDC sign-in and enforced multi-factor authentication for named accounts. Layout, first-time setup, health and upgrades.
---

[Authentik](https://goauthentik.io/) is the identity provider chosen in
[ADR 0017](../../decisions/0017-oidc-sign-in-with-authentik/). It holds the named accounts,
demands a second factor, and issues OIDC tokens that `user-service` exchanges for a platform
session. Demo personas and machine accounts do not use it.

The project is deployed but stays down until its secrets exist in OpenBao, and platform
sign-in through it stays off until `OIDC_ENABLED=true`. Progress is tracked in
[#974](https://github.com/milesburton/veta-trading-platform/issues/974).

## Layout

| Item | Value |
| --- | --- |
| Compose project | `veta-authentik`, from `deploy/authentik/compose.yml`. Separate from the VETA stack, so a VETA deploy never recreates it |
| Containers | `veta-authentik-server`, `veta-authentik-worker` (image `ghcr.io/goauthentik/server`, pinned tag) and `veta-authentik-postgresql` (`postgres:16-alpine`) |
| Public address | `/sso/` on the platform host name, routed by Traefik with the prefix left in place (`AUTHENTIK_WEB__PATH=/sso/`) |
| Networks | The server joins `trading-net` so Traefik and `user-service` reach it by name. Database and worker sit on `authentik-net`, private to the project. Both are internal, so Authentik has no route to the internet |
| Published ports | None |
| Outbound calls | Update check and error reporting disabled |
| Docker socket | Not mounted. No outposts are deployed |
| Configuration | `deploy/authentik/blueprints/veta.yaml`, applied by the worker |
| Storage | `veta-authentik_authentik-database` (PostgreSQL) and `veta-authentik_authentik-data` volumes |
| Secrets | `secret/veta/authentik` in [OpenBao](../openbao/) |

## What the blueprint declares

| Object | Setting |
| --- | --- |
| OAuth2 provider `veta` | Confidential client `veta-platform`, authorisation code grant only, RS256 signing key, issuer per provider, subject is the user name, claims included in the ID token, one strict redirect URI: the application root on the platform host |
| Application `veta` | Bound to the provider |
| MFA validation stage | Accepts TOTP and WebAuthn only. An account with no device is made to enrol one before sign-in completes, and the second factor is asked for at every sign-in |
| Groups | `veta-admin`, `veta-trader`, `veta-desk-head`, `veta-risk-manager`, `veta-compliance`, `veta-sales`, `veta-oncall`, `veta-viewer`. Membership becomes the platform role |

OIDC endpoints, relative to the platform host:

| Endpoint | Path |
| --- | --- |
| Discovery | `/sso/application/o/veta/.well-known/openid-configuration` |
| Issuer | `/sso/application/o/veta/` |
| Authorisation | `/sso/application/o/authorize/` |
| Token | `/sso/application/o/token/` |
| Keys | `/sso/application/o/veta/jwks/` |
| End session | `/sso/application/o/veta/end-session/` |

## Platform sign-in

`user-service` is the relying party. It is configured from the Compose file and two values in
`secret/veta/authentik`:

| Variable | Value |
| --- | --- |
| `OIDC_ENABLED` | `true` to offer single sign-on. Default `false`. Stored in `secret/veta/authentik` |
| `OIDC_ISSUER` | Platform URL followed by `/sso/application/o/veta/`. Must equal the `iss` claim |
| `OIDC_INTERNAL_BASE_URL` | `http://veta-authentik-server:9000/sso`, used for the code exchange and the signing keys |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | `veta-platform` and `VETA_OIDC_CLIENT_SECRET` from OpenBao |
| `OIDC_REDIRECT_URI` | The application root on the platform URL |
| `OIDC_REQUIRE_MFA` | Default `true`: an ID token whose `amr` claim lacks `mfa` is refused |

| Endpoint on `user-service` | Purpose |
| --- | --- |
| `GET /oauth/oidc/config` | Tells the sign-in page whether to show the single sign-on button |
| `POST /oauth/oidc/start` | Creates state, nonce and a PKCE verifier, returns the authorisation URL and sets a ten minute state cookie |
| `POST /oauth/oidc/callback` | Checks the state against the cookie, exchanges the code, verifies the ID token, maps the user and creates the session |

Authentik builds the issuer from the request host. The internal calls therefore send
`X-Forwarded-Host` and `X-Forwarded-Proto` for the public address, so the ID token carries the
public issuer although it was fetched by container name.

A user is created on first sign-in with `auth_source = 'oidc'` and no local passcode. The role
comes from the highest `veta-` group the account is in, in the order admin, compliance,
risk-manager, desk-head, oncall, trader, sales, viewer, and is refreshed at every sign-in. A
change of role ends the user's other sessions. An account in no `veta-` group is a `viewer`.
Enabling `OIDC_ENABLED` without the client secret stops `user-service` at start, by design.

### Local sign-in policy

| Variable | Effect |
| --- | --- |
| `LOCAL_ADMIN_SIGN_IN` | Default `false`. While false, a local passcode never signs in an `admin`, and admin accounts are left out of the demo persona list. Admin access is through single sign-on only. CI and test stacks set it to `true` |
| `OAUTH_ALLOW_PUBLIC_REGISTER` | Default `false`. The sign-in page has no account creation form, and `POST /oauth/register` answers 403 unless this is `true`. It exists only so the integration tests can create users |

The demo persona list never includes accounts created by single sign-on.

The sign-in page offers single sign-on, the demo personas and guest access. It has no username and passcode form, so a local account can only be used through a persona. A footer shows the version, build date and commit, and links to the user guide and the GitHub repository.

## First-time setup

The deploy starts Authentik only when `secret/veta/authentik` exists. Create it once:

| Key | Value |
| --- | --- |
| `AUTHENTIK_SECRET_KEY` | `openssl rand -base64 60` |
| `AUTHENTIK_PG_PASSWORD` | `openssl rand -hex 24` |
| `VETA_OIDC_CLIENT_SECRET` | `openssl rand -hex 32` |
| `AUTHENTIK_BOOTSTRAP_PASSWORD_HASH` | Hash of the `akadmin` password, generated as below |
| `OIDC_ENABLED` | `false` until Authentik is up and an account is enrolled, then `true` |

Generate the hash without writing the password to disk or shell history:

```bash
docker run --rm -it --entrypoint python ghcr.io/goauthentik/server:2026.8.5 -c \
  "from getpass import getpass; from django.conf import settings; settings.configure(); \
from django.contrib.auth.hashers import make_password; print(make_password(getpass()))"
```

Store the values with `bao kv put secret/veta/authentik ...` as the `admin` user, then
run a deploy. The bootstrap hash is read on the first start only. Sign in as `akadmin` at
`/sso/`, enrol a second factor, create the named accounts and add each to a `veta-` group.

The sign-in during which an account registers its first authenticator does not count as a
second-factor sign-in: Authentik issues that token with `amr` of `pwd` only, so the platform
refuses it and the sign-in page asks the user to sign in again. Every later sign-in carries
`mfa` and is accepted.

## Health

```bash
docker ps --filter name=veta-authentik
docker exec veta-authentik-server ak healthcheck
```

The image's own health check runs `ak healthcheck`. Liveness and readiness are also served at
`/sso/-/health/live/` and `/sso/-/health/ready/`.

## Upgrades

The image tag is pinned in `deploy/authentik/compose.yml` and in the hash command above. Raise
it by pull request after reading the release notes, since Authentik migrates its database on
start and does not support skipping versions.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Deploy logs that Authentik secrets are not in OpenBao | `secret/veta/authentik` is missing or has no `AUTHENTIK_SECRET_KEY` |
| `/sso/` returns 404 from Traefik | `veta-authentik-server` is not attached to `trading-net`. After that network is recreated, run `docker compose up -d --force-recreate server` in `deploy/authentik` |
| Provider or groups missing | `docker logs veta-authentik-worker` and look for the blueprint `VETA platform sign-in` |
| Sign-in loops back to the login form | The proxy is not passing `X-Forwarded-Proto` and `Host`, or the public origin does not match `VETA_PLATFORM_URL`. If Authentik signs the user in but the platform returns `invalid_state` (HTTP 400) on the callback, the gateway is not forwarding the `veta_oidc_state` cookie |
