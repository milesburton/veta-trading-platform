import {
  assertAlmostEquals,
  assertEquals,
} from "jsr:@std/assert@0.217";
import {
  computeEventScore,
  computeMomentum,
  computeNewsVelocity,
  computeRealisedVol,
  computeRelativeVolume,
  computeSectorRelativeStrength,
  computeSentimentDelta,
} from "../feature-engine/feature-computers.ts";
import type { MarketAdapterEvent, NewsEvent } from "../types/intelligence.ts";

Deno.test("computeMomentum: insufficient history → 0", () => {
  assertEquals(computeMomentum([]), 0);
  assertEquals(computeMomentum([100, 101, 102]), 0);
});

Deno.test("computeMomentum: positive, negative, and flat movement", () => {
  const base = Array(20).fill(100);

  const up = [...base];
  up[up.length - 1] = 110;
  assertAlmostEquals(computeMomentum(up), 0.1, 1e-6, "10% gain");

  const down = [...base];
  down[down.length - 1] = 90;
  assertAlmostEquals(computeMomentum(down), -0.1, 1e-6, "10% loss");

  assertAlmostEquals(computeMomentum(base), 0, 1e-6, "no movement");
});

Deno.test("computeRelativeVolume: insufficient history → 1 (neutral)", () => {
  assertEquals(computeRelativeVolume([]), 1);
  assertEquals(computeRelativeVolume([500]), 1);
});

Deno.test("computeRelativeVolume: 2× and 0.5× average", () => {
  const vols = Array(20).fill(1000);

  const high = [...vols];
  high[high.length - 1] = 2000;
  assertAlmostEquals(computeRelativeVolume(high), 2.0, 0.01, "2× volume");

  const low = [...vols];
  low[low.length - 1] = 500;
  assertAlmostEquals(computeRelativeVolume(low), 0.5, 0.01, "0.5× volume");
});

Deno.test("computeRealisedVol: insufficient history → 0", () => {
  assertEquals(computeRealisedVol([]), 0);
  assertEquals(computeRealisedVol([100]), 0);
});

Deno.test("computeRealisedVol: flat price → 0; varying prices → positive annualised vol in range", () => {
  assertAlmostEquals(computeRealisedVol(Array(20).fill(100)), 0, 1e-6, "flat");

  const prices = [
    100,
    101,
    99,
    102,
    98,
    103,
    97,
    104,
    96,
    105,
    100,
    101,
    99,
    102,
    98,
    103,
    97,
    104,
    96,
    105,
  ];
  const vol = computeRealisedVol(prices);
  assertEquals(vol > 0, true, "positive");
  assertEquals(vol < 50, true, "plausible (<5000% annualised)");
});

Deno.test("computeSectorRelativeStrength: insufficient symbol history → 0", () => {
  assertEquals(computeSectorRelativeStrength([100, 101], []), 0);
  assertEquals(
    computeSectorRelativeStrength(Array(5).fill(100), [Array(20).fill(100)]),
    0,
  );
});

Deno.test("computeSectorRelativeStrength: outperform, underperform, match sector", () => {
  const symbolUp10 = [...Array(20).fill(100)];
  symbolUp10[19] = 110;
  const sectorUp5 = [...Array(20).fill(100)];
  sectorUp5[19] = 105;

  assertAlmostEquals(
    computeSectorRelativeStrength(symbolUp10, [sectorUp5]),
    0.05,
    0.001,
    "+5% vs sector",
  );
  assertAlmostEquals(
    computeSectorRelativeStrength(sectorUp5, [symbolUp10]),
    -0.05,
    0.001,
    "-5% vs sector",
  );
  assertAlmostEquals(
    computeSectorRelativeStrength(symbolUp10, [symbolUp10]),
    0,
    1e-6,
    "matches sector",
  );
});

function makeEvent(overrides: Partial<MarketAdapterEvent>): MarketAdapterEvent {
  return {
    id: "test",
    type: "earnings",
    headline: "Test Event",
    scheduledAt: Date.now() + 2 * 24 * 60 * 60 * 1000,
    impact: "high",
    ts: Date.now(),
    ...overrides,
  };
}

