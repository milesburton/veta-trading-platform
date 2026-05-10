import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertGreater,
} from "jsr:@std/assert@0.217";
import { computeVol } from "../analytics/volatility-estimator.ts";

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
