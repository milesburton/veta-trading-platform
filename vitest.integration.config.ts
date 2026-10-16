import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["backend/src/tests/integration.test.ts", "backend/src/tests/algo.integration.test.ts", "backend/src/tests/intelligence.integration.test.ts", "backend/src/tests/scenarios.integration.test.ts", "backend/src/tests/journal.http.test.ts", "backend/src/tests/market-data.http.test.ts", "backend/src/tests/risk-engine.integration.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
