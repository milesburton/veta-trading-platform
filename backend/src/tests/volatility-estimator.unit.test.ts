import { assert, assertAlmostEquals, assertEquals, assertGreater } from "jsr:@std/assert@0.217";
import {
  _internalForTests,
  computeVol,
  estimateVol,
  estimateVolProfile,
  fetchSpotPrice,
} from "../analytics/volatility-estimator.ts";

const realFetch = globalThis.fetch;
const BASE_TS = 1_700_000_000_000;

interface FetchScript {
  calls: string[];
  restore: () => void;
}

function installFetchScript(
  responses: ReadonlyArray<() => Response | Promise<Response>>
): FetchScript {
  const calls: string[] = [];
  let index = 0;
  globalThis.fetch = ((url: string | URL | Request) => {
    calls.push(String(url));
    const handler = responses[Math.min(index, responses.length - 1)];
    index++;
    return Promise.resolve(handler());
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

function candleBody(closes: number[], withTimestamps = true): string {
  return JSON.stringify(
    closes.map((close, index) =>
      withTimestamps ? { close, ts: BASE_TS + index * 60_000 } : { close }
    )
  );
}

function timestamps(length: number): number[] {
  return Array.from({ length }, (_, index) => BASE_TS + index * 60_000);
}

Deno.test("[volatility-estimator] computeVol clamps flat series to floor", () => {
  const closes = Array(50).fill(100);
  const result = computeVol(closes, timestamps(closes.length));

  assertEquals(result.ewmaVol, 0.01);
  assertEquals(result.rollingVol, 0.01);
  assertEquals(result.ewmaSeries.length, closes.length - 1);
});

Deno.test("[volatility-estimator] computeVol clamps extreme series to ceiling", () => {
  const closes = Array.from({ length: 30 }, (_, index) => (index % 2 === 0 ? 100 : 1));
  const result = computeVol(closes, timestamps(closes.length));

  assertEquals(result.ewmaVol, 5.0);
  assertEquals(result.rollingVol, 5.0);
});

Deno.test("[volatility-estimator] computeVol preserves timestamps and final sample", () => {
  const closes = [100, 101, 99, 102, 98, 103, 97];
  const ts = timestamps(closes.length);
  const result = computeVol(closes, ts);
  const lastSample = result.ewmaSeries.at(-1);
  assert(lastSample, "expected EWMA series to include a final sample");

  assertEquals(result.ewmaSeries[0].ts, ts[1]);
  assertEquals(lastSample.ts, ts.at(-1));
  assertAlmostEquals(result.ewmaVol, lastSample.vol, 1e-12);
});

Deno.test("[volatility-estimator] computeVol responds to noisier price paths", () => {
  const calm = [100, 100.1, 99.9, 100.05, 99.95, 100.1, 100];
  const noisy = [100, 102, 98, 101, 99, 103, 97];

  const calmVol = computeVol(calm, timestamps(calm.length));
  const noisyVol = computeVol(noisy, timestamps(noisy.length));

  assertGreater(noisyVol.ewmaVol, calmVol.ewmaVol);
  assertGreater(noisyVol.rollingVol, calmVol.rollingVol);
});

for (const testCase of [
  {
    label: "estimateVol falls back on non-OK response",
    responses: [() => new Response("err", { status: 500 })],
    run: () => estimateVol("http://journal", "AAPL", 0.33),
    expected: 0.33,
  },
  {
    label: "estimateVol falls back on thrown fetch",
    responses: [() => Promise.reject(new Error("boom"))],
    run: () => estimateVol("http://journal", "AAPL"),
    expected: 0.25,
  },
  {
    label: "estimateVol falls back with insufficient candles",
    responses: [() => new Response(candleBody([100]), { status: 200 })],
    run: () => estimateVol("http://journal", "MSFT", 0.42),
    expected: 0.42,
  },
  {
    label: "estimateVol falls back with fewer than two positive closes",
    responses: [() => new Response(candleBody([0, -1, 100]), { status: 200 })],
    run: () => estimateVol("http://journal", "GOOG", 0.5),
    expected: 0.5,
  },
] as const) {
  Deno.test(`[volatility-estimator] ${testCase.label}`, async () => {
    _internalForTests.resetVolCache();
    const script = installFetchScript(testCase.responses);
    try {
      assertEquals(await testCase.run(), testCase.expected);
    } finally {
      script.restore();
    }
  });
}

Deno.test("[volatility-estimator] estimateVol computes and caches values", async () => {
  _internalForTests.resetVolCache();
  const closes = Array.from({ length: 30 }, (_, index) => 100 + Math.sin(index / 3));
  const script = installFetchScript([
    () => new Response(candleBody(closes), { status: 200 }),
    () => new Response("should not be called", { status: 500 }),
  ]);

  try {
    const first = await estimateVol("http://journal", "TSLA");
    const second = await estimateVol("http://journal", "TSLA");

    assertGreater(first, 0);
    assertAlmostEquals(first, second, 1e-12);
    assertEquals(script.calls.length, 1);
  } finally {
    script.restore();
  }
});

for (const testCase of [
  {
    label: "estimateVolProfile returns null on non-OK response",
    responses: [() => new Response("err", { status: 500 })],
    expectedNull: true,
  },
  {
    label: "estimateVolProfile returns null with insufficient candles",
    responses: [() => new Response(candleBody([100]), { status: 200 })],
    expectedNull: true,
  },
  {
    label: "estimateVolProfile synthesises timestamps when absent",
    responses: [() => new Response(candleBody([100, 100.3, 100.8], false), { status: 200 })],
    expectedNull: false,
    check: (result: NonNullable<Awaited<ReturnType<typeof estimateVolProfile>>>) => {
      assertEquals(result.ewmaSeries.length, 2);
      for (const sample of result.ewmaSeries) {
        assert(Number.isFinite(sample.ts));
      }
    },
  },
] as const) {
  Deno.test(`[volatility-estimator] ${testCase.label}`, async () => {
    _internalForTests.resetVolCache();
    const script = installFetchScript(testCase.responses);
    try {
      const result = await estimateVolProfile("http://journal", "NVDA");
      assertEquals(result === null, testCase.expectedNull);
      if (result && testCase.check) {
        testCase.check(result);
      }
    } finally {
      script.restore();
    }
  });
}

Deno.test("[volatility-estimator] estimateVolProfile computes and caches the full profile", async () => {
  _internalForTests.resetVolCache();
  const closes = Array.from({ length: 30 }, (_, index) => 100 + Math.cos(index / 4));
  const script = installFetchScript([
    () => new Response(candleBody(closes), { status: 200 }),
    () => new Response("should not be called", { status: 500 }),
  ]);

  try {
    const first = await estimateVolProfile("http://journal", "NVDA");
    const second = await estimateVolProfile("http://journal", "NVDA");

    assert(first !== null);
    assert(second !== null);
    assertEquals(first.ewmaSeries.length, closes.length - 1);
    assertGreater(first.ewmaVol, 0);
    assertGreater(first.rollingVol, 0);
    assertAlmostEquals(second.ewmaVol, first.ewmaVol, 1e-12);
    assertEquals(script.calls.length, 1);
  } finally {
    script.restore();
  }
});

for (const testCase of [
  {
    label: "fetchSpotPrice returns last close on success",
    responses: [() => new Response(JSON.stringify([{ close: 192.5 }]), { status: 200 })],
    expected: 192.5,
  },
  {
    label: "fetchSpotPrice returns null on non-OK response",
    responses: [() => new Response("err", { status: 503 })],
    expected: null,
  },
  {
    label: "fetchSpotPrice returns null on thrown fetch",
    responses: [() => Promise.reject(new Error("network"))],
    expected: null,
  },
  {
    label: "fetchSpotPrice returns null on empty candles",
    responses: [() => new Response("[]", { status: 200 })],
    expected: null,
  },
  {
    label: "fetchSpotPrice returns null on non-positive close",
    responses: [() => new Response(JSON.stringify([{ close: 0 }]), { status: 200 })],
    expected: null,
  },
] as const) {
  Deno.test(`[volatility-estimator] ${testCase.label}`, async () => {
    const script = installFetchScript(testCase.responses);
    try {
      assertEquals(await fetchSpotPrice("http://journal", "AAPL"), testCase.expected);
    } finally {
      script.restore();
    }
  });
}
