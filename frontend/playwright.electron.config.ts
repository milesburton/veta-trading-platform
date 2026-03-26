import { defineConfig } from "@playwright/test";
import * as path from "path";

// Electron E2E tests launch the packaged app directly via the _electron fixture.
// Run with: npm run test:electron
// Prerequisites: npm run electron:build (produces dist/ + dist-electron/)

export default defineConfig({
  testDir: "./tests-electron",
  timeout: 60_000,
  // beforeAll hooks that launch Electron need more time in CI (xvfb + cold start)
  globalTimeout: 10 * 60_000, // 10 min overall
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Electron tests must run serially — only one app instance

  use: {
    // Screenshot on failure to diagnose issues
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "electron",
      // Playwright's _electron fixture is used directly in tests — no browser project needed
      use: {},
    },
  ],
});
