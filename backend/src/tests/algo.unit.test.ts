import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from "jsr:@std/assert@0.217";

// ── TWAP slice sizing ─────────────────────────────────────────────────────────

function twapSlices(
  quantity: number,
  durationMs: number,
  intervalMs: number,
): number[] {
  const numSlices = Math.max(1, Math.round(durationMs / intervalMs));
  const baseSliceQty = quantity / numSlices;
  const slices: number[] = [];
  let filled = 0;
  for (let i = 0; i < numSlices && filled < quantity; i++) {
    const remaining = quantity - filled;
    const sliceQty = Math.min(Math.round(baseSliceQty), remaining);
    if (sliceQty <= 0) break;
    slices.push(sliceQty);
    filled += sliceQty;
  }
  return slices;
}

Deno.test("[twap] slices sum to total quantity", () => {
  const slices = twapSlices(100, 30_000, 5_000);
  assertEquals(slices.reduce((a, b) => a + b, 0), 100);
});

Deno.test("[twap] produces correct number of slices", () => {
  assertEquals(twapSlices(60, 30_000, 5_000).length, 6);
  assertEquals(twapSlices(60, 30_000, 10_000).length, 3);
});

Deno.test("[twap] single slice when duration equals interval", () => {
  const slices = twapSlices(50, 5_000, 5_000);
  assertEquals(slices.length, 1);
  assertEquals(slices[0], 50);
});

Deno.test("[twap] minimum one slice when duration shorter than interval", () => {
  const slices = twapSlices(50, 1_000, 5_000);
  assertEquals(slices.length, 1);
  assertEquals(slices[0], 50);
});

Deno.test("[twap] slices are approximately equal (max diff ≤ 1 share)", () => {
  const slices = twapSlices(31, 30_000, 5_000);
  const min = Math.min(...slices);
  const max = Math.max(...slices);
  assert(max - min <= 1, `Slices vary by more than 1: min=${min} max=${max}`);
});

Deno.test("[twap] slices total is within one share of requested quantity", () => {
  for (const qty of [7, 11, 97, 100, 999]) {
    const slices = twapSlices(qty, 30_000, 5_000);
    const total = slices.reduce((a, b) => a + b, 0);
    assert(
      Math.abs(total - qty) <= 1,
      `qty=${qty}: slice total ${total} deviates by more than 1 share`,
    );
  }
});

// ── POV slice sizing ──────────────────────────────────────────────────────────

function povSlice(
  tickVolume: number,
  povRate: number,
  minSlice: number,
  maxSlice: number,
  remaining: number,
): number {
  const raw = Math.round(tickVolume * povRate);
  return Math.max(minSlice, Math.min(maxSlice, Math.min(raw, remaining)));
}

Deno.test("[pov] slice is povRate fraction of tick volume", () => {
  assertEquals(povSlice(1_000, 0.10, 10, 5_000, 9_999), 100);
  assertEquals(povSlice(2_000, 0.05, 10, 5_000, 9_999), 100);
});

Deno.test("[pov] slice never exceeds maxSlice", () => {
  assertEquals(povSlice(100_000, 0.10, 10, 500, 9_999), 500);
});

Deno.test("[pov] slice is at least minSlice when tick volume is tiny", () => {
  assertEquals(povSlice(5, 0.10, 50, 5_000, 9_999), 50);
});

Deno.test("[pov] slice never exceeds remaining quantity", () => {
  assertEquals(povSlice(10_000, 0.10, 10, 5_000, 30), 30);
});

Deno.test("[pov] zero tick volume returns minSlice (clamp behaviour)", () => {
  assertEquals(povSlice(0, 0.10, 10, 5_000, 9_999), 10);
});

// ── VWAP rolling computation ──────────────────────────────────────────────────

interface PriceVolPoint {
  price: number;
  volume: number;
}

function updateHistory(
  buf: PriceVolPoint[],
  price: number,
  volume: number,
  window: number,
): PriceVolPoint[] {
  const next = [...buf, { price, volume }];
  return next.length > window ? next.slice(next.length - window) : next;
}

function rollingVwap(buf: PriceVolPoint[]): number {
  const totalVol = buf.reduce((s, p) => s + p.volume, 0);
  if (totalVol === 0) return 0;
  return buf.reduce((s, p) => s + p.price * p.volume, 0) / totalVol;
}

