import { chromium, type FullConfig } from "@playwright/test";

const WARM_UP_TIMEOUT_MS = 120_000;

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(baseURL, { waitUntil: "networkidle", timeout: WARM_UP_TIMEOUT_MS });
  } finally {
    await browser.close();
  }
}
