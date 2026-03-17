ARG BASE_TAG=latest
FROM ghcr.io/milesburton/veta-trading-platform/base:${BASE_TAG}
EXPOSE 5027
CMD ["deno", "run", "--allow-all", "/app/backend/src/dark-pool/dark-pool-server.ts"]