Deno.test("[vwap] empty history returns 0", () => {
  assertEquals(rollingVwap([]), 0);
});

Deno.test("[vwap] uniform price: vwap equals that price", () => {
  let buf: PriceVolPoint[] = [];
  for (let i = 0; i < 10; i++) buf = updateHistory(buf, 100, 500, 20);
  assertAlmostEquals(rollingVwap(buf), 100, 1e-9);
});

Deno.test("[vwap] high-volume tick dominates vwap", () => {
  let buf: PriceVolPoint[] = [];
  buf = updateHistory(buf, 100, 1, 20);
  buf = updateHistory(buf, 200, 999, 20);
  const vwap = rollingVwap(buf);
  assert(vwap > 190, `vwap ${vwap} should be close to 200 (high-volume price)`);
});

Deno.test("[vwap] window evicts oldest entries", () => {
  let buf: PriceVolPoint[] = [];
  for (let i = 0; i < 5; i++) buf = updateHistory(buf, 50, 1_000, 3);
  buf = updateHistory(buf, 200, 1_000, 3);
  buf = updateHistory(buf, 200, 1_000, 3);
  buf = updateHistory(buf, 200, 1_000, 3);
  assertEquals(buf.length, 3);
  assertAlmostEquals(rollingVwap(buf), 200, 1e-9);
});

Deno.test("[vwap] zero-volume tick does not affect vwap", () => {
  let buf: PriceVolPoint[] = [];
  buf = updateHistory(buf, 100, 1_000, 20);
  buf = updateHistory(buf, 999, 0, 20);
  assertAlmostEquals(rollingVwap(buf), 100, 1e-9);
});

Deno.test("[vwap] vwap is within price range of constituent ticks", () => {
  const prices = [90, 100, 110, 95, 105];
  let buf: PriceVolPoint[] = [];
  for (const p of prices) buf = updateHistory(buf, p, 1_000, 20);
  const vwap = rollingVwap(buf);
  assert(vwap >= 90 && vwap <= 110, `vwap ${vwap} outside [90, 110]`);
});

// ── ICEBERG slice sizing ──────────────────────────────────────────────────────

function icebergNextSlice(totalRemaining: number, visibleQty: number): number {
  return Math.min(visibleQty, totalRemaining);
}

function icebergSlicesNeeded(totalQty: number, visibleQty: number): number {
  return Math.ceil(totalQty / visibleQty);
}

Deno.test("[iceberg] first slice equals visibleQty when total > visible", () => {
  assertEquals(icebergNextSlice(500, 100), 100);
});

Deno.test("[iceberg] last slice is the remainder, not a full visibleQty", () => {
  assertEquals(icebergNextSlice(30, 100), 30);
});

Deno.test("[iceberg] exactly divisible: all slices are full visibleQty", () => {
  const total = 300;
  const visible = 100;
  assertEquals(icebergSlicesNeeded(total, visible), 3);
  let remaining = total;
  const slices: number[] = [];
  while (remaining > 0) {
    const s = icebergNextSlice(remaining, visible);
    slices.push(s);
    remaining -= s;
  }
  assertEquals(slices, [100, 100, 100]);
});

Deno.test("[iceberg] indivisible total produces correct final slice", () => {
  const total = 250;
  const visible = 100;
  assertEquals(icebergSlicesNeeded(total, visible), 3);
  let remaining = total;
  const slices: number[] = [];
  while (remaining > 0) {
    const s = icebergNextSlice(remaining, visible);
    slices.push(s);
    remaining -= s;
  }
  assertEquals(slices, [100, 100, 50]);
  assertEquals(slices.reduce((a, b) => a + b, 0), total);
});

Deno.test("[iceberg] visibleQty=1 produces one slice per share", () => {
  const total = 5;
  const slices: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    const s = icebergNextSlice(remaining, 1);
    slices.push(s);
    remaining -= s;
  }
  assertEquals(slices.length, 5);
  assertEquals(slices.every((s) => s === 1), true);
});

// ── MOMENTUM EMA ──────────────────────────────────────────────────────────────

function nextEma(price: number, prevEma: number, period: number): number {
  const k = 2 / (period + 1);
  return price * k + prevEma * (1 - k);
}

