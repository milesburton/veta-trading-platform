ARG BASE_TAG=latest
FROM ghcr.io/milesburton/veta-trading-platform/base:${BASE_TAG}
ARG COMMIT_SHA=dev
ENV COMMIT_SHA=${COMMIT_SHA}
CMD ["deno", "run", "--allow-all", "/app/backend/src/llm-advisory/worker.ts"]
