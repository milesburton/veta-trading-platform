import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react({ babel: { plugins: [["module:@preact/signals-react-transform"]] } }),
  ],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost:3000" } },
    globals: true,
    testTimeout: 15_000,
    hookTimeout: 20_000,
    setupFiles: ["./src/setupTests.ts"],
    include: ["src/**/*.{test,spec}.{js,ts,tsx}"],
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 80,
      },
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.*",
        "src/**/*.spec.*",
        "src/**/*.stories.*",
        "src/stories/**",
        "src/electron.d.ts",
        "src/setupTests.ts",
        "src/main.tsx",
        "src/vite-env.d.ts",
        // Playwright-owned app shell and end-to-end UI workflows.
        "src/App.tsx",
        "src/components/dashboard/DashboardLayout.tsx",
        "src/components/AdvisoryPanel.tsx",
        "src/components/InstrumentAnalysisPanel.tsx",
        "src/components/ObservabilityPanel.tsx",
        "src/components/ResearchRadarPanel.tsx",
        "src/components/SessionReplayPanel.tsx",
        "src/components/SpreadAnalysisPanel.tsx",
        "src/hooks/useSessionRecording.ts",
      ],
    },
  },
});