function computeSignalBps(shortEma: number, longEma: number): number {
  if (longEma === 0) return 0;
  return ((shortEma - longEma) / longEma) * 10_000;
}

function trancheSize(totalQty: number, maxTranches: number): number {
  return Math.max(1, Math.ceil(totalQty / maxTranches));
}

Deno.test("[momentum/ema] converges to constant price", () => {
  let ema = 100;
  for (let i = 0; i < 50; i++) ema = nextEma(200, ema, 5);
  assertAlmostEquals(ema, 200, 1);
});

Deno.test("[momentum/ema] k factor: short period reacts faster than long period", () => {
  const fast = nextEma(200, 100, 3);
  const slow = nextEma(200, 100, 20);
  assert(
    fast > slow,
    `fast EMA ${fast} should exceed slow EMA ${slow} after price spike`,
  );
});

Deno.test("[momentum/ema] period=1 collapses to current price", () => {
  assertAlmostEquals(nextEma(150, 100, 1), 150, 1e-9);
});

Deno.test("[momentum/signal] rising price → positive signal bps", () => {
  let shortEma = 100;
  let longEma = 100;
  for (let i = 0; i < 20; i++) {
    const price = 100 + i;
    shortEma = nextEma(price, shortEma, 3);
    longEma = nextEma(price, longEma, 8);
  }
  assert(
    computeSignalBps(shortEma, longEma) > 0,
    "rising price should yield positive signal",
  );
});

Deno.test("[momentum/signal] falling price → negative signal bps", () => {
  let shortEma = 100;
  let longEma = 100;
  for (let i = 0; i < 20; i++) {
    const price = 100 - i;
    shortEma = nextEma(price, shortEma, 3);
    longEma = nextEma(price, longEma, 8);
  }
  assert(
    computeSignalBps(shortEma, longEma) < 0,
    "falling price should yield negative signal",
  );
});

Deno.test("[momentum/signal] flat price → near-zero signal", () => {
  let shortEma = 100;
  let longEma = 100;
  for (let i = 0; i < 20; i++) {
    shortEma = nextEma(100, shortEma, 3);
    longEma = nextEma(100, longEma, 8);
  }
  assert(
    Math.abs(computeSignalBps(shortEma, longEma)) < 0.01,
    "flat price should yield ~0 signal",
  );
});

Deno.test("[momentum/tranche] tranche size divides quantity into maxTranches", () => {
  assertEquals(trancheSize(100, 5), 20);
  assertEquals(trancheSize(101, 5), 21);
  assertEquals(trancheSize(1, 10), 1);
});

Deno.test("[momentum/tranche] total covered by maxTranches tranches ≥ totalQty", () => {
  for (const [qty, max] of [[100, 4], [77, 5], [1, 3], [500, 7]]) {
    const ts = trancheSize(qty, max);
    assert(
      ts * max >= qty,
      `trancheSize=${ts} × maxTranches=${max} < totalQty=${qty}`,
    );
  }
});

// ── IS (Implementation Shortfall) slice schedule ──────────────────────────────

function buildSliceSchedule(
  totalQty: number,
  urgency: number,
  minSlices: number,
  maxSlices: number,
  durationMs: number,
): { sliceQtys: number[]; numSlices: number; sliceIntervalMs: number } {
  const u = Math.max(0.01, Math.min(0.99, urgency));
  const numSlices = Math.round(minSlices + (1 - u) * (maxSlices - minSlices));

  const rawWeights: number[] = [];
  for (let i = 0; i < numSlices; i++) {
    rawWeights.push(u * Math.pow(1 - u, i));
  }
  const weightSum = rawWeights.reduce((a, b) => a + b, 0);

  const sliceQtys: number[] = new Array(numSlices + 1).fill(0);
  let allocated = 0;
  for (let i = 0; i < numSlices; i++) {
    const qty = Math.floor((rawWeights[i] / weightSum) * totalQty);
    sliceQtys[i + 1] = qty;
    allocated += qty;
  }
  sliceQtys[1] += totalQty - allocated;

  const sliceIntervalMs = numSlices > 0 ? durationMs / numSlices : durationMs;
  return { sliceQtys: sliceQtys.slice(1), numSlices, sliceIntervalMs };
}

