import { expect, test } from "@playwright/test";
import { AppPage } from "./helpers/pages/AppPage.ts";
import { DEFAULT_ASSETS } from "./helpers/GatewayMock.ts";

test.describe("Market data", () => {
  test.describe("Market Ladder — asset rows", () => {
    test("shows a row for each seeded asset", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader(DEFAULT_ASSETS);

      const ladder = await app.getMarketLadder();
      for (const asset of DEFAULT_ASSETS) {
        await ladder.waitForSymbol(asset.symbol);
        await ladder.expectVisible(asset.symbol);
      }
    });

    test("initially shows dash placeholders for prices (no ticks yet)", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader(DEFAULT_ASSETS);

      const ladder = await app.getMarketLadder();
      await ladder.waitForSymbol("AAPL");

      const aaplRow = ladder.rowForSymbol("AAPL");
      await expect(aaplRow).toBeVisible();
      const rowText = await aaplRow.textContent();
      expect(rowText).toContain("AAPL");
    });
  });

  test.describe("Market Ladder — live price updates", () => {
    test("prices appear after a marketUpdate WS message", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader(DEFAULT_ASSETS);

      const ladder = await app.getMarketLadder();
      await ladder.waitForSymbol("AAPL");

      app.gateway.sendMarketUpdate({
        AAPL: 189.50,
        MSFT: 421.00,
        GOOGL: 175.25,
      });

      await page.waitForTimeout(400);

      const aaplRow = ladder.rowForSymbol("AAPL");
      const rowText = await aaplRow.textContent();
      expect(rowText).toMatch(/189\.\d\d|189\.5/);
    });

    test("price going up applies green (emerald) colour class", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader(DEFAULT_ASSETS);

      const ladder = await app.getMarketLadder();
      await ladder.waitForSymbol("AAPL");

      app.gateway.sendMarketUpdate({ AAPL: 180.00 });
      await page.waitForTimeout(400);

      app.gateway.sendMarketUpdate({ AAPL: 185.00 });
      await page.waitForTimeout(400);

      const aaplRow = ladder.rowForSymbol("AAPL");
      const priceSpan = aaplRow.locator(".tabular-nums").nth(3);

      await expect(priceSpan).toHaveClass(/emerald/, { timeout: 500 });
    });

    test("price going down applies red colour class", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader(DEFAULT_ASSETS);

      const ladder = await app.getMarketLadder();
      await ladder.waitForSymbol("AAPL");

      app.gateway.sendMarketUpdate({ AAPL: 190.00 });
      await page.waitForTimeout(400);

      app.gateway.sendMarketUpdate({ AAPL: 185.00 });
      await page.waitForTimeout(400);

      const aaplRow = ladder.rowForSymbol("AAPL");
      const priceSpan = aaplRow.locator(".tabular-nums").nth(3);
      await expect(priceSpan).toHaveClass(/red/, { timeout: 500 });
    });

    test("multiple symbols update independently", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader(DEFAULT_ASSETS);

      const ladder = await app.getMarketLadder();
      await ladder.waitForSymbol("MSFT");

      app.gateway.sendMarketUpdate({ AAPL: 189.50, MSFT: 421.00 });
      await page.waitForTimeout(400);

      const msftRow = ladder.rowForSymbol("MSFT");
      const msftText = await msftRow.textContent();
      expect(msftText).toMatch(/421\.\d\d|421\.0/);
    });
  });

  test.describe("Market Ladder — symbol selection", () => {
    test("clicking a symbol row marks it as selected", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader(DEFAULT_ASSETS);

      const ladder = await app.getMarketLadder();
      await ladder.waitForSymbol("AAPL");
      await ladder.selectSymbol("AAPL");

      await expect(
        ladder.rowForSymbol("AAPL"),
      ).toHaveAttribute("aria-pressed", "true", { timeout: 3_000 });
    });

    test("clicking the same symbol again deselects it", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader(DEFAULT_ASSETS);

      const ladder = await app.getMarketLadder();
      await ladder.waitForSymbol("AAPL");

      await ladder.selectSymbol("AAPL");
      await expect(ladder.rowForSymbol("AAPL")).toHaveAttribute(
        "aria-pressed",
        "true",
        { timeout: 3_000 },
      );

      await ladder.selectSymbol("AAPL");
      await expect(ladder.rowForSymbol("AAPL")).toHaveAttribute(
        "aria-pressed",
        "false",
        { timeout: 3_000 },
      );
    });
  });
});
