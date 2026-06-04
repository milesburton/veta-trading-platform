import { assert, assertAlmostEquals, assertEquals, assertGreater } from "jsr:@std/assert@0.217";
import type { NelsonSiegelParams, YieldCurvePoint } from "../analytics/types.ts";
import {
  _internalForTests,
  buildYieldCurveResponse,
  computeYieldCurve,
  fetchFredParams,
  forwardRates,
  rateAt,
} from "../analytics/yield-curve.ts";

const realFetch = globalThis.fetch;
const DEFAULT_PARAMS: NelsonSiegelParams = {
  beta0: 0.045,
  beta1: -0.015,
  beta2: 0.01,
  lambda: 2.5,
};

type SeriesMap = Record<string, { status?: number; body?: string; throw?: boolean }>;

function installFredMock(map: SeriesMap): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  globalThis.fetch = ((url: string | URL | Request) => {
    const asString = String(url);
    calls.push(asString);
    const match = asString.match(/series_id=([A-Z0-9]+)/);
    const entry = map[match?.[1] ?? ""];

    if (!entry) {
      return Promise.resolve(new Response("not found", { status: 404 }));
    }
    if (entry.throw) {
      return Promise.reject(new Error("network down"));
    }
    if (entry.status && entry.status !== 200) {
      return Promise.resolve(new Response("err", { status: entry.status }));
    }
    return Promise.resolve(
      new Response(entry.body ?? "{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

function withFredKey<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const previous = Deno.env.get("FRED_KEY");
  if (value === undefined) {
    Deno.env.delete("FRED_KEY");
  } else {
    Deno.env.set("FRED_KEY", value);
  }

  return fn().finally(() => {
    if (previous === undefined) {
      Deno.env.delete("FRED_KEY");
    } else {
      Deno.env.set("FRED_KEY", previous);
    }
  });
}

Deno.test("[yield-curve] computeYieldCurve returns default tenor set", () => {
  const curve = computeYieldCurve();

  assertEquals(curve.length, 10);
  assertEquals(curve[0].tenorLabel, "3m");
  assertEquals(curve[0].tenorYears, 0.25);
  assertEquals(curve.at(-1)?.tenorLabel, "30y");
  assertEquals(curve.at(-1)?.tenorYears, 30);
  for (const point of curve) {
    assertGreater(point.spotRate, 0);
  }
});

Deno.test("[yield-curve] computeYieldCurve applies parameter overrides", () => {
  const baseline = computeYieldCurve();
  const shifted = computeYieldCurve({ beta0: 0.1 });

  for (let index = 0; index < baseline.length; index++) {
    assertGreater(shifted[index].spotRate, baseline[index].spotRate);
  }
});

Deno.test("[yield-curve] rateAt clamps and interpolates correctly", () => {
  const curve: YieldCurvePoint[] = [
    { tenorYears: 5, tenorLabel: "5y", spotRate: 0.05 },
    { tenorYears: 1, tenorLabel: "1y", spotRate: 0.01 },
    { tenorYears: 2, tenorLabel: "2y", spotRate: 0.02 },
  ];

  assertEquals(rateAt(curve, 0.5), 0.01);
  assertEquals(rateAt(curve, 10), 0.05);
  assertAlmostEquals(rateAt(curve, 1.5), 0.015, 1e-12);
});

Deno.test("[yield-curve] forwardRates match the analytical flat-curve forward", () => {
  const curve: YieldCurvePoint[] = [
    { tenorYears: 1, tenorLabel: "1y", spotRate: 0.03 },
    { tenorYears: 2, tenorLabel: "2y", spotRate: 0.03 },
    { tenorYears: 3, tenorLabel: "3y", spotRate: 0.03 },
    { tenorYears: 5, tenorLabel: "5y", spotRate: 0.03 },
    { tenorYears: 10, tenorLabel: "10y", spotRate: 0.03 },
    { tenorYears: 20, tenorLabel: "20y", spotRate: 0.03 },
  ];

  for (const forward of forwardRates(curve)) {
    assertAlmostEquals(forward.rate, 0.03, 1e-12);
  }
});

Deno.test("[yield-curve] buildYieldCurveResponse includes recent timestamp and forward table", () => {
  const before = Date.now();
  const response = buildYieldCurveResponse({ beta0: 0.08 });
  const after = Date.now();

  assertEquals(response.curve.length, 10);
  assertEquals(response.forwardRates.length, 5);
  assert(response.computedAt >= before && response.computedAt <= after);
  for (const point of response.curve) {
    assertGreater(point.spotRate, 0.03);
  }
});

Deno.test("[yield-curve] nelsonSiegel handles non-positive tau", () => {
  const { nelsonSiegel } = _internalForTests;
  assertEquals(nelsonSiegel(0, DEFAULT_PARAMS), DEFAULT_PARAMS.beta0 + DEFAULT_PARAMS.beta1);
  assertEquals(nelsonSiegel(-1, DEFAULT_PARAMS), DEFAULT_PARAMS.beta0 + DEFAULT_PARAMS.beta1);
});

Deno.test("[yield-curve] fetchFredParams returns defaults when FRED_KEY is missing", async () => {
  _internalForTests.resetFredCache();
  const params = await withFredKey(undefined, () => fetchFredParams());
  assertEquals(params, DEFAULT_PARAMS);
});

Deno.test("[yield-curve] fetchFredParams falls back when too few series return usable data", async () => {
  _internalForTests.resetFredCache();
  await withFredKey("test-key", async () => {
    const mock = installFredMock({
      DGS3MO: { body: JSON.stringify({ observations: [{ value: "5.00" }] }) },
      DGS6MO: { body: JSON.stringify({ observations: [{ value: "." }] }) },
      DGS1: { status: 500 },
      DGS2: { throw: true },
      DGS5: { body: JSON.stringify({ observations: [] }) },
      DGS10: { status: 404 },
      DGS30: { body: JSON.stringify({}) },
    });

    try {
      assertEquals(await fetchFredParams(), DEFAULT_PARAMS);
    } finally {
      mock.restore();
    }
  });
});

Deno.test("[yield-curve] fetchFredParams fits observed rates and caches the result", async () => {
  _internalForTests.resetFredCache();
  await withFredKey("test-key", async () => {
    const series: Record<string, string> = {
      DGS3MO: "5.40",
      DGS6MO: "5.20",
      DGS1: "5.00",
      DGS2: "4.60",
      DGS5: "4.30",
      DGS10: "4.40",
      DGS30: "4.55",
    };
    const mockMap: SeriesMap = {};
    for (const [id, value] of Object.entries(series)) {
      mockMap[id] = {
        body: JSON.stringify({ observations: [{ value }] }),
      };
    }

    const inserted: { params: NelsonSiegelParams; source: string }[] = [];
    const store = {
      insertSnapshot: (params: NelsonSiegelParams, source: string) => {
        inserted.push({ params, source });
        return Promise.resolve();
      },
      getClosestSnapshot: () => Promise.resolve(null),
    };

    const mock = installFredMock(mockMap);
    try {
      const first = await fetchFredParams(store);
      assert(first.beta0 !== DEFAULT_PARAMS.beta0 || first.beta1 !== DEFAULT_PARAMS.beta1);
      assertGreater(first.beta0, 0.035);
      assertEquals(inserted.length, 1);
      assertEquals(inserted[0].source, "fred");

      const beforeCalls = mock.calls.length;
      const second = await fetchFredParams(store);
      assertEquals(second, first);
      assertEquals(mock.calls.length, beforeCalls);
      assertEquals(inserted.length, 1);
    } finally {
      mock.restore();
      _internalForTests.resetFredCache();
    }
  });
});

Deno.test("[yield-curve] fetchFredParams deduplicates concurrent in-flight requests", async () => {
  _internalForTests.resetFredCache();
  await withFredKey("test-key", async () => {
    const mock = installFredMock({
      DGS3MO: { body: JSON.stringify({ observations: [{ value: "5.40" }] }) },
      DGS6MO: { body: JSON.stringify({ observations: [{ value: "5.20" }] }) },
      DGS1: { body: JSON.stringify({ observations: [{ value: "5.00" }] }) },
      DGS2: { body: JSON.stringify({ observations: [{ value: "4.60" }] }) },
      DGS5: { body: JSON.stringify({ observations: [{ value: "4.30" }] }) },
      DGS10: { body: JSON.stringify({ observations: [{ value: "4.40" }] }) },
      DGS30: { body: JSON.stringify({ observations: [{ value: "4.55" }] }) },
    });

    try {
      const [first, second] = await Promise.all([fetchFredParams(), fetchFredParams()]);
      assertEquals(first, second);
      assertEquals(mock.calls.length, 7);
    } finally {
      mock.restore();
      _internalForTests.resetFredCache();
    }
  });
});
