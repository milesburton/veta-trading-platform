ARG BASE_TAG=latest
FROM ghcr.io/milesburton/veta-trading-platform/base:${BASE_TAG}
CMD ["deno", "run", "--allow-all", "/app/backend/src/llm-advisory/worker.ts"]
