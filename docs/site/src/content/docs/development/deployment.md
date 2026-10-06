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

Production configuration, including credentials, is committed as a [SOPS](https://github.com/getsops/sops)-encrypted dotenv file, `deploy/homelab.sops.env`, encrypted to an [age](https://github.com/FiloSottile/age) key. The private key exists only on the production server, at the deploy user's `~/.config/sops/age/keys.txt`. `.sops.yaml` at the repo root names the public recipient.

On each deploy, `scripts/homelab-deploy.sh` syncs the encrypted file and decrypts it to the stack's `.env` (mode 600). If the content changed, the previous `.env` is kept as `.env.bak.<timestamp>`. If decryption fails, the deploy aborts and leaves `.env` untouched. If the encrypted file, `sops` or the key is absent, the deploy keeps the existing `.env`.

The rendered `.env` is overwritten whenever the encrypted file changes, so edit the encrypted file rather than `.env`.

### Changing a value

Decryption needs the private key, so edits happen on the server:

```sh
cp deploy/homelab.sops.env /tmp/homelab.sops.env   # from the synced stack directory
sops edit --input-type dotenv --output-type dotenv /tmp/homelab.sops.env
```

Copy the edited file into `deploy/homelab.sops.env` in a repo checkout and open a PR. Do not add comments: SOPS leaves comment lines unencrypted, and the pre-commit hook rejects any line that is not an encrypted value or SOPS metadata.

### First-time setup

Install `sops` and `age` on the server, then run `scripts/homelab-secrets-bootstrap.sh` there. It generates the age key if none exists, encrypts the current `.env` with comments removed, verifies the round trip, and writes `state/homelab.sops.env` and `state/.sops.yaml` for you to commit as `deploy/homelab.sops.env` and `.sops.yaml`. Back up the age key offline: without it, every secret has to be re-created.
