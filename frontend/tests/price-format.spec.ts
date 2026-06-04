import { expect } from "@playwright/test";
import { traderTest } from "./helpers/fixtures.ts";

const TWO_DECIMAL = /^-?\d{1,7}\.\d{2}$/;

traderTest.describe("Price formatting", () => {
  traderTest(
    "Market Ladder renders equity prices with exactly 2 decimals",
    async ({ app, gateway }) => {
      const ladder = await app.getMarketLadder();
      await ladder.waitForSymbol("AAPL");

      gateway.sendMarketUpdate({ AAPL: 185, MSFT: 412.3, GOOGL: 176.5, NVDA: 889, AMZN: 228 });
      await app.page.waitForTimeout(500);

      for (const symbol of ["AAPL", "MSFT", "GOOGL", "NVDA", "AMZN"]) {
        const text = (await ladder.getPriceText(symbol)).trim();
        expect(text, `${symbol} price "${text}" must match XXX.XX`).toMatch(TWO_DECIMAL);
      }
    }
  );

  traderTest("Market Ladder shows trailing zeros (no rounding-off)", async ({ app, gateway }) => {
    const ladder = await app.getMarketLadder();
    await ladder.waitForSymbol("AAPL");

    gateway.sendMarketUpdate({ AAPL: 100 });
    await app.page.waitForTimeout(200);

    const text = (await ladder.getPriceText("AAPL")).trim();
    expect(text).toMatch(TWO_DECIMAL);
    expect(text.split(".")[1]).toHaveLength(2);
  });
});
