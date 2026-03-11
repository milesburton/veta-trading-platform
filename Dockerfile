# ── Stage 0a: Extract Redpanda broker binary ──────────────────────────────────
FROM redpandadata/redpanda:v24.3.6 AS redpanda-src

# ── Stage 0b: Extract Redpanda Console binary ─────────────────────────────────
FROM redpandadata/console:v2.7.2 AS console-src

# ── Stage 1: Build frontend assets ────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /src/frontend

ARG VITE_DEPLOYMENT=local
ARG VITE_COMMIT_SHA=dev
ARG VITE_BUILD_DATE=dev
ENV VITE_DEPLOYMENT=$VITE_DEPLOYMENT
ENV VITE_COMMIT_SHA=$VITE_COMMIT_SHA
ENV VITE_BUILD_DATE=$VITE_BUILD_DATE

COPY frontend/package.json frontend/package-lock.json* ./
COPY frontend/ ./
RUN npm ci --silent || npm install --silent
RUN npm run build

# ── Stage 2: Runtime image ────────────────────────────────────────────────────
# Debian slim + official Deno image as base. Deno's alpine image fails on
# Depot's build platform (glibc symbol mismatches); Debian avoids that.
FROM denoland/deno:2.7.1 AS runtime
ENV DEBIAN_FRONTEND=noninteractive

# Install supervisord, bash, libstdc++ (required by Redpanda), ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    supervisor curl bash libstdc++6 ca-certificates gnupg lsb-release zstd \
    && rm -rf /var/lib/apt/lists/*

# Add PostgreSQL PGDG apt repo and install postgresql-16
RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-16 \
    && rm -rf /var/lib/apt/lists/*

# Copy Redpanda runtime assets and place real executables on PATH.
# This avoids relying on wrapper scripts that hard-code /opt/redpanda paths.
COPY --from=redpanda-src /opt/redpanda/lib /usr/local/lib/redpanda
COPY --from=redpanda-src /opt/redpanda/libexec/redpanda /usr/local/bin/redpanda
COPY --from=redpanda-src /opt/redpanda/libexec/rpk /usr/local/bin/rpk
# Copy Redpanda Console binary
COPY --from=console-src /app/console /usr/local/bin/redpanda-console
RUN chmod +x /usr/local/bin/redpanda /usr/local/bin/rpk /usr/local/bin/redpanda-console
# Install the Redpanda wrapper script. This launches the broker via its own
# bundled ld.so to avoid glibc 2.41 conflicts with denoland/deno:2.x base.
COPY redpanda-start.sh /usr/local/bin/redpanda-start.sh
COPY postgres-start.sh /usr/local/bin/postgres-start.sh
RUN chmod +x /usr/local/bin/redpanda-start.sh /usr/local/bin/postgres-start.sh

# Download Traefik v3 binary
ARG TRAEFIK_VERSION=3.3.3
RUN curl -fsSL "https://github.com/traefik/traefik/releases/download/v${TRAEFIK_VERSION}/traefik_v${TRAEFIK_VERSION}_linux_amd64.tar.gz" \
    | tar -xz -C /usr/local/bin traefik \
    && chmod +x /usr/local/bin/traefik

# Install Ollama (local LLM inference — no external API required)
RUN curl -fsSL https://ollama.com/install.sh | sh

# Pre-cache the file-server and crypto modules used by the frontend server
RUN deno cache jsr:@std/http/file-server jsr:@std/crypto jsr:@std/encoding/hex

# Copy application source and Fly.io configs
WORKDIR /app
COPY . .
COPY --from=builder /src/frontend/dist ./frontend/dist

# Install npm dependencies (populates node_modules/ for npm: imports like kafkajs)
RUN deno install

# Pre-cache all backend Deno modules to avoid slow cold-start JIT compilation
RUN deno cache \
    frontend-server.ts \
    backend/src/lib/messaging.ts \
    backend/src/market-sim/market-sim.ts \
    backend/src/ems/ems-server.ts \
    backend/src/oms/oms-server.ts \
    backend/src/algo/limit-strategy.ts \
    backend/src/algo/twap-strategy.ts \
    backend/src/algo/pov-strategy.ts \
    backend/src/algo/vwap-strategy.ts \
    backend/src/algo/iceberg-strategy.ts \
    backend/src/algo/sniper-strategy.ts \
    backend/src/algo/arrival-price-strategy.ts \
    observability/kafka-relay.ts \
    backend/src/user-service/user-service.ts \
    backend/src/journal/journal-server.ts \
    backend/src/fix/fix-exchange.ts \
    backend/src/fix/fix-gateway.ts \
    backend/src/fix/fix-archive.ts \
    backend/src/analytics/analytics-server.ts \
    backend/src/market-data/market-data-service.ts \
    backend/src/news/news-aggregator.ts \
    backend/src/market-data-adapters/adapter-server.ts \
    backend/src/feature-engine/feature-engine.ts \
    backend/src/signal-engine/signal-engine.ts \
    backend/src/recommendation-engine/recommendation-server.ts \
    backend/src/scenario-engine/scenario-server.ts \
    backend/src/gateway/gateway.ts \
    backend/src/llm-advisory/orchestrator.ts \
    backend/src/llm-advisory/worker.ts

EXPOSE 8080
CMD ["supervisord", "-c", "/app/supervisord-fly.conf"]
