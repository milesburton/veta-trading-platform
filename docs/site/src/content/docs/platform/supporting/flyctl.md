---
title: flyctl in the dev container
description: Pinned flyctl with host-shared credentials for the public Fly.io demo deploy.
---

The dev container ships with [`flyctl`](https://fly.io/docs/flyctl/) preinstalled at a pinned version (`FLYCTL_VERSION` in `.devcontainer/Dockerfile`). The host's `~/.fly` directory is bind-mounted into the container so that `flyctl auth login` on the host persists across container rebuilds — no need to re-authenticate per session.

## Auth status check on container start

`post-start.sh` reports the current auth status on container start and warns if the runtime `flyctl` differs from the version baked into the image (usually because a host-installed binary is shadowing the system one).

## First-time setup

See the [Fly auth docs](https://fly.io/docs/flyctl/auth-login/) for first-time setup. Once authenticated on the host, the dev container picks the credentials up automatically — there is nothing to configure inside the container itself.
