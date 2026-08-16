import { assertEquals } from "jsr:@std/assert@0.217";
import {
  computeInitialMargin,
  computeMarginCall,
  computeMarginRelease,
  type MarginAccount,
  updatePosition,
} from "../ccp/margin-math.ts";

function emptyAccount(overrides: Partial<MarginAccount> = {}): MarginAccount {
  return {
    userId: "u1",
    initialMarginPosted: 0,
    unrealisedPnl: 0,
    netMarginRequired: 0,
    positions: {},
    costBasis: {},
    lastUpdated: 0,
    ...overrides,
  };
}

// ── updatePosition ──────────────────────────────────────────────────────────

Deno.test("[margin-math] opening a long position sets qty and cost basis", () => {
  const acct = emptyAccount();
  updatePosition(acct, "AAPL", "BUY", 100, 190);
  assertEquals(acct.positions.AAPL, 100);
  assertEquals(acct.costBasis.AAPL, 190);
});

Deno.test("[margin-math] opening a short position sets negative qty and the trade price as cost basis", () => {
  const acct = emptyAccount();
  updatePosition(acct, "AAPL", "SELL", 100, 190);
  assertEquals(acct.positions.AAPL, -100);
  assertEquals(acct.costBasis.AAPL, 190);
});

Deno.test("[margin-math] adding to an existing long recomputes a weighted-average cost basis", () => {
  const acct = emptyAccount({ positions: { AAPL: 100 }, costBasis: { AAPL: 190 } });
  updatePosition(acct, "AAPL", "BUY", 100, 210);
  assertEquals(acct.positions.AAPL, 200);
  // (100*190 + 100*210) / 200 = 200
  assertEquals(acct.costBasis.AAPL, 200);
});

Deno.test("[margin-math] adding to an existing short recomputes a weighted-average cost basis", () => {
  const acct = emptyAccount({ positions: { AAPL: -100 }, costBasis: { AAPL: 190 } });
  updatePosition(acct, "AAPL", "SELL", 100, 210);
  assertEquals(acct.positions.AAPL, -200);
  // (100*190 + 100*210) / 200 = 200 — symmetric with the long case
  assertEquals(acct.costBasis.AAPL, 200);
});

Deno.test("[margin-math] reducing a long position updates qty but leaves cost basis untouched", () => {
  const acct = emptyAccount({ positions: { AAPL: 100 }, costBasis: { AAPL: 190 } });
  updatePosition(acct, "AAPL", "SELL", 40, 250);
  assertEquals(acct.positions.AAPL, 60);
  assertEquals(acct.costBasis.AAPL, 190, "reducing a position must not touch cost basis");
});

Deno.test("[margin-math] reducing a short position updates qty but leaves cost basis untouched", () => {
  const acct = emptyAccount({ positions: { AAPL: -100 }, costBasis: { AAPL: 190 } });
  updatePosition(acct, "AAPL", "BUY", 40, 250);
  assertEquals(acct.positions.AAPL, -60);
  assertEquals(acct.costBasis.AAPL, 190, "reducing a position must not touch cost basis");
});

Deno.test("[margin-math] flattening a long to within the dust threshold clears it", () => {
  const acct = emptyAccount({ positions: { AAPL: 100 }, costBasis: { AAPL: 190 } });
  updatePosition(acct, "AAPL", "SELL", 100, 250);
  assertEquals(acct.positions.AAPL, undefined);
  assertEquals(acct.costBasis.AAPL, undefined);
});

Deno.test("[margin-math] flattening a short to within the dust threshold clears it", () => {
  const acct = emptyAccount({ positions: { AAPL: -100 }, costBasis: { AAPL: 190 } });
  updatePosition(acct, "AAPL", "BUY", 100, 250);
  assertEquals(acct.positions.AAPL, undefined);
  assertEquals(acct.costBasis.AAPL, undefined);
});

Deno.test("[margin-math] flipping from long to short re-seeds cost basis at the trade price", () => {
  const acct = emptyAccount({ positions: { AAPL: 100 }, costBasis: { AAPL: 190 } });
  updatePosition(acct, "AAPL", "SELL", 150, 250);
  assertEquals(acct.positions.AAPL, -50);
  assertEquals(
    acct.costBasis.AAPL,
    250,
    "flipping through zero must re-seed cost basis — the old long's basis doesn't apply to the new short"
  );
});

Deno.test("[margin-math] flipping from short to long re-seeds cost basis at the trade price", () => {
  const acct = emptyAccount({ positions: { AAPL: -100 }, costBasis: { AAPL: 190 } });
  updatePosition(acct, "AAPL", "BUY", 150, 250);
  assertEquals(acct.positions.AAPL, 50);
  assertEquals(acct.costBasis.AAPL, 250);
});

