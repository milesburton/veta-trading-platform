---
title: Authentik (identity provider)
description: Self-hosted Authentik that provides OIDC sign-in and enforced multi-factor authentication for named accounts. Layout, first-time setup, health and upgrades.
---

[Authentik](https://goauthentik.io/) is the identity provider chosen in
[ADR 0017](../../decisions/0017-oidc-sign-in-with-authentik/). It holds the named accounts,
demands a second factor, and issues OIDC tokens that `user-service` exchanges for a platform
session. Demo personas and machine accounts do not use it.

The project is deployed but stays down until its secrets exist in OpenBao. The `user-service`
side of the sign-in flow is tracked in
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
| OAuth2 provider `veta` | Confidential client `veta-platform`, RS256 signing key, issuer per provider, subject is the user name, claims included in the ID token, one strict redirect URI on the platform host |
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

## First-time setup

The deploy starts Authentik only when `secret/veta/authentik` exists. Create it once:

| Key | Value |
| --- | --- |
| `AUTHENTIK_SECRET_KEY` | `openssl rand -base64 60` |
| `AUTHENTIK_PG_PASSWORD` | `openssl rand -hex 24` |
| `VETA_OIDC_CLIENT_SECRET` | `openssl rand -hex 32` |
| `AUTHENTIK_BOOTSTRAP_PASSWORD_HASH` | Hash of the `akadmin` password, generated as below |

Generate the hash without writing the password to disk or shell history:

```bash
docker run --rm -it --entrypoint python ghcr.io/goauthentik/server:2026.8.5 -c \
  "from getpass import getpass; from django.conf import settings; settings.configure(); \
from django.contrib.auth.hashers import make_password; print(make_password(getpass()))"
```

Store the four values with `bao kv put secret/veta/authentik ...` as the `admin` user, then
run a deploy. The bootstrap hash is read on the first start only. Sign in as `akadmin` at
`/sso/`, enrol a second factor, create the named accounts and add each to a `veta-` group.

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
| Sign-in loops back to the login form | The proxy is not passing `X-Forwarded-Proto` and `Host`, or the public origin does not match `VETA_PLATFORM_URL` |
