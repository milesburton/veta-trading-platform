# ── Shared base image ─────────────────────────────────────────────────────────
# All per-service images FROM this. Contains the Node runtime, the production
# dependencies and the entire repo source tree. Service images add only CMD.
# Build context: repo root (required: COPY . . copies backend/, observability/, etc.)
FROM node:24-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV NODE_OPTIONS="--import=/app/backend/src/lib/otel-register.ts"

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

COPY . .

# Drop privileges. UID/GID 1993 is kept from the previous runtime image so that
# anything mounted writable at runtime keeps the same host ownership (chown to 1993:1993).
RUN groupadd --gid 1993 veta && useradd --uid 1993 --gid 1993 --no-create-home --shell /usr/sbin/nologin veta \
    && chown -R veta:veta /app
USER veta:veta
