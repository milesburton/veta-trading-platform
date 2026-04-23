# Dev container image — inherits the pre-built base (all heavy tooling,
# Redpanda, Playwright, Deno, Node, Docker CLI, etc.) and adds only
# dev-container-specific config.
#
# Dockerfile.base is published to:
#   ghcr.io/milesburton/veta-trading-platform-base:latest
# Rebuild it via GitHub Actions (build-base-image.yml) when base tooling changes.
# Services are managed by docker compose via the host Docker socket — no supervisord.
FROM ghcr.io/milesburton/veta-trading-platform-base:latest

# Devcontainer Features inject POSIX shell scripts during build; ensure they run
# under a POSIX shell even if the base image default SHELL is fish.
SHELL ["/bin/bash", "-c"]

# xvfb provides a headless X display for running Electron E2E tests locally.
# Usage: xvfb-run --auto-servernum npm run test:electron
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       xvfb libgtk-3-0 libnotify-dev libnss3 libxss1 libasound2 libxtst6 xauth libgbm-dev \
    && npm install -g @anthropic-ai/claude-code \
    && rm -rf /var/lib/apt/lists/*
USER deno

# Bootstrap Fish config: source the live workspace file so changes take effect
# without rebuilding the container. The workspace is mounted at runtime at
# /workspaces/virtual-equities-trading-application by the devcontainer.
RUN echo 'source /workspaces/virtual-equities-trading-application/.devcontainer/config.fish' \
    > /home/deno/.config/fish/config.fish

# Services are started by postStartCommand in devcontainer.json via docker compose
# using the host Docker socket. No supervisord needed.
