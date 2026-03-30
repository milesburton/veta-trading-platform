FROM denoland/deno:2.1.4

WORKDIR /app

COPY backend/src/tests/smoke.test.ts tests/smoke.test.ts
COPY backend/src/tests/test-helpers.ts tests/test-helpers.ts

ENV VETA_BASE_URL=http://localhost

ENTRYPOINT ["deno", "test", "--allow-all", "--no-check", "tests/smoke.test.ts"]
