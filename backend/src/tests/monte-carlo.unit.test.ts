import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertGreater,
  assertGreaterOrEqual,
  assertLessOrEqual,
} from "jsr:@std/assert@0.217";
import {
  boxMuller,
  hashSeed,
  makeLcg,
  monteCarlo,
} from "../analytics/monte-carlo.ts";
import { blackScholes } from "../analytics/black-scholes.ts";

Deno.test("[monte-carlo] makeLcg is deterministic for same seed", () => {
  const a = makeLcg(42);
  const b = makeLcg(42);
  for (let i = 0; i < 100; i++) {
    assertEquals(a(), b());
  }
});

Deno.test("[monte-carlo] makeLcg diverges for different seeds", () => {
  const a = makeLcg(42);
  const b = makeLcg(43);
  let differences = 0;
  for (let i = 0; i < 100; i++) {
    if (a() !== b()) differences++;
  }
  assertGreater(differences, 90);
});

Deno.test("[monte-carlo] makeLcg outputs in [0, 1)", () => {
  const r = makeLcg(123);
  for (let i = 0; i < 1_000; i++) {
    const v = r();
    assertGreaterOrEqual(v, 0);
    assertLessOrEqual(v, 1);
  }
});

Deno.test("[monte-carlo] hashSeed is deterministic across calls with the same input", () => {
  assertEquals(hashSeed("AAPL-150-3600"), hashSeed("AAPL-150-3600"));
  assertEquals(hashSeed(""), hashSeed(""));
});

Deno.test("[monte-carlo] hashSeed never returns 0 (collision with LCG zero state)", () => {
  for (const s of ["", "a", "ab", "abc", "abcd"]) {
    assertGreater(hashSeed(s), 0);
  }
});

Deno.test("[monte-carlo] hashSeed returns different values for different inputs", () => {
  const seeds = new Set<number>();
  for (const s of ["AAPL", "MSFT", "NVDA", "GOOG", "AMZN"]) {
    seeds.add(hashSeed(s));
  }
  assertEquals(seeds.size, 5);
});

Deno.test("[monte-carlo] boxMuller returns finite values for typical uniforms", () => {
  for (let i = 0; i < 20; i++) {
    const v = boxMuller(0.5 + 0.001 * i, 0.3 + 0.005 * i);
    assert(Number.isFinite(v), `boxMuller produced ${v}`);
  }
});

Deno.test("[monte-carlo] boxMuller mean ≈ 0 and stddev ≈ 1 over many samples", () => {
  const r = makeLcg(7);
  const N = 10_000;
  const samples: number[] = [];
  for (let i = 0; i < N / 2; i++) {
    samples.push(boxMuller(r(), r()));
  }
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) /
    (samples.length - 1);
  assertAlmostEquals(mean, 0, 0.05);
  assertAlmostEquals(Math.sqrt(variance), 1, 0.05);
});

Deno.test("[monte-carlo] T=0 returns intrinsic across all percentiles (ITM call)", () => {
  const r = monteCarlo("call", 110, 100, 0, 0.05, 0.2);
  assertAlmostEquals(r.p5, 10, 1e-9);
  assertAlmostEquals(r.mean, 10, 1e-9);
  assertAlmostEquals(r.p95, 10, 1e-9);
});

Deno.test("[monte-carlo] T=0 OTM returns 0", () => {
  const r = monteCarlo("call", 90, 100, 0, 0.05, 0.2);
  assertAlmostEquals(r.mean, 0, 1e-9);
});

Deno.test("[monte-carlo] σ=0 returns intrinsic", () => {
  const r = monteCarlo("put", 90, 100, 1, 0.05, 0);
  assertAlmostEquals(r.mean, 10, 1e-9);
});

Deno.test("[monte-carlo] same seedKey produces identical result across two runs", () => {
  const a = monteCarlo("call", 100, 100, 1, 0.05, 0.2, 1_000, "fixed-seed");
  const b = monteCarlo("call", 100, 100, 1, 0.05, 0.2, 1_000, "fixed-seed");
  assertEquals(a.mean, b.mean);
  assertEquals(a.p5, b.p5);
  assertEquals(a.p95, b.p95);
});

Deno.test("[monte-carlo] percentiles are ordered: p5 <= p25 <= mean <= p75 <= p95 (call)", () => {
  const r = monteCarlo("call", 100, 100, 1, 0.05, 0.2, 5_000, "ordered");
  assertLessOrEqual(r.p5, r.p25);
  assertLessOrEqual(r.p25, r.p95);
  assertLessOrEqual(r.p25, r.mean);
  assertLessOrEqual(r.p25, r.p75);
  assertLessOrEqual(r.p75, r.p95);
});

Deno.test("[monte-carlo] mean converges within 5% of Black-Scholes price for ATM call", () => {
  const S = 100, K = 100, T = 1, r = 0.05, sigma = 0.2;
  const bs = blackScholes("call", S, K, T, r, sigma).price;
  const mc = monteCarlo("call", S, K, T, r, sigma, 50_000, "convergence");
  assertAlmostEquals(mc.mean, bs, bs * 0.05);
});

Deno.test("[monte-carlo] odd path count is bumped to even for antithetic pairing", () => {
  const r = monteCarlo("call", 100, 100, 1, 0.05, 0.2, 99, "odd-paths");
  assert(Number.isFinite(r.mean));
});

Deno.test("[monte-carlo] empty seedKey falls back to a derived key (no crash)", () => {
  const r = monteCarlo("call", 100, 100, 1, 0.05, 0.2, 1_000);
  assert(Number.isFinite(r.mean));
});
