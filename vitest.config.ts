import { readFileSync } from "node:fs";
import { defineConfig } from "vite-plus";

const unitExcludes: string[] = JSON.parse(readFileSync("vitest.exclude.json", "utf8"));

export default defineConfig({
  test: {
    include: ["backend/**/*.test.ts", "shared/**/*.test.ts"],
    exclude: ["**/node_modules/**", ...unitExcludes],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["lcov", "text-summary"],
      reportsDirectory: "coverage",
      include: ["backend/src/**/*.ts", "backend/db/**/*.ts", "shared/**/*.ts"],
      exclude: ["backend/src/tests/**", "backend/src/test-support/**", "**/*.test.ts"],
    },
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