Deno.test("computeEventScore: no events → 0", () => {
  assertEquals(computeEventScore("AAPL", []), 0);
});

Deno.test("computeEventScore: ticker event counts in full; macro event counts at 50%; past events ignored", () => {
  const now = Date.now();

  assertAlmostEquals(
    computeEventScore("AAPL", [makeEvent({ ticker: "AAPL", impact: "high" })]),
    1.0,
    1e-6,
    "high ticker event",
  );
  assertAlmostEquals(
    computeEventScore("AAPL", [
      makeEvent({ ticker: "AAPL", impact: "medium" }),
    ]),
    0.5,
    1e-6,
    "medium ticker event",
  );
  assertAlmostEquals(
    computeEventScore("AAPL", [makeEvent({ impact: "high" })]), // no ticker = macro
    0.5,
    1e-6,
    "macro event at 50%",
  );
  assertEquals(
    computeEventScore("AAPL", [
      makeEvent({ ticker: "AAPL", scheduledAt: now - 1000 }),
    ]),
    0,
    "past event ignored",
  );
  assertEquals(
    computeEventScore("AAPL", [makeEvent({ ticker: "MSFT" })]),
    0,
    "different ticker not counted",
  );
});

Deno.test("computeEventScore: multiple events accumulate correctly", () => {
  const events = [
    makeEvent({ ticker: "AAPL", impact: "high" }), // +1.0
    makeEvent({ ticker: "AAPL", impact: "medium" }), // +0.5
    makeEvent({ impact: "high" }), // +0.5 (macro)
  ];
  assertAlmostEquals(computeEventScore("AAPL", events), 2.0, 1e-6);
});

function makeNews(overrides: Partial<NewsEvent>): NewsEvent {
  return {
    id: "n1",
    source: "Yahoo",
    headline: "Test",
    tickers: ["AAPL"],
    sentiment: "neutral",
    sentimentScore: 0,
    relevanceScore: 0.5,
    publishedAt: Date.now() - 10_000,
    ts: Date.now() - 10_000,
    ...overrides,
  };
}

Deno.test("computeNewsVelocity: no news → 0; counts only recent items for this symbol", () => {
  assertEquals(computeNewsVelocity("AAPL", []), 0);

  const now = Date.now();
  const news = [
    makeNews({ id: "n1", ts: now - 10_000, publishedAt: now - 10_000 }), // AAPL, recent
    makeNews({ id: "n2", ts: now - 20_000, publishedAt: now - 20_000 }), // AAPL, recent
    makeNews({
      id: "n3",
      tickers: ["MSFT"],
      ts: now - 5_000,
      publishedAt: now - 5_000,
    }), // different symbol
    makeNews({ id: "n4", ts: now - 200_000, publishedAt: now - 200_000 }), // AAPL, too old
  ];
  assertEquals(computeNewsVelocity("AAPL", news), 2);
});

Deno.test("computeSentimentDelta: no news or single item → 0", () => {
  assertEquals(computeSentimentDelta("AAPL", []), 0);
  assertEquals(
    computeSentimentDelta("AAPL", [
      makeNews({ ts: Date.now() - 10_000, publishedAt: Date.now() - 10_000 }),
    ]),
    0,
  );
});

Deno.test("computeSentimentDelta: improving sentiment → positive; worsening → negative", () => {
  const now = Date.now();
  const negOld = makeNews({
    id: "o1",
    sentimentScore: -0.8,
    ts: now - 55_000,
    publishedAt: now - 55_000,
  });
  const posFresh = makeNews({
    id: "n1",
    sentimentScore: 0.8,
    ts: now - 5_000,
    publishedAt: now - 5_000,
  });
  assertEquals(
    computeSentimentDelta("AAPL", [negOld, posFresh]) > 0,
    true,
    "improving",
  );

  const posOld = makeNews({
    id: "o2",
    sentimentScore: 0.8,
    ts: now - 55_000,
    publishedAt: now - 55_000,
  });
  const negFresh = makeNews({
    id: "n2",
    sentimentScore: -0.8,
    ts: now - 5_000,
    publishedAt: now - 5_000,
  });
  assertEquals(
    computeSentimentDelta("AAPL", [posOld, negFresh]) < 0,
    true,
    "worsening",
  );
});
