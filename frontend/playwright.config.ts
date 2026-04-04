import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  // Fail the build if test.only is accidentally left in source.
  forbidOnly: !!process.env.CI,
  // Retry once on CI to tolerate flaky timing; never locally.
  retries: process.env.CI ? 1 : 0,
  // Serial on CI (single worker keeps resource usage low); parallel locally.
  workers: process.env.CI ? 1 : undefined,

  webServer: {
    command: `npx vite --port ${PORT} --mode test`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },

  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 10_000,
    ignoreHTTPSErrors: true,
    // Capture trace on first retry so failures are diagnosable in CI.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
});
