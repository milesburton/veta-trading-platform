import {
  assert,
  assertEquals,
  assertAlmostEquals,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";

// Pure logic extracted from ems-server.ts for unit testing.
// The EMS service itself requires Redpanda; these tests cover the fill model math.

const VENUES = [
  { mic: "XNAS", weight: 30 }, { mic: "XNYS", weight: 25 }, { mic: "ARCX", weight: 15 },
  { mic: "BATS", weight: 12 }, { mic: "EDGX", weight: 8  }, { mic: "IEX",  weight: 6  },
  { mic: "MEMX", weight: 4  },
] as const;
type VenueMIC = (typeof VENUES)[number]["mic"];

const VENUE_SPREAD_MULT: Record<string, number> = {
  XNAS: 1.00, ARCX: 1.08, BATS: 0.95,
  EDGX: 0.98, IEX:  1.02, MEMX: 0.97, XNYS: 1.05,
};
const VENUE_DEPTH_MULT: Record<string, number> = {
  XNAS: 1.00, ARCX: 0.85, BATS: 0.90,
  EDGX: 0.75, IEX:  0.95, MEMX: 0.65, XNYS: 1.20,
};

const PARTICIPATION_CAP = 0.20;
const IMPACT_PER_1000 = 1.0;
const COMMISSION_PER_SHARE = 0.005;
const SEC_FEE_RATE = 0.000008;
const FINRA_TAF_PER_SHARE = 0.000119;

function computeFill(
  qty: number,
  tickVolume: number,
  venue: VenueMIC,
): { filledQty: number; remainingQty: number } {
  const depthMult = VENUE_DEPTH_MULT[venue] ?? 1.0;
  const maxFill = Math.floor(tickVolume * PARTICIPATION_CAP * depthMult);
  const filledQty = Math.min(qty, maxFill);
  return { filledQty, remainingQty: qty - filledQty };
}

function computeImpact(filledQty: number, venue: VenueMIC, side: "BUY" | "SELL", midPrice: number): number {
  const spreadMult = VENUE_SPREAD_MULT[venue] ?? 1.0;
  const impactBps = (filledQty / 1_000) * IMPACT_PER_1000 * spreadMult;
  const impactFactor = side === "BUY" ? 1 + impactBps / 10_000 : 1 - impactBps / 10_000;
  return parseFloat((midPrice * impactFactor).toFixed(4));
}

function computeFees(
  filledQty: number,
  avgFillPrice: number,
  side: "BUY" | "SELL",
  liquidityFlag: "MAKER" | "TAKER" | "CROSS",
): { commissionUSD: number; secFeeUSD: number; finraTafUSD: number; totalFeeUSD: number } {
  const commissionPerShare = liquidityFlag === "MAKER" ? -0.002 : COMMISSION_PER_SHARE;
  const commissionUSD = parseFloat((filledQty * commissionPerShare).toFixed(2));
  const notional = filledQty * avgFillPrice;
  const secFeeUSD  = side === "SELL" ? parseFloat((notional * SEC_FEE_RATE).toFixed(4)) : 0;
  const finraTafUSD = side === "SELL"
    ? parseFloat(Math.min(filledQty * FINRA_TAF_PER_SHARE, 5.95).toFixed(4))
    : 0;
  const totalFeeUSD = parseFloat((commissionUSD + secFeeUSD + finraTafUSD).toFixed(4));
  return { commissionUSD, secFeeUSD, finraTafUSD, totalFeeUSD };
}

function pickWeightedVenue(rand: number): VenueMIC {
  const total = VENUES.reduce((s, v) => s + v.weight, 0);
  let cumulativeWeight = rand * total;
  for (const v of VENUES) { cumulativeWeight -= v.weight; if (cumulativeWeight <= 0) return v.mic; }
  return VENUES[0].mic;
}

// ── Venue fill capacity ───────────────────────────────────────────────────────

Deno.test("[ems/fill] filled qty capped at participation cap × tick volume", () => {
  const { filledQty } = computeFill(10_000, 1_000, "XNAS");
  assertEquals(filledQty, Math.floor(1_000 * PARTICIPATION_CAP * VENUE_DEPTH_MULT["XNAS"]));
});

Deno.test("[ems/fill] filled qty never exceeds requested qty", () => {
  const { filledQty } = computeFill(5, 1_000_000, "XNAS");
  assertEquals(filledQty, 5);
});

Deno.test("[ems/fill] remaining qty is requested minus filled", () => {
  const qty = 200;
  const { filledQty, remainingQty } = computeFill(qty, 500, "XNAS");
  assertEquals(filledQty + remainingQty, qty);
});

Deno.test("[ems/fill] MEMX (depth=0.65) fills less than XNYS (depth=1.20) at same volume", () => {
  const vol = 1_000;
  const { filledQty: memx } = computeFill(10_000, vol, "MEMX");
  const { filledQty: xnys } = computeFill(10_000, vol, "XNYS");
  assert(xnys > memx, `XNYS (depth 1.20) should fill more than MEMX (depth 0.65)`);
});

Deno.test("[ems/fill] zero tick volume → zero fill", () => {
  const { filledQty } = computeFill(500, 0, "XNAS");
  assertEquals(filledQty, 0);
});

// ── Market impact ─────────────────────────────────────────────────────────────

Deno.test("[ems/impact] BUY impact moves price above mid", () => {
  const fill = computeImpact(1_000, "XNAS", "BUY", 100);
  assert(fill > 100, `BUY fill price ${fill} should exceed mid 100`);
});

Deno.test("[ems/impact] SELL impact moves price below mid", () => {
  const fill = computeImpact(1_000, "XNAS", "SELL", 100);
  assert(fill < 100, `SELL fill price ${fill} should be below mid 100`);
});

Deno.test("[ems/impact] small qty (1 share) has negligible impact", () => {
  const fill = computeImpact(1, "XNAS", "BUY", 100);
  assertAlmostEquals(fill, 100, 0.001);
});

Deno.test("[ems/impact] ARCX (spread=1.08) has greater impact than BATS (spread=0.95)", () => {
  const arcx = computeImpact(500, "ARCX", "BUY", 100);
  const bats = computeImpact(500, "BATS", "BUY", 100);
  assert(arcx > bats, `ARCX impact price ${arcx} should exceed BATS ${bats}`);
});

Deno.test("[ems/impact] impact is proportional to qty (2× qty ≈ 2× impact bps)", () => {
  const mid = 100;
  const p1 = computeImpact(500, "XNAS", "BUY", mid);
  const p2 = computeImpact(1_000, "XNAS", "BUY", mid);
  const bps1 = (p1 - mid) / mid * 10_000;
  const bps2 = (p2 - mid) / mid * 10_000;
  assertAlmostEquals(bps2 / bps1, 2, 0.01);
});

// ── Fee calculation ───────────────────────────────────────────────────────────

Deno.test("[ems/fees] BUY order: SEC fee and FINRA TAF are zero", () => {
  const fees = computeFees(100, 150, "BUY", "TAKER");
  assertEquals(fees.secFeeUSD, 0);
  assertEquals(fees.finraTafUSD, 0);
});

Deno.test("[ems/fees] SELL order: SEC fee applied on notional", () => {
  const qty = 100;
  const price = 150;
  const fees = computeFees(qty, price, "SELL", "TAKER");
  assertAlmostEquals(fees.secFeeUSD, qty * price * SEC_FEE_RATE, 1e-6);
});

Deno.test("[ems/fees] SELL order: FINRA TAF applied per share", () => {
  const qty = 100;
  const fees = computeFees(qty, 150, "SELL", "TAKER");
  const expected = Math.min(qty * FINRA_TAF_PER_SHARE, 5.95);
  assertAlmostEquals(fees.finraTafUSD, expected, 1e-4);
});

Deno.test("[ems/fees] FINRA TAF capped at $5.95 for very large fills", () => {
  const fees = computeFees(1_000_000, 100, "SELL", "TAKER");
  assertEquals(fees.finraTafUSD, 5.95);
});

Deno.test("[ems/fees] MAKER liquidity flag earns rebate (negative commission)", () => {
  const fees = computeFees(100, 150, "BUY", "MAKER");
  assert(fees.commissionUSD < 0, `MAKER should earn rebate, got ${fees.commissionUSD}`);
});

Deno.test("[ems/fees] TAKER commission is positive", () => {
  const fees = computeFees(100, 150, "BUY", "TAKER");
  assert(fees.commissionUSD > 0, `TAKER commission should be positive`);
});

Deno.test("[ems/fees] totalFeeUSD equals sum of components", () => {
  const fees = computeFees(200, 100, "SELL", "TAKER");
  assertAlmostEquals(
    fees.totalFeeUSD,
    fees.commissionUSD + fees.secFeeUSD + fees.finraTafUSD,
    1e-4,
  );
});

// ── Weighted venue selection ──────────────────────────────────────────────────

Deno.test("[ems/venue] all valid MICs can be selected", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1_000; i++) {
    seen.add(pickWeightedVenue(Math.random()));
  }
  for (const v of VENUES) {
    assert(seen.has(v.mic), `Venue ${v.mic} was never selected in 1000 draws`);
  }
});

