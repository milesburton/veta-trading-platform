ARG BASE_TAG=latest
FROM ghcr.io/milesburton/veta-trading-platform/base:${BASE_TAG}
EXPOSE 9880
CMD ["deno", "run", "--allow-all", "/app/backend/src/fix/fix-exchange.ts"]
