ARG BASE_TAG=latest
FROM ghcr.io/milesburton/veta-trading-platform/base:${BASE_TAG}
EXPOSE 5000
CMD ["deno", "run", "--allow-all", "/app/backend/src/market-sim/market-sim.ts"]
