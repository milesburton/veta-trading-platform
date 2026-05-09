---
title: Deployment
description: How to deploy VETA to the homelab, Fly.io (manual), or locally.
sidebar:
  order: 7
---

## Homelab (canonical)

The platform is currently deployed only to a homelab box (solar-powered, plenty of resources). Per-service Docker images are built by CI on every main push and pushed to GHCR; Watchtower on the homelab polls every 5 minutes and restarts containers when a new `:latest` is available. See the [supporting services overview](/veta-trading-platform/platform/supporting-services/) for the homelab compose file shape.

## Fly.io (manual deploy only)

Auto-deploy on main push is **disabled** while the platform is right-sized to fit Fly's shared-cpu memory ceiling. The workflow file is kept so the deploy recipe stays self-documenting; trigger a one-off deploy via:

```sh
gh workflow run deploy.yml --ref main
```

Or from the local CLI:

```sh
flyctl deploy --dockerfile Dockerfile.fly --remote-only \
  --build-arg VITE_COMMIT_SHA=$(git rev-parse --short HEAD) \
  --build-arg VITE_BUILD_DATE=$(date -u +%Y-%m-%d)
```

`fly.toml` sets `auto_start_machines=false`, `auto_stop_machines=suspend`, and `min_machines_running=0`. After a deploy the new image is rolled but machines remain stopped; start them manually with `flyctl machine start <id>`.

To re-enable on every main push, restore the `push: branches: main` trigger in [`.github/workflows/deploy.yml`](https://github.com/milesburton/veta-trading-platform/blob/main/.github/workflows/deploy.yml).

## Local development

The dev container's `post-start.sh` runs `docker compose up -d` automatically
on container start. Services are managed by Docker Compose, not supervisord
(supervisord is only used inside the Fly.io image, where every service runs
as a process under one container).

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
| `JOURNAL_RETENTION_DAYS` | `90` (local) / `1` (Fly.io) | Event retention period |
| `LLM_ENABLED` | `false` | Enable Ollama LLM advisory |
