ARG BASE_TAG=latest
FROM ghcr.io/milesburton/veta-trading-platform/base:${BASE_TAG}
ARG COMMIT_SHA=dev
ENV COMMIT_SHA=${COMMIT_SHA}
USER root
RUN mkdir -p /app/data && chown veta:veta /app/data
USER veta:veta
EXPOSE 5015
CMD ["node", "/app/backend/src/market-data/market-data-service.ts"]
