import { expect, ladderTest } from "./helpers/fixtures.ts";
import { DEFAULT_ASSETS } from "./helpers/GatewayMock.ts";

ladderTest.describe("Market Ladder — asset rows", () => {
  ladderTest("shows a row for each seeded asset", async ({ ladder }) => {
    for (const asset of DEFAULT_ASSETS) {
      await ladder.waitForSymbol(asset.symbol);
      await ladder.expectVisible(asset.symbol);
    }
  });

  ladderTest("shows AAPL row text", async ({ ladder }) => {
    const row = ladder.rowForSymbol("AAPL");
    await expect(row).toBeVisible();
    const text = await row.textContent();
    expect(text).toContain("AAPL");
  });
});

ladderTest.describe("Market Ladder — live price updates", () => {
  ladderTest("prices appear after marketUpdate WS message", async ({ ladder, gateway, page }) => {
    gateway.sendMarketUpdate({ AAPL: 189.5, MSFT: 421.0, GOOGL: 175.25 });
    await page.waitForTimeout(400);

    const text = await ladder.rowForSymbol("AAPL").textContent();
    expect(text).toMatch(/189\.\d\d|189\.5/);
  });

  ladderTest("price going up applies green colour", async ({ ladder, gateway, page }) => {
    gateway.sendMarketUpdate({ AAPL: 180.0 });
    await page.waitForTimeout(400);
    gateway.sendMarketUpdate({ AAPL: 185.0 });
    await page.waitForTimeout(400);

    const priceSpan = ladder.rowForSymbol("AAPL").locator(".tabular-nums").nth(3);
    await expect(priceSpan).toHaveClass(/emerald/, { timeout: 500 });
  });

  ladderTest("price going down applies red colour", async ({ ladder, gateway, page }) => {
    gateway.sendMarketUpdate({ AAPL: 190.0 });
    await page.waitForTimeout(400);
    gateway.sendMarketUpdate({ AAPL: 185.0 });
    await page.waitForTimeout(400);

    const priceSpan = ladder.rowForSymbol("AAPL").locator(".tabular-nums").nth(3);
    await expect(priceSpan).toHaveClass(/red/, { timeout: 500 });
  });

  ladderTest("multiple symbols update independently", async ({ ladder, gateway, page }) => {
    await ladder.waitForSymbol("MSFT");
    gateway.sendMarketUpdate({ AAPL: 189.5, MSFT: 421.0 });
    await page.waitForTimeout(400);

    const text = await ladder.rowForSymbol("MSFT").textContent();
    expect(text).toMatch(/421\.\d\d|421\.0/);
  });
});

ladderTest.describe("Market Ladder — symbol selection", () => {
  ladderTest("clicking marks symbol as selected", async ({ ladder }) => {
    await ladder.selectSymbol("AAPL");
    await expect(ladder.rowForSymbol("AAPL")).toHaveAttribute("aria-pressed", "true", { timeout: 3_000 });
  });

  ladderTest("clicking again deselects", async ({ ladder }) => {
    await ladder.selectSymbol("AAPL");
    await expect(ladder.rowForSymbol("AAPL")).toHaveAttribute("aria-pressed", "true", { timeout: 3_000 });

    await ladder.selectSymbol("AAPL");
    await expect(ladder.rowForSymbol("AAPL")).toHaveAttribute("aria-pressed", "false", { timeout: 3_000 });
  });
});
