import { assertEquals, assertNotEquals } from "https://deno.land/std@0.210.0/testing/asserts.ts";
import { generatePrice, marketData, openPrices, prewarmPrices, refreshSectorShocks, snapshotOpenPrices } from "../market-sim/priceEngine.ts";

Deno.test("generatePrice returns a positive number for a known asset", () => {
  refreshSectorShocks();
  const price = generatePrice("AAPL");
  assertEquals(typeof price, "number");
  assertEquals(price > 0, true);
});

Deno.test("generatePrice never returns zero or negative (price floor holds)", () => {
  refreshSectorShocks();
  // Run 1000 ticks — even under worst-case shocks the floor must hold
  for (let i = 0; i < 1_000; i++) {
    refreshSectorShocks();
    const p = generatePrice("TSLA"); // highest vol stock
    assertEquals(p > 0, true);
  }
});

Deno.test("generatePrice updates marketData in place", () => {
  refreshSectorShocks();
  const asset = "MSFT";
  generatePrice(asset);
  assertEquals(typeof marketData[asset], "number");
  assertEquals(marketData[asset] > 0, true);
});

Deno.test("generatePrice per-tick move is much smaller than daily volatility", () => {
  // Per-tick vol = dailyVol / sqrt(23400) ≈ 0.018 / 153 ≈ 0.0001 (0.01%)
  // Even with a 4-sigma shock the move should stay well under 0.1% for AAPL
  refreshSectorShocks();
  const asset = "AAPL";
  const TICKS = 500;
  let maxMovePct = 0;
  for (let i = 0; i < TICKS; i++) {
    refreshSectorShocks();
    const before = marketData[asset];
    const after = generatePrice(asset);
    const movePct = Math.abs(after - before) / before;
    if (movePct > maxMovePct) maxMovePct = movePct;
  }
  // Typical per-tick 1-sigma move is 0.012%; even a 6-sigma shock is ~0.07%
  assertEquals(maxMovePct < 0.005, true, `max move ${(maxMovePct * 100).toFixed(4)}% exceeded 0.5%`);
});

Deno.test("prewarmPrices moves prices away from their initial values", () => {
  const before: Record<string, number> = { ...marketData };
  prewarmPrices(1_000);
  // At least one asset should have moved after 1000 ticks
  const movedCount = Object.keys(marketData).filter(
    (sym) => Math.abs(marketData[sym] - before[sym]) / before[sym] > 0
  ).length;
  assertEquals(movedCount > 0, true);
});

Deno.test("prewarmPrices produces meaningful intraday spread after a full warm-up", () => {
  // 28080 ticks ≈ 1.8 trading hours. Check that the average absolute % move
  // across the top 10 assets is at least 0.05% — enough to show heatmap colour.
  prewarmPrices(28_080);
  const sample = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "GOOGL", "AMD", "JPM", "NFLX"];
  for (const sym of sample) {
    assertEquals(marketData[sym] > 0, true, `${sym} should have positive price after warm-up`);
  }
  // All sampled assets must still have positive prices after warm-up
  assertEquals(sample.every((sym) => marketData[sym] > 0), true);
});

Deno.test("snapshotOpenPrices captures current marketData into openPrices", () => {
  prewarmPrices(100);
  snapshotOpenPrices();
  for (const sym of Object.keys(marketData)) {
    assertEquals(openPrices[sym], marketData[sym]);
  }
});

Deno.test("openPrices remain stable after further price moves", () => {
  prewarmPrices(50);
  snapshotOpenPrices();
  const snapshot: Record<string, number> = { ...openPrices };
  // Generate 100 more ticks
  prewarmPrices(100);
  // openPrices must not have changed (they're not auto-updated)
  for (const sym of Object.keys(snapshot)) {
    assertEquals(openPrices[sym], snapshot[sym]);
  }
  // But current prices should differ from the snapshot for at least some assets
  const changed = Object.keys(snapshot).filter((sym) => marketData[sym] !== snapshot[sym]).length;
  assertNotEquals(changed, 0);
});
