---
title: Quick Start
description: Get VETA running locally in under 5 minutes.
---

## Prerequisites

- Docker and VS Code (or JetBrains) with Dev Containers support
- OR Deno 2.7+, Node 24+, and PostgreSQL 16+

## Dev Container (recommended)

1. Clone the repository
2. Open in VS Code → "Reopen in Container"
3. The MOTD will show available commands
4. Run `cd frontend && npm run dev` for the browser UI

## Manual setup

```sh
# Backend services (managed by supervisord)
supervisorctl start all

# Frontend dev server
cd frontend && npm run dev

# Electron desktop app
cd frontend && npm run electron:dev
```

## Default credentials

- **Username**: `alice` (or any persona from the Demo Personas page)
- **Passcode**: `veta-dev-passcode`

The login page has a "Demo personas" panel — click any card to sign in with one click.

## Live demo

The platform is deployed at [veta-trading.fly.dev](https://veta-trading.fly.dev/). Note: this may be transiently offline as the project matures.
