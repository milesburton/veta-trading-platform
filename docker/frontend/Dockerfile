# ── Stage 1: Build frontend assets ────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /src/frontend

ARG VITE_DEPLOYMENT=uat
ARG VITE_COMMIT_SHA=dev
ARG VITE_BUILD_DATE=dev
ARG VITE_APP_VERSION=0.0.0
ENV VITE_DEPLOYMENT=$VITE_DEPLOYMENT
ENV VITE_COMMIT_SHA=$VITE_COMMIT_SHA
ENV VITE_BUILD_DATE=$VITE_BUILD_DATE
ENV VITE_APP_VERSION=$VITE_APP_VERSION

COPY frontend/package.json frontend/package-lock.json* ./
COPY frontend/ ./
COPY shared/ /src/shared/
COPY package.json /src/package.json
RUN npm ci --silent
RUN npm run build

# ── Stage 2: Serve static assets with the Node static file server ─────────────
FROM node:24-slim
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

COPY frontend-server.ts ./
COPY backend/src/lib/http.ts backend/src/lib/static-files.ts backend/src/lib/telemetry.ts backend/src/lib/logger.ts backend/src/lib/service-name.ts ./backend/src/lib/
COPY --from=builder /src/frontend/dist ./frontend/dist

EXPOSE 3000
CMD ["node", "/app/frontend-server.ts"]
