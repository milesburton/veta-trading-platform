---
title: Quick Start
description: Run VETA locally in under five minutes.
---

## Prerequisites

- Docker and VS Code (or JetBrains) with Dev Containers support
- OR Deno 2.7+, Node 24+, and PostgreSQL 16+

## Dev Container (recommended)

1. Clone the repository.
2. Open in VS Code and select "Reopen in Container".
3. The MOTD lists the available commands.
4. Run `cd frontend && npm run dev` for the browser UI.

## Manual setup (without Dev Container)

```sh
# Backend services. Docker Compose runs the full stack.
docker compose --profile trading up -d

# Frontend dev server (separate terminal)
cd frontend && npm run dev

# Electron desktop app
cd frontend && npm run electron:dev
```

Verify the stack is up: `docker compose ps` should show the core services healthy. The frontend dev server proxies API calls to the gateway at port 5011.

## Default credentials

- **Username**: `alice` (or any persona from the Demo Personas page)
- **Passcode**: `veta-dev-passcode`

The login page has a "Demo personas" panel. Click any card to sign in with one click.

Once signed in, the default workspace looks like this:

![Default trader workspace after sign-in](/veta-trading-platform/screenshots/01-trading-dashboard.png)

## Where it runs

The canonical deployment is a homelab Proxmox LXC, exposed to the public internet via a reverse SSH tunnel from an OVH dedicated server. The app lives at [`https://veta.mnetcs.com/`](https://veta.mnetcs.com/) and the dashboards at [`https://veta.mnetcs.com/grafana/`](https://veta.mnetcs.com/grafana/). To try it locally, follow the [overview](/veta-trading-platform/guides/overview/).
