ARG BASE_TAG=latest
FROM ghcr.io/milesburton/veta-trading-platform/base:${BASE_TAG}
EXPOSE 5007
CMD ["deno", "run", "--allow-all", "/app/observability/kafka-relay.ts"]
