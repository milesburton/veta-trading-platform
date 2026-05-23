import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertGreater,
  assertLess,
} from "jsr:@std/assert@0.217";
import {
  _resetFredCacheForTests,
  buildYieldCurveResponse,
  computeYieldCurve,
  fetchFredParams,
  forwardRates,
  rateAt,
} from "../analytics/yield-curve.ts";
import type { NelsonSiegelParams, YieldCurvePoint } from "../analytics/types.ts";

const realFetch = globalThis.fetch;

interface SeriesMap {
  [seriesId: string]: { status?: number; body?: string; throw?: boolean };
}

function mockFred(map: SeriesMap): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  globalThis.fetch = ((url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    const match = u.match(/series_id=([A-Z0-9]+)/);
    const id = match?.[1] ?? "";
    const entry = map[id];
    if (!entry) return Promise.resolve(new Response("not found", { status: 404 }));
    if (entry.throw) return Promise.reject(new Error("network down"));
    if (entry.status && entry.status !== 200) {
      return Promise.resolve(new Response("err", { status: entry.status }));
    }
    return Promise.resolve(
      new Response(entry.body ?? "{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

function resetFredCache(): Promise<void> {
  _resetFredCacheForTests();
  return Promise.resolve();
}

Deno.test("[yield-curve] computeYieldCurve returns all default tenors", () => {
  const curve = computeYieldCurve();
  assertEquals(curve.length, 10);
  assertEquals(curve[0].tenorLabel, "3m");
  assertEquals(curve[0].tenorYears, 0.25);
  assertEquals(curve.at(-1)!.tenorLabel, "30y");
  assertEquals(curve.at(-1)!.tenorYears, 30);
  for (const point of curve) {
    assert(Number.isFinite(point.spotRate));
    assertGreater(point.spotRate, 0);
  }
});

Deno.test("[yield-curve] computeYieldCurve overrides defaults but preserves missing params", () => {
  const a = computeYieldCurve();
  const b = computeYieldCurve({ beta0: 0.10 });
  for (let i = 0; i < a.length; i++) {
    assertGreater(b[i].spotRate, a[i].spotRate);
  }
});

Deno.test("[yield-curve] computeYieldCurve with extreme negative beta1 inverts short end", () => {
  const inverted = computeYieldCurve({ beta1: -0.04 });
  const long = inverted.at(-1)!.spotRate;
  const short = inverted[0].spotRate;
  assertGreater(long, short);
});

Deno.test("[yield-curve] rateAt clamps to first point below the minimum tenor", () => {
  const curve = computeYieldCurve();
  const r = rateAt(curve, 0.01);
  assertEquals(r, curve[0].spotRate);
});

Deno.test("[yield-curve] rateAt clamps to last point above the maximum tenor", () => {
  const curve = computeYieldCurve();
  const r = rateAt(curve, 50);
  assertEquals(r, curve.at(-1)!.spotRate);
});

Deno.test("[yield-curve] rateAt linearly interpolates between two tenors", () => {
  const curve: YieldCurvePoint[] = [
    { tenorYears: 1, tenorLabel: "1y", spotRate: 0.02 },
    { tenorYears: 2, tenorLabel: "2y", spotRate: 0.04 },
  ];
  assertAlmostEquals(rateAt(curve, 1.5), 0.03, 1e-12);
  assertAlmostEquals(rateAt(curve, 1.25), 0.025, 1e-12);
});

Deno.test("[yield-curve] rateAt works on unsorted input", () => {
  const curve: YieldCurvePoint[] = [
    { tenorYears: 5, tenorLabel: "5y", spotRate: 0.05 },
    { tenorYears: 1, tenorLabel: "1y", spotRate: 0.01 },
    { tenorYears: 2, tenorLabel: "2y", spotRate: 0.02 },
  ];
  assertEquals(rateAt(curve, 0.5), 0.01);
  assertEquals(rateAt(curve, 10), 0.05);
  assertAlmostEquals(rateAt(curve, 1.5), 0.015, 1e-12);
});

Deno.test("[yield-curve] forwardRates returns one entry per FORWARD_PAIRS row", () => {
  const curve = computeYieldCurve();
  const fwds = forwardRates(curve);
  assertEquals(fwds.length, 5);
  const labels = fwds.map((f) => f.label);
  assertEquals(labels, ["1y→2y", "2y→3y", "3y→5y", "5y→10y", "10y→20y"]);
  for (const f of fwds) {
    assert(Number.isFinite(f.rate));
  }
});

Deno.test("[yield-curve] forwardRates rate equals analytical forward for flat curve", () => {
  const flat: YieldCurvePoint[] = [
    { tenorYears: 1, tenorLabel: "1y", spotRate: 0.03 },
    { tenorYears: 2, tenorLabel: "2y", spotRate: 0.03 },
    { tenorYears: 3, tenorLabel: "3y", spotRate: 0.03 },
    { tenorYears: 5, tenorLabel: "5y", spotRate: 0.03 },
    { tenorYears: 10, tenorLabel: "10y", spotRate: 0.03 },
    { tenorYears: 20, tenorLabel: "20y", spotRate: 0.03 },
  ];
  for (const f of forwardRates(flat)) {
    assertAlmostEquals(f.rate, 0.03, 1e-12);
  }
});

Deno.test("[yield-curve] buildYieldCurveResponse has correct shape and recent timestamp", () => {
  const before = Date.now();
  const r = buildYieldCurveResponse();
  const after = Date.now();
  assertEquals(r.curve.length, 10);
  assertEquals(r.forwardRates.length, 5);
  assert(r.computedAt >= before && r.computedAt <= after);
});

Deno.test("[yield-curve] buildYieldCurveResponse applies overrides through to curve", () => {
  const r = buildYieldCurveResponse({ beta0: 0.08 });
  for (const point of r.curve) {
    assertGreater(point.spotRate, 0.03);
  }
});

Deno.test("[yield-curve] fetchFredParams returns DEFAULT_PARAMS when FRED_KEY missing", async () => {
  await resetFredCache();
  const orig = Deno.env.get("FRED_KEY");
  Deno.env.delete("FRED_KEY");
  try {
    const params = await fetchFredParams();
    assertEquals(params.beta0, 0.045);
    assertEquals(params.beta1, -0.015);
    assertEquals(params.beta2, 0.010);
    assertEquals(params.lambda, 2.5);
  } finally {
    if (orig !== undefined) Deno.env.set("FRED_KEY", orig);
  }
});

Deno.test("[yield-curve] fetchFredParams falls back when fewer than 3 series return data", async () => {
  await resetFredCache();
  const orig = Deno.env.get("FRED_KEY");
  Deno.env.set("FRED_KEY", "test-key");
  const f = mockFred({
    DGS3MO: { body: JSON.stringify({ observations: [{ value: "5.00" }] }) },
    DGS6MO: { body: JSON.stringify({ observations: [{ value: "." }] }) },
    DGS1: { status: 500 },
    DGS2: { throw: true },
    DGS5: { body: JSON.stringify({ observations: [] }) },
    DGS10: { status: 404 },
    DGS30: { body: JSON.stringify({}) },
  });
  try {
    const params = await fetchFredParams();
    assertEquals(params.beta0, 0.045);
  } finally {
    f.restore();
    if (orig !== undefined) Deno.env.set("FRED_KEY", orig);
    else Deno.env.delete("FRED_KEY");
  }
});

Deno.test("[yield-curve] fetchFredParams fits to observed FRED rates and caches the result", async () => {
  await resetFredCache();
  const orig = Deno.env.get("FRED_KEY");
  Deno.env.set("FRED_KEY", "test-key");
  // Construct a roughly normal upward-sloping curve in percent
  const series: Record<string, string> = {
    DGS3MO: "5.40",
    DGS6MO: "5.20",
    DGS1: "5.00",
    DGS2: "4.60",
    DGS5: "4.30",
    DGS10: "4.40",
    DGS30: "4.55",
  };
  const map: SeriesMap = {};
  for (const [id, v] of Object.entries(series)) {
    map[id] = { body: JSON.stringify({ observations: [{ value: v }] }) };
  }
  const inserts: { params: NelsonSiegelParams; source: string }[] = [];
  const store = {
    insertSnapshot: (params: NelsonSiegelParams, source: string) => {
      inserts.push({ params, source });
      return Promise.resolve();
    },
    getClosestSnapshot: () => Promise.resolve(null),
  };
  const f = mockFred(map);
  try {
    const params = await fetchFredParams(store);
    // Fit should pick something other than the defaults given the inputs.
    assert(
      params.beta0 !== 0.045 ||
        params.beta1 !== -0.015 ||
        params.beta2 !== 0.010 ||
        params.lambda !== 2.5,
      `expected fit to differ from defaults, got ${JSON.stringify(params)}`,
    );
    // Long-run level should land near the 10y/30y values (~4.4-4.55%).
    assertGreater(params.beta0, 0.035);
    assertLess(params.beta0, 0.06);
    // One snapshot persisted via the store hook.
    assertEquals(inserts.length, 1);
    assertEquals(inserts[0].source, "fred");

    // Second call within the cache window must not hit the network again.
    const before = f.calls.length;
    const cached = await fetchFredParams(store);
    assertEquals(cached, params);
    assertEquals(f.calls.length, before);
    // Cached calls do not re-persist.
    assertEquals(inserts.length, 1);
  } finally {
    f.restore();
    if (orig !== undefined) Deno.env.set("FRED_KEY", orig);
    else Deno.env.delete("FRED_KEY");
    await resetFredCache();
  }
});

Deno.test("[yield-curve] fetchFredParams deduplicates concurrent calls into one in-flight promise", async () => {
  await resetFredCache();
  const orig = Deno.env.get("FRED_KEY");
  Deno.env.set("FRED_KEY", "test-key");
  const map: SeriesMap = {
    DGS3MO: { body: JSON.stringify({ observations: [{ value: "5.40" }] }) },
    DGS6MO: { body: JSON.stringify({ observations: [{ value: "5.20" }] }) },
    DGS1: { body: JSON.stringify({ observations: [{ value: "5.00" }] }) },
    DGS2: { body: JSON.stringify({ observations: [{ value: "4.60" }] }) },
    DGS5: { body: JSON.stringify({ observations: [{ value: "4.30" }] }) },
    DGS10: { body: JSON.stringify({ observations: [{ value: "4.40" }] }) },
    DGS30: { body: JSON.stringify({ observations: [{ value: "4.55" }] }) },
  };
  const f = mockFred(map);
  try {
    const [a, b] = await Promise.all([fetchFredParams(), fetchFredParams()]);
    assertEquals(a, b);
    // 7 series × one set of fetches, not two.
    assertEquals(f.calls.length, 7);
  } finally {
    f.restore();
    if (orig !== undefined) Deno.env.set("FRED_KEY", orig);
    else Deno.env.delete("FRED_KEY");
    await resetFredCache();
  }
});
