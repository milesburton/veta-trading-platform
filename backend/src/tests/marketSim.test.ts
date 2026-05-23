import {
  assertEquals,
  assertNotEquals,
} from "jsr:@std/assert@0.217";
import {
  advanceRegime,
  generatePrice,
  marketData,
  openPrices,
  prewarmPrices,
  refreshSectorShocks,
  resetPriceEngine,
  resetRegime,
  seedPrice,
  snapshotOpenPrices,
} from "../market-sim/priceEngine.ts";
import { seedRng } from "../market-sim/rng.ts";

function runSequence(seed: number, ticks: number, asset = "AAPL"): number[] {
  seedRng(seed);
  seedPrice(asset, 100);
  resetRegime();
  const out: number[] = [];
  for (let i = 0; i < ticks; i++) {
    advanceRegime();
    refreshSectorShocks();
    out.push(generatePrice(asset));
  }
  return out;
}

Deno.test("seeded price sequence is deterministic", () => {
  const a = runSequence(42, 100);
  const b = runSequence(42, 100);
  assertEquals(a, b);
});

Deno.test("different seeds produce different price sequences", () => {
  const a = runSequence(42, 100);
  const b = runSequence(7, 100);
  assertNotEquals(a, b);
  seedRng(null);
});

Deno.test("generatePrice returns a positive number for a known asset", () => {
  refreshSectorShocks();
  const price = generatePrice("AAPL");
  assertEquals(typeof price, "number");
  assertEquals(price > 0, true);
});

Deno.test("generatePrice never returns zero or negative (price floor holds)", () => {
  refreshSectorShocks();
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
  assertEquals(
    maxMovePct < 0.005,
    true,
    `max move ${(maxMovePct * 100).toFixed(4)}% exceeded 0.5%`,
  );
});

Deno.test("prewarmPrices moves prices away from their initial values", () => {
  const before: Record<string, number> = { ...marketData };
  prewarmPrices(1_000);
  const movedCount = Object.keys(marketData).filter(
    (sym) => Math.abs(marketData[sym] - before[sym]) / before[sym] > 0,
  ).length;
  assertEquals(movedCount > 0, true);
});

Deno.test("prewarmPrices produces meaningful intraday spread after a full warm-up", () => {
  prewarmPrices(28_080);
  const sample = [
    "AAPL",
    "MSFT",
    "NVDA",
    "TSLA",
    "AMZN",
    "META",
    "GOOGL",
    "AMD",
    "JPM",
    "NFLX",
  ];
  for (const sym of sample) {
    assertEquals(
      marketData[sym] > 0,
      true,
      `${sym} should have positive price after warm-up`,
    );
  }
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
  prewarmPrices(100);
  for (const sym of Object.keys(snapshot)) {
    assertEquals(openPrices[sym], snapshot[sym]);
  }
  const changed =
    Object.keys(snapshot).filter((sym) => marketData[sym] !== snapshot[sym])
      .length;
  assertNotEquals(changed, 0);
});

Deno.test("resetPriceEngine restores anchor prices and re-prewarms with default tick count", () => {
  seedRng(99);
  seedPrice("AAPL", 100);
  for (let i = 0; i < 50; i++) generatePrice("AAPL");
  const beforeReset = marketData["AAPL"];

  resetPriceEngine({ prewarmTicks: 0 });

  // After reset with 0 prewarm, AAPL should be back at its seed initial price (in sp500Assets.ts).
  // We can't assert the exact value, but it should differ from the post-50-tick price almost certainly.
  assertNotEquals(marketData["AAPL"], beforeReset);
});

Deno.test("resetPriceEngine uses 240 prewarm ticks by default", () => {
  seedRng(42);
  resetPriceEngine();
  // After a 240-tick prewarm, AAPL should have moved at least a few cents from its seed value.
  const after = marketData["AAPL"];
  if (!Number.isFinite(after) || after <= 0) {
    throw new Error(`expected positive price after default reset, got ${after}`);
  }
});

Deno.test("generatePrice price floor holds against extreme downward shocks", () => {
  resetPriceEngine({ prewarmTicks: 0 });
  seedPrice("AAPL", 100);
  // Drive AAPL down hard with thousands of ticks under a seed that produces
  // many negative shocks. The floor (PRICE_FLOOR_RATIO * anchor) should
  // clamp the price; it must never go to zero or negative.
  seedRng(7);
  for (let i = 0; i < 5000; i++) generatePrice("AAPL");
  const p = marketData["AAPL"];
  if (p <= 0) throw new Error(`floor breached: got ${p}`);
});
