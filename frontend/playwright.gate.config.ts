import { defineConfig, devices } from "@playwright/test";
import process from "node:process";

const baseURL = process.env.GATE_BASE_URL ?? "http://localhost";

export default defineConfig({
  testDir: "./tests/gate",
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,

  use: {
    baseURL,
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 15_000,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-gate-report" }]],
});
