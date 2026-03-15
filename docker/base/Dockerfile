# ── Shared base image ─────────────────────────────────────────────────────────
# All per-service images FROM this. Contains the full Deno runtime, the entire
# repo source tree, and pre-warmed module cache. Service images add only CMD.
# Build context: repo root (required — COPY . . copies backend/, observability/, etc.)
FROM denoland/deno:2.7.1

ENV DEBIAN_FRONTEND=noninteractive
ENV DENO_DIR=/deno-cache

# Install curl (health checks) and ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY deno.json deno.lock* ./
# Copy package.json for npm: imports (kafkajs etc.)
COPY package.json package-lock.json* ./

# Install npm deps into DENO_DIR (populates npm compat layer for kafkajs)
RUN deno install

# Copy full source tree
COPY . .

# Pre-cache all service entrypoints — this is the expensive layer, shared by all
# service images via the layer cache. Re-runs only when source files change.
RUN deno cache \
    backend/db/migrate.ts \
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
    backend/src/algo/momentum-strategy.ts \
    backend/src/algo/is-strategy.ts \
    backend/src/user-service/user-service.ts \
    backend/src/journal/journal-server.ts \
    backend/src/fix/fix-exchange.ts \
    backend/src/fix/fix-gateway.ts \
    backend/src/fix/fix-archive.ts \
    backend/src/analytics/analytics-server.ts \
    backend/src/market-data/market-data-service.ts \
    backend/src/market-data-adapters/adapter-server.ts \
    backend/src/news/news-aggregator.ts \
    backend/src/feature-engine/feature-engine.ts \
    backend/src/signal-engine/signal-engine.ts \
    backend/src/recommendation-engine/recommendation-server.ts \
    backend/src/scenario-engine/scenario-server.ts \
    backend/src/gateway/gateway.ts \
    backend/src/llm-advisory/orchestrator.ts \
    backend/src/llm-advisory/worker.ts \
    observability/kafka-relay.ts