Deno.test("[ems/venue] XNAS selected more often than MEMX (30 vs 4 weight)", () => {
  let xnas = 0, memx = 0;
  const N = 10_000;
  for (let i = 0; i < N; i++) {
    const v = pickWeightedVenue(Math.random());
    if (v === "XNAS") xnas++;
    if (v === "MEMX") memx++;
  }
  assert(xnas > memx * 3, `XNAS (${xnas}) should be selected far more than MEMX (${memx})`);
});

Deno.test("[ems/venue] deterministic at boundary: rand=0 selects first venue after weight depletion", () => {
  const v = pickWeightedVenue(0);
  assertEquals(v, "XNAS");
});

// ── exec ID sequencing ────────────────────────────────────────────────────────

function execId(seq: number): string {
  return `EX${String(seq).padStart(8, "0")}`;
}

Deno.test("[ems/execId] format is EX followed by 8 zero-padded digits", () => {
  assertEquals(execId(1), "EX00000001");
  assertEquals(execId(99999999), "EX99999999");
});

Deno.test("[ems/execId] sequential IDs are unique and increasing", () => {
  const ids = [1, 2, 3, 100, 999].map(execId);
  const unique = new Set(ids);
  assertEquals(unique.size, ids.length);
  for (let i = 1; i < ids.length; i++) {
    assert(ids[i] > ids[i - 1], `${ids[i]} should sort after ${ids[i - 1]}`);
  }
});
