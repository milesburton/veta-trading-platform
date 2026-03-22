ARG BASE_TAG=latest
FROM ghcr.io/milesburton/veta-trading-platform/base:${BASE_TAG}
ARG COMMIT_SHA=dev
ENV COMMIT_SHA=${COMMIT_SHA}
EXPOSE 5017
CMD ["deno", "run", "--allow-all", "/app/backend/src/feature-engine/feature-engine.ts"]
