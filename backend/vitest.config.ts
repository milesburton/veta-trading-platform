import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.tc.test.ts", "src/**/integration.test.ts", "src/**/*.integration.test.ts", "src/**/*.http.test.ts", "src/**/load.test.ts", "src/**/testcontainers.*.test.ts"],
    environment: "node",
  },
});
