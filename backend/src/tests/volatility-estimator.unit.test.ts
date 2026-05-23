import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertGreater,
} from "jsr:@std/assert@0.217";
import {
  _internalForTests,
  computeVol,
  estimateVol,
  estimateVolProfile,
  fetchSpotPrice,
} from "../analytics/volatility-estimator.ts";

const realFetch = globalThis.fetch;

interface FetchScript {
  responses: (() => Response | Promise<Response>)[];
  calls: string[];
}

function scriptFetch(responses: (() => Response | Promise<Response>)[]): FetchScript {
  const calls: string[] = [];
  let idx = 0;
  globalThis.fetch = ((url: string | URL | Request) => {
    calls.push(String(url));
    const handler = responses[Math.min(idx, responses.length - 1)];
    idx++;
    return Promise.resolve(handler());
  }) as typeof fetch;
  return { responses, calls };
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

function candleBody(closes: number[]) {
  const base = 1_700_000_000_000;
  return JSON.stringify(
    closes.map((c, i) => ({ close: c, ts: base + i * 60_000 })),
  );
}

function timestamps(n: number, stepMs = 60_000, start = 1_700_000_000_000): number[] {
  return Array.from({ length: n }, (_, i) => start + i * stepMs);
}

Deno.test("[volatility-estimator] computeVol on flat series clamps to floor 0.01", () => {
  const closes = Array(50).fill(100);
  const ts = timestamps(closes.length);
  const r = computeVol(closes, ts);
  assertEquals(r.ewmaVol, 0.01);
  assertEquals(r.rollingVol, 0.01);
  assertEquals(r.ewmaSeries.length, closes.length - 1);
});

Deno.test("[volatility-estimator] computeVol on extreme series clamps to ceiling 5.0", () => {
  const closes: number[] = [];
  for (let i = 0; i < 30; i++) closes.push(i % 2 === 0 ? 100 : 1);
  const ts = timestamps(closes.length);
  const r = computeVol(closes, ts);
  assertEquals(r.ewmaVol, 5.0);
  assertEquals(r.rollingVol, 5.0);
});

Deno.test("[volatility-estimator] computeVol returns positive vol for noisy real-world-ish series", () => {
  const closes: number[] = [];
  let p = 100;
  for (let i = 0; i < 60; i++) {
    p *= 1 + ((i * 13) % 11 - 5) / 1_000;
    closes.push(p);
  }
  const ts = timestamps(closes.length);
  const r = computeVol(closes, ts);
  assertGreater(r.ewmaVol, 0.01);
  assertGreater(r.rollingVol, 0.01);
});

Deno.test("[volatility-estimator] computeVol ewmaSeries timestamps match input timestamps from index 1", () => {
  const closes = [100, 101, 102, 101, 100, 102, 103];
  const ts = timestamps(closes.length);
  const r = computeVol(closes, ts);
  assertEquals(r.ewmaSeries.length, closes.length - 1);
  assertEquals(r.ewmaSeries[0].ts, ts[1]);
  assertEquals(r.ewmaSeries.at(-1)!.ts, ts.at(-1));
});

Deno.test("[volatility-estimator] computeVol ewmaVol equals last sample in ewmaSeries", () => {
  const closes = [100, 101, 99, 102, 98, 103, 97];
  const ts = timestamps(closes.length);
  const r = computeVol(closes, ts);
  assertAlmostEquals(r.ewmaVol, r.ewmaSeries.at(-1)!.vol, 1e-12);
});

Deno.test("[volatility-estimator] computeVol higher-magnitude moves produce higher vol", () => {
  const calmer = [100, 100.1, 99.9, 100.05, 99.95, 100.1, 100];
  const noisier = [100, 102, 98, 101, 99, 103, 97];
  const a = computeVol(calmer, timestamps(calmer.length));
  const b = computeVol(noisier, timestamps(noisier.length));
  assertGreater(b.ewmaVol, a.ewmaVol);
  assertGreater(b.rollingVol, a.rollingVol);
});

Deno.test("[volatility-estimator] computeVol ewma reacts faster to recent shocks than rolling stddev", () => {
  const closes: number[] = [];
  for (let i = 0; i < 30; i++) closes.push(100 + Math.sin(i / 5) * 0.01);
  closes.push(95, 105, 95, 105, 95, 105);
  const ts = timestamps(closes.length);
  const r = computeVol(closes, ts);
  assert(r.ewmaVol > r.rollingVol * 0.5, "EWMA should be responsive to the recent shock cluster");
});

Deno.test("[volatility-estimator] estimateVol returns fallback when fetch fails", async () => {
  _internalForTests.resetVolCache();
  scriptFetch([() => new Response("nope", { status: 500 })]);
  try {
    const v = await estimateVol("http://j", "AAPL", 0.33);
    assertEquals(v, 0.33);
  } finally {
    restoreFetch();
  }
});

Deno.test("[volatility-estimator] estimateVol returns fallback when fetch throws", async () => {
  _internalForTests.resetVolCache();
  scriptFetch([() => Promise.reject(new Error("boom"))]);
  try {
    const v = await estimateVol("http://j", "AAPL");
    assertEquals(v, 0.25);
  } finally {
    restoreFetch();
  }
});

Deno.test("[volatility-estimator] estimateVol returns fallback when fewer than 2 candles", async () => {
  _internalForTests.resetVolCache();
  scriptFetch([() => new Response(candleBody([100]), { status: 200 })]);
  try {
    const v = await estimateVol("http://j", "MSFT", 0.42);
    assertEquals(v, 0.42);
  } finally {
    restoreFetch();
  }
});

Deno.test("[volatility-estimator] estimateVol returns fallback when fewer than 2 positive closes", async () => {
  _internalForTests.resetVolCache();
  scriptFetch([() => new Response(candleBody([0, -1, 100]), { status: 200 })]);
  try {
    const v = await estimateVol("http://j", "GOOG", 0.5);
    assertEquals(v, 0.5);
  } finally {
    restoreFetch();
  }
});

Deno.test("[volatility-estimator] estimateVol computes from candles and caches subsequent calls", async () => {
  _internalForTests.resetVolCache();
  const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3));
  const s = scriptFetch([
    () => new Response(candleBody(closes), { status: 200 }),
    () => new Response("should not be called", { status: 500 }),
  ]);
  try {
    const v1 = await estimateVol("http://j", "TSLA");
    assertGreater(v1, 0);
    const v2 = await estimateVol("http://j", "TSLA");
    assertAlmostEquals(v1, v2, 1e-12);
    assertEquals(s.calls.length, 1);
  } finally {
    restoreFetch();
  }
});

