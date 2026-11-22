import { expect, ladderTest } from "./helpers/fixtures.ts";
import { DEFAULT_ASSETS } from "./helpers/GatewayMock.ts";

ladderTest.describe("Market Ladder, asset rows", () => {
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

ladderTest.describe("Market Ladder, live price updates", () => {
  ladderTest("prices appear after marketUpdate WS message", async ({ ladder, gateway }) => {
    gateway.sendMarketUpdate({ AAPL: 189.5, MSFT: 421.0, GOOGL: 175.25 });

    await expect(ladder.rowForSymbol("AAPL")).toContainText("189.50");
  });

  ladderTest("price going up applies green colour", async ({ ladder, gateway }) => {
    gateway.sendMarketUpdate({ AAPL: 180.0 });
    await expect(ladder.rowForSymbol("AAPL")).toContainText("180.00");
    gateway.sendMarketUpdate({ AAPL: 185.0 });
    await expect(ladder.rowForSymbol("AAPL")).toContainText("185.00");

    const priceSpan = ladder.rowForSymbol("AAPL").locator(".tabular-nums").nth(3);
    await expect(priceSpan).toHaveClass(/emerald/);
  });

  ladderTest("price going down applies red colour", async ({ ladder, gateway }) => {
    gateway.sendMarketUpdate({ AAPL: 190.0 });
    await expect(ladder.rowForSymbol("AAPL")).toContainText("190.00");
    gateway.sendMarketUpdate({ AAPL: 185.0 });
    await expect(ladder.rowForSymbol("AAPL")).toContainText("185.00");

    const priceSpan = ladder.rowForSymbol("AAPL").locator(".tabular-nums").nth(3);
    await expect(priceSpan).toHaveClass(/red/);
  });

  ladderTest("multiple symbols update independently", async ({ ladder, gateway }) => {
    await ladder.waitForSymbol("MSFT");
    gateway.sendMarketUpdate({ AAPL: 189.5, MSFT: 421.0 });

    await expect(ladder.rowForSymbol("MSFT")).toContainText("421.00");
    await expect(ladder.rowForSymbol("AAPL")).toContainText("189.50");
  });
});

ladderTest.describe("Market Ladder, symbol selection", () => {
  ladderTest("clicking marks symbol as selected", async ({ ladder }) => {
    await ladder.selectSymbol("MSFT");
    await expect(ladder.rowForSymbol("MSFT")).toHaveAttribute("aria-pressed", "true", {
      timeout: 3_000,
    });
  });

  ladderTest("clicking again deselects", async ({ ladder }) => {
    await ladder.selectSymbol("MSFT");
    await expect(ladder.rowForSymbol("MSFT")).toHaveAttribute("aria-pressed", "true", {
      timeout: 3_000,
    });

    await ladder.selectSymbol("MSFT");
    await expect(ladder.rowForSymbol("MSFT")).toHaveAttribute("aria-pressed", "false", {
      timeout: 3_000,
    });
  });
});
