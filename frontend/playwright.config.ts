import { defineConfig, devices } from "@playwright/test";
import process from "node:process";

const PORT = 5173;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  // Fail the build if test.only is accidentally left in source.
  forbidOnly: !!process.env.CI,
  // Retry once on CI to tolerate flaky timing; never locally.
  retries: process.env.CI ? 1 : 0,
  // Keep local concurrency modest so the Vite-driven browser suite doesn't
  // overwhelm the dev server and start flaking with connection refusals.
  workers: process.env.CI ? 2 : 1,

  webServer: {
    command: `npx vite --port ${PORT} --mode playwright`,
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
