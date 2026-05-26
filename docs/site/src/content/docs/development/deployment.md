---
title: Deployment
description: How to deploy VETA to the homelab or locally.
sidebar:
  order: 7
---

## Homelab (canonical)

The platform is deployed to a homelab host (Proxmox LXC, 32 cores, 64 GB RAM, 2 TB SSD, NAS-backed storage). Per-service Docker images are built by CI on every `main` push and pushed to GHCR; a systemd timer (`veta-auto-pull.timer`) on the homelab polls `origin/main` every five minutes and runs `scripts/homelab-deploy.sh` when the SHA changes, which rsyncs the latest compose files and runs `docker compose up -d`. See the [supporting services overview](/veta-trading-platform/platform/supporting-services/) for the homelab compose layout, and the [operations strategy](/veta-trading-platform/platform/operations-strategy/) for the full deploy state machine and rationale.

## Public URLs

| Surface | URL |
|---------|-----|
| Application | [`https://veta.mnetcs.com/`](https://veta.mnetcs.com/) |
| Grafana dashboards | [`https://veta.mnetcs.com/grafana/`](https://veta.mnetcs.com/grafana/) |

Both are served by Traefik on the homelab and exposed to the public internet through a reverse SSH tunnel from an OVH dedicated server.

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
|----------|---------|---------|
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `OAUTH2_SHARED_SECRET` | `veta-dev-passcode` | Demo login passcode |
| `RISK_ENGINE_ENABLED` | `true` | Enable/disable pre-trade risk checks |
| `VETA_DEMO_MODE` | `true` | Show demo personas on login page |
| `JOURNAL_RETENTION_DAYS` | `90` | Event retention period |
| `LLM_ENABLED` | `false` | Enable Ollama LLM advisory |
