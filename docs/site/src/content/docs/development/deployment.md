---
title: Deployment
description: How to deploy VETA to the production server or locally.
sidebar:
  order: 7
---

## Production (canonical)

The platform is deployed to a server (Proxmox LXC, 32 cores, 64 GB RAM, 2 TB SSD, NAS-backed storage). Per-service Docker images are built by CI on every `main` push and pushed to GHCR; a systemd timer (`veta-auto-pull.timer`) on the server polls `origin/main` every five minutes and runs `scripts/homelab-deploy.sh` when the SHA changes, which rsyncs the latest compose files and runs `docker compose up -d`. See the [supporting services overview](/veta-trading-platform/platform/supporting-services/) for the server compose layout, and the [operations strategy](/veta-trading-platform/platform/operations-strategy/) for the full deploy state machine and rationale.

## Public URLs

| Surface | URL |
| --- | --- |
| Application | [`https://veta.example.com/`](https://veta.example.com/) |
| Grafana dashboards | [`https://veta.example.com/grafana/`](https://veta.example.com/grafana/) |

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
