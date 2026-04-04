import { expect, test } from "@playwright/test";

test("homepage title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/VETA Trading Platform/);
});
