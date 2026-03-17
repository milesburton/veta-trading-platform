ARG BASE_TAG=latest
FROM ghcr.io/milesburton/veta-trading-platform/base:${BASE_TAG}
EXPOSE 5028
CMD ["deno", "run", "--allow-all", "/app/backend/src/ccp/ccp-service.ts"]
