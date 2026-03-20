# Dev container image — inherits the pre-built base (all heavy tooling, Postgres,
# Redpanda, Playwright, Deno, Node, etc.) and adds only dev-container-specific config.
#
# Dockerfile.base is published to:
#   ghcr.io/milesburton/veta-trading-platform-base:latest
# Rebuild it via GitHub Actions (build-base-image.yml) when base tooling changes.
# Rebuild THIS image (Rebuild Container in VS Code) when supervisord.conf changes.
FROM ghcr.io/milesburton/veta-trading-platform-base:latest

# Bootstrap Fish config: source the live workspace file so changes take effect
# without rebuilding the container. The workspace is mounted at runtime at
# /workspaces/virtual-equities-trading-application by the devcontainer.
RUN echo 'source /workspaces/virtual-equities-trading-application/.devcontainer/config.fish' \
    > /home/deno/.config/fish/config.fish

# Services are started by postStartCommand in devcontainer.json via docker compose
# using the host Docker socket. No supervisord needed.
