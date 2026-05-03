---
title: Deployment
description: How to deploy VETA to Fly.io or locally.
sidebar:
  order: 7
---

## Fly.io (cloud demo)

Single monolith with supervisord managing 30+ services.

```sh
flyctl deploy --dockerfile Dockerfile.fly --remote-only \
  --build-arg VITE_COMMIT_SHA=$(git rev-parse --short HEAD) \
  --build-arg VITE_BUILD_DATE=$(date -u +%Y-%m-%d)
```

The CI workflow auto-deploys on push to `main` with:
- 3-attempt retry on `flyctl deploy`
- Version verification (accepts any of the last 5 commit SHAs)
- Smoke tests against the live deployment when a machine is running
- Concurrency control (one deploy at a time)

`fly.toml` sets `auto_start_machines=false`, `auto_stop_machines=suspend`, and `min_machines_running=0`. After a deploy the new image is rolled but machines remain stopped; start them manually with `flyctl machine start <id>`.

## Local development

```sh
# Start all services
supervisorctl start all

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
