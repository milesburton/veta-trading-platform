# ── Stage 1: Build frontend assets ────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /src/frontend

ARG VITE_DEPLOYMENT=homelab
ARG VITE_COMMIT_SHA=dev
ARG VITE_BUILD_DATE=dev
ENV VITE_DEPLOYMENT=$VITE_DEPLOYMENT
ENV VITE_COMMIT_SHA=$VITE_COMMIT_SHA
ENV VITE_BUILD_DATE=$VITE_BUILD_DATE

COPY frontend/package.json frontend/package-lock.json* ./
COPY frontend/ ./
COPY shared/ /src/shared/
RUN npm ci --silent
RUN npm run build

# ── Stage 2: Serve static assets via Deno file-server ─────────────────────────
FROM denoland/deno:2.7.1
ENV DENO_DIR=/deno-cache

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache file-server module before copying dist (improves layer cache hits)
RUN deno cache jsr:@std/http/file-server jsr:@std/crypto jsr:@std/encoding/hex

COPY frontend-server.ts ./
COPY --from=builder /src/frontend/dist ./frontend/dist

EXPOSE 3000
CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-env", "/app/frontend-server.ts"]
