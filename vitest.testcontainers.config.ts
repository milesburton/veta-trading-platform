import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["backend/src/tests/**/*.tc.test.ts", "backend/src/tests/testcontainers.*.test.ts"],
    environment: "node",
    testTimeout: 300_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
