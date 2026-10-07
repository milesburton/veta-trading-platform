---
title: Deployment
description: How to deploy VETA to the production server or locally.
sidebar:
  order: 7
---

## Production (canonical)

The platform is deployed to a server (Proxmox LXC, 16 cores, 64 GB RAM, 260 GB local SSD). The same host also runs the self-hosted CI runner, isolated by CPU slices. Per-service Docker images are built by CI on every `main` push and pushed to GHCR; a systemd timer (`veta-auto-pull.timer`) on the server polls `origin/main` every five minutes and runs `scripts/homelab-deploy.sh` when the SHA changes, which rsyncs the latest compose files and runs `docker compose up -d`. See the [supporting services overview](/veta-trading-platform/platform/supporting-services/) for the server compose layout, and the [operations strategy](/veta-trading-platform/platform/operations-strategy/) for the full deploy state machine and rationale.

## Public URLs

| Surface | URL |
| --- | --- |
| Application | [`https://veta.mnetcs.com/`](https://veta.mnetcs.com/) |
| Grafana dashboards | [`https://veta.mnetcs.com/grafana/`](https://veta.mnetcs.com/grafana/) |

Both are served by Traefik on the server and exposed to the public internet through a secure tunnel from the edge server.

## Local development

The dev container's `post-start.sh` runs `docker compose up -d` automatically
on container start. Services are managed by Docker Compose.

```sh
# Restart the stack (services managed by Compose)
docker compose --profile trading up -d

# Frontend dev server
cd frontend && npm run dev

# Electron
cd frontend && npm run electron:dev
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `OAUTH2_SHARED_SECRET` | `veta-dev-passcode` | Demo login passcode |
| `RISK_ENGINE_ENABLED` | `true` | Enable/disable pre-trade risk checks |
| `VETA_DEMO_MODE` | `true` | Show demo personas on login page |
| `JOURNAL_RETENTION_DAYS` | `90` | Event retention period |
| `LLM_ENABLED` | `false` | Enable Ollama LLM advisory |

## Secrets

Production credentials live in [OpenBao](https://openbao.org), a self-hosted secrets manager running on the production server as its own compose project (`deploy/openbao/compose.yml`, container `veta-openbao`). It listens on `127.0.0.1:8200` only. No container talks to it: the deploy reads secrets and passes them to Docker Compose.

| KV path | Holds |
| --- | --- |
| `secret/veta/platform` | Every credential `compose.yml`, `compose.prod.yml` and the LGTM stack interpolate: database, MinIO and Grafana passwords, OAuth secrets, synthetic trader passwords, Discord tokens and webhooks, market data API keys. Also `GITHUB_TICKETING_TOKEN_SECRET`, which reaches the gateway and discord-bot as the Compose secret file `/run/secrets/github_ticketing_token` (via `deploy/openbao/compose.secrets.yml`) rather than an environment variable |
| `secret/veta/loadgen` | `LOADGEN_OAUTH_PASSWORD` and any other loadgen settings |

`.env` in the stack directory keeps non-secret settings only, such as `VETA_CGROUP_PARENT` or `COMPOSE_FILE`.

### How a deploy reads secrets

`scripts/homelab-deploy.sh` sources `scripts/lib/openbao-env.sh`, logs in with the `veta-deploy` AppRole, reads `veta/platform` (and `veta/loadgen` when `LOADGEN_ENABLED=true`), exports each value into its own environment and revokes the token. Compose gives the process environment precedence over `.env`, so every `docker compose` call in the deploy, including the LGTM stack, sees the vault values. Nothing is written to disk and no value appears in a command line.

The AppRole credentials are in the deploy user's `~/.config/veta/openbao-approle.json` (mode 600). The `veta-deploy` policy can read `secret/veta/*` and nothing else, and its tokens expire after five minutes.

If OpenBao is down, sealed, or rejects the login, the deploy stops before touching any container. Running containers are unaffected: Docker keeps each container's environment, so they restart after a reboot without the vault.

Run any other `docker compose` command on the server through `scripts/veta-compose.sh`, which loads the secrets first, for example `scripts/veta-compose.sh up -d gateway`. It defaults `COMPOSE_FILE` to the production chain (`compose.yml`, `compose.prod.yml`, `compose.observability.yml`); pass `-f` to use other files. A bare `docker compose up` would recreate containers with the compose defaults instead of the real credentials. `scripts/load.sh` loads them itself.

### Unsealing

OpenBao uses a static auto-unseal key at `/etc/veta/openbao/current.key` (32 random bytes, readable only by the container user), so it unseals itself after a restart. Anyone with root on the server can therefore read the vault; what it adds over a plaintext file is a single read-only deploy credential that can be revoked, an audit log of every access (`/openbao/logs/audit.log` in the `veta-openbao_openbao-logs` volume, values HMAC-hashed), and one place to change a value.

Keep two things offline, in a password manager: the unseal key (`sudo base64 /etc/veta/openbao/current.key`) and the recovery key printed at initialisation. Restoring the `openbao-data` volume on another host needs the unseal key. Regenerating a root token needs the recovery key.

### Changing a value

Log in as the `admin` user, whose `veta-admin` policy can edit `secret/veta/*`:

```sh
docker exec -it veta-openbao sh
bao login -method=userpass username=admin
read -rs v && printf %s "$v" | bao kv patch secret/veta/platform POLYGON_KEY=-
bao kv get secret/veta/platform
```

Piping the value through `read -rs` keeps it out of shell history and the process list, and drops the trailing newline. The web UI is also available through an SSH tunnel to port 8200 (`http://localhost:8200/ui`). Then redeploy so containers pick up the change, or recreate only the affected service with `scripts/veta-compose.sh`. KV v2 keeps previous versions, so `bao kv rollback -version=<n> secret/veta/platform` undoes a mistake.

To rotate the deploy credential, issue a new secret ID as `admin` (`bao write -f auth/approle/role/veta-deploy/secret-id`), put it in `openbao-approle.json`, then destroy the old one: `bao list auth/approle/role/veta-deploy/secret-id` shows the accessors, and `bao write auth/approle/role/veta-deploy/secret-id-accessor/destroy secret_id_accessor=<accessor>` removes one.

### First-time setup

Run `scripts/openbao-bootstrap.py` on the server as the deploy user, from the synced stack directory, after a deploy has put `deploy/openbao/` there. It:

1. Generates the unseal key with `sudo` if it does not exist, then starts `veta-openbao`.
2. Initialises OpenBao, writing the recovery key and root token to `~/openbao-init-<timestamp>.json` (mode 600).
3. Enables KV v2 at `secret/`, the `veta-deploy` and `veta-admin` policies, AppRole and userpass auth, prompts for the `admin` password, and writes the AppRole credentials.
4. Imports secret-looking variables from `.env` into `veta/platform` (names containing `PASSWORD`, `PASSWD`, `SECRET`, `TOKEN`, `WEBHOOK`, ending `_KEY`, or URLs with embedded credentials) and all of `.env.loadgen` into `veta/loadgen`. Values are resolved through `docker compose config`, so `$$` escapes and references come out exactly as containers see them today.
5. Reads everything back through the deploy loader, and only if every value matches, removes the imported lines from `.env` and deletes `.env.loadgen`.
6. Revokes the root token and lists any `.env.bak*` files that still hold old plaintext.

Move the recovery key into your password manager and shred the init file, then deploy and check the log for `exported N secrets from veta/platform`.

Rerunning the script is safe. It leaves an existing key, server, admin user and credentials alone and never overwrites a KV path that already exists. Configuring an already initialised OpenBao needs a root token (`bao operator generate-root` with the recovery key).

Until the bootstrap has run, a deploy that finds no AppRole credentials logs a warning and uses `.env` as before.
