ARG BASE_TAG=latest
FROM ghcr.io/milesburton/veta-trading-platform/base:${BASE_TAG}
EXPOSE 5018
CMD ["deno", "run", "--allow-all", "/app/backend/src/signal-engine/signal-engine.ts"]