Deno.test("[is] slice quantities sum to totalQty", () => {
  for (const urgency of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const { sliceQtys } = buildSliceSchedule(100, urgency, 2, 10, 60_000);
    assertEquals(
      sliceQtys.reduce((a, b) => a + b, 0),
      100,
      `urgency=${urgency} — qty mismatch`,
    );
  }
});

Deno.test("[is] high urgency: first slice is larger than last slice", () => {
  const { sliceQtys } = buildSliceSchedule(100, 0.9, 2, 10, 60_000);
  assert(
    sliceQtys[0] >= sliceQtys[sliceQtys.length - 1],
    `high urgency should front-load: first=${sliceQtys[0]} last=${
      sliceQtys[sliceQtys.length - 1]
    }`,
  );
});

Deno.test("[is] low urgency: schedule more evenly distributed than high urgency", () => {
  const high = buildSliceSchedule(100, 0.9, 2, 10, 60_000);
  const low = buildSliceSchedule(100, 0.1, 2, 10, 60_000);
  const highSkew = high.sliceQtys[0] -
    high.sliceQtys[high.sliceQtys.length - 1];
  const lowSkew = low.sliceQtys[0] - low.sliceQtys[low.sliceQtys.length - 1];
  assert(
    highSkew >= lowSkew,
    `high urgency skew ${highSkew} should exceed low urgency skew ${lowSkew}`,
  );
});

Deno.test("[is] numSlices is within [minSlices, maxSlices]", () => {
  for (const urgency of [0.01, 0.5, 0.99]) {
    const { numSlices } = buildSliceSchedule(100, urgency, 3, 12, 60_000);
    assert(
      numSlices >= 3 && numSlices <= 12,
      `numSlices ${numSlices} outside [3, 12] for urgency=${urgency}`,
    );
  }
});

Deno.test("[is] urgency clamped: 0 and 1 do not crash and still sum correctly", () => {
  for (const urgency of [0, 1, -0.5, 1.5]) {
    const { sliceQtys } = buildSliceSchedule(50, urgency, 2, 8, 30_000);
    assertEquals(
      sliceQtys.reduce((a, b) => a + b, 0),
      50,
      `urgency=${urgency} — qty mismatch`,
    );
  }
});

Deno.test("[is] sliceIntervalMs = durationMs / numSlices", () => {
  const duration = 60_000;
  const { sliceIntervalMs, numSlices } = buildSliceSchedule(
    100,
    0.5,
    2,
    10,
    duration,
  );
  assertAlmostEquals(sliceIntervalMs, duration / numSlices, 1e-9);
});

Deno.test("[is] all slice quantities are non-negative", () => {
  const { sliceQtys } = buildSliceSchedule(100, 0.7, 2, 10, 60_000);
  assert(sliceQtys.every((q) => q >= 0), `negative slice found: ${sliceQtys}`);
});

// ── Arrival price slippage check ──────────────────────────────────────────────

function slippageBps(
  arrivalPrice: number,
  currentPrice: number,
  side: "BUY" | "SELL",
): number {
  if (arrivalPrice === 0) return 0;
  const drift = (currentPrice - arrivalPrice) / arrivalPrice * 10_000;
  return side === "BUY" ? drift : -drift;
}

Deno.test("[arrival-price] BUY: price rising above arrival is adverse (positive bps)", () => {
  assert(slippageBps(100, 101, "BUY") > 0);
});

Deno.test("[arrival-price] BUY: price falling below arrival is favourable (negative bps)", () => {
  assert(slippageBps(100, 99, "BUY") < 0);
});

Deno.test("[arrival-price] SELL: price falling is adverse (positive bps)", () => {
  assert(slippageBps(100, 99, "SELL") > 0);
});

Deno.test("[arrival-price] SELL: price rising is favourable (negative bps)", () => {
  assert(slippageBps(100, 101, "SELL") < 0);
});

Deno.test("[arrival-price] zero slippage when price equals arrival", () => {
  assertEquals(slippageBps(100, 100, "BUY"), 0);
  assertEquals(slippageBps(100, 100, "SELL"), 0);
});

Deno.test("[arrival-price] slippage magnitude: 1% move = 100 bps", () => {
  assertAlmostEquals(Math.abs(slippageBps(100, 101, "BUY")), 100, 1e-6);
});