Deno.test("[volatility-estimator] estimateVolProfile returns null when fetch fails", async () => {
  _internalForTests.resetVolCache();
  scriptFetch([() => new Response("err", { status: 500 })]);
  try {
    const v = await estimateVolProfile("http://j", "AMZN");
    assertEquals(v, null);
  } finally {
    restoreFetch();
  }
});

Deno.test("[volatility-estimator] estimateVolProfile returns null with insufficient candles", async () => {
  _internalForTests.resetVolCache();
  scriptFetch([() => new Response(candleBody([100]), { status: 200 })]);
  try {
    const v = await estimateVolProfile("http://j", "AMZN");
    assertEquals(v, null);
  } finally {
    restoreFetch();
  }
});

Deno.test("[volatility-estimator] estimateVolProfile returns full series and caches result", async () => {
  _internalForTests.resetVolCache();
  const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.cos(i / 4));
  const s = scriptFetch([
    () => new Response(candleBody(closes), { status: 200 }),
    () => new Response("should not be called", { status: 500 }),
  ]);
  try {
    const a = await estimateVolProfile("http://j", "NVDA");
    assert(a !== null);
    assertEquals(a!.ewmaSeries.length, closes.length - 1);
    assertGreater(a!.ewmaVol, 0);
    assertGreater(a!.rollingVol, 0);
    const b = await estimateVolProfile("http://j", "NVDA");
    assertEquals(b!.ewmaVol, a!.ewmaVol);
    assertEquals(s.calls.length, 1);
  } finally {
    restoreFetch();
  }
});

Deno.test("[volatility-estimator] estimateVolProfile synthesises timestamps when ts field absent", async () => {
  _internalForTests.resetVolCache();
  const closes = Array.from({ length: 20 }, (_, i) => 100 + i * 0.1);
  const body = JSON.stringify(closes.map((c) => ({ close: c })));
  scriptFetch([() => new Response(body, { status: 200 })]);
  try {
    const v = await estimateVolProfile("http://j", "META");
    assert(v !== null);
    assertEquals(v!.ewmaSeries.length, closes.length - 1);
    for (const sample of v!.ewmaSeries) {
      assert(Number.isFinite(sample.ts));
    }
  } finally {
    restoreFetch();
  }
});

Deno.test("[volatility-estimator] fetchSpotPrice returns last close on success", async () => {
  scriptFetch([
    () => new Response(JSON.stringify([{ close: 192.5 }]), { status: 200 }),
  ]);
  try {
    const p = await fetchSpotPrice("http://j", "AAPL");
    assertEquals(p, 192.5);
  } finally {
    restoreFetch();
  }
});

Deno.test("[volatility-estimator] fetchSpotPrice returns null on HTTP error", async () => {
  scriptFetch([() => new Response("err", { status: 503 })]);
  try {
    const p = await fetchSpotPrice("http://j", "AAPL");
    assertEquals(p, null);
  } finally {
    restoreFetch();
  }
});

Deno.test("[volatility-estimator] fetchSpotPrice returns null when fetch throws", async () => {
  scriptFetch([() => Promise.reject(new Error("net"))]);
  try {
    const p = await fetchSpotPrice("http://j", "AAPL");
    assertEquals(p, null);
  } finally {
    restoreFetch();
  }
});

Deno.test("[volatility-estimator] fetchSpotPrice returns null on empty candle array", async () => {
  scriptFetch([() => new Response("[]", { status: 200 })]);
  try {
    const p = await fetchSpotPrice("http://j", "AAPL");
    assertEquals(p, null);
  } finally {
    restoreFetch();
  }
});

Deno.test("[volatility-estimator] fetchSpotPrice returns null when close is non-positive", async () => {
  scriptFetch([
    () => new Response(JSON.stringify([{ close: 0 }]), { status: 200 }),
  ]);
  try {
    const p = await fetchSpotPrice("http://j", "AAPL");
    assertEquals(p, null);
  } finally {
    restoreFetch();
  }
});