// ── computeInitialMargin / computeMarginRelease ─────────────────────────────

Deno.test("[margin-math] initial margin uses the desk-specific rate", () => {
  assertEquals(computeInitialMargin("equity", 100_000), 10_000);
  assertEquals(computeInitialMargin("fi", 100_000), 2_000);
  assertEquals(computeInitialMargin("derivatives", 100_000), 15_000);
  assertEquals(computeInitialMargin("otc", 100_000), 5_000);
});

Deno.test("[margin-math] an unknown desk falls back to the equity rate", () => {
  assertEquals(computeInitialMargin("unknown-desk", 100_000), 10_000);
});

Deno.test("[margin-math] initial margin rounds to two decimal places", () => {
  assertEquals(computeInitialMargin("fi", 333.335), 6.67);
});

Deno.test("[margin-math] margin release matches initial margin for the same desk/notional", () => {
  assertEquals(computeMarginRelease("derivatives", 50_000), computeInitialMargin("derivatives", 50_000));
});

// ── computeMarginCall ────────────────────────────────────────────────────────

Deno.test("[margin-math] no margin posted yet never triggers a call, even if nominally underwater", () => {
  const acct = emptyAccount({
    positions: { AAPL: 100 },
    costBasis: { AAPL: 500 },
    initialMarginPosted: 0,
    netMarginRequired: 10_000,
  });
  const result = computeMarginCall(acct, { AAPL: 100 });
  assertEquals(result.variationCall, null);
});

Deno.test("[margin-math] effective margin above maintenance triggers no call", () => {
  const acct = emptyAccount({
    positions: { AAPL: 100 },
    costBasis: { AAPL: 190 },
    initialMarginPosted: 10_000,
    netMarginRequired: 10_000,
  });
  // small gain, well above the 70% maintenance threshold of 7000
  const result = computeMarginCall(acct, { AAPL: 195 });
  assertEquals(result.variationCall, null);
});

Deno.test("[margin-math] a genuine shortfall below maintenance produces a positive variation call", () => {
  const acct = emptyAccount({
    positions: { AAPL: 100 },
    costBasis: { AAPL: 190 },
    initialMarginPosted: 10_000,
    netMarginRequired: 10_000,
  });
  // loss of 100 * (150 - 190) = -4000; effective margin = 10000 - 4000 = 6000 < maintenance 7000
  const result = computeMarginCall(acct, { AAPL: 150 });
  assertEquals(result.unrealisedPnl, -4_000);
  assertEquals(result.maintenanceRequired, 7_000);
  assertEquals(result.effectiveMargin, 6_000);
  assertEquals(result.variationCall, 4_000);
});

Deno.test("[margin-math] maintenance threshold is 100% of net margin when the account is flat", () => {
  const acct = emptyAccount({
    positions: {},
    costBasis: {},
    initialMarginPosted: 10_000,
    netMarginRequired: 10_000,
  });
  const result = computeMarginCall(acct, {});
  assertEquals(result.maintenanceRequired, 10_000);
});

Deno.test("[margin-math] a missing price for a held asset is skipped, not treated as zero", () => {
  const acct = emptyAccount({
    positions: { AAPL: 100 },
    costBasis: { AAPL: 190 },
    initialMarginPosted: 10_000,
    netMarginRequired: 10_000,
  });
  const result = computeMarginCall(acct, {});
  assertEquals(result.unrealisedPnl, 0);
  assertEquals(result.variationCall, null);
});

Deno.test("[margin-math] dust-sized positions are excluded from unrealised P&L", () => {
  const acct = emptyAccount({
    positions: { AAPL: 0.00001 },
    costBasis: { AAPL: 190 },
    initialMarginPosted: 10_000,
    netMarginRequired: 10_000,
  });
  const result = computeMarginCall(acct, { AAPL: 500 });
  assertEquals(result.unrealisedPnl, 0);
});

Deno.test("[margin-math] a computed shortfall of exactly zero does not count as a call", () => {
  const acct = emptyAccount({
    positions: { AAPL: 100 },
    costBasis: { AAPL: 190 },
    initialMarginPosted: 7_000,
    netMarginRequired: 7_000,
  });
  // effectiveMargin = 7000 + 0 = 7000; maintenanceRequired = 7000 * 0.7 = 4900
  // effectiveMargin (7000) is NOT < maintenanceRequired (4900), so no call regardless
  const result = computeMarginCall(acct, { AAPL: 190 });
  assertEquals(result.variationCall, null);
});
