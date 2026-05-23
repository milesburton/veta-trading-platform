import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { priceFan } from "../analytics/price-fan.ts";

Deno.test("[price-fan] returns one entry per step", () => {
  const r = priceFan(100, 0.2, 0.05, 5, 86_400, 1_000, "seed");
  assertEquals(r.length, 5);
  for (let i = 0; i < r.length; i++) {
    assertEquals(r[i].step, i + 1);
    assertEquals(r[i].tSecs, (i + 1) * 86_400);
  }
});

Deno.test("[price-fan] quantiles are non-decreasing within a step", () => {
  const r = priceFan(100, 0.3, 0.05, 10, 86_400, 2_000, "k");
  for (const s of r) {
    assert(s.p5 <= s.p25, `step ${s.step}: p5 > p25`);
    assert(s.p25 <= s.p50, `step ${s.step}: p25 > p50`);
    assert(s.p50 <= s.p75, `step ${s.step}: p50 > p75`);
    assert(s.p75 <= s.p95, `step ${s.step}: p75 > p95`);
  }
});

Deno.test("[price-fan] median (p50) close to spot at the first step", () => {
  const S = 100;
  const r = priceFan(S, 0.2, 0.05, 1, 60, 4_000, "median-test");
  const drift = (r[0].p50 - S) / S;
  assert(Math.abs(drift) < 0.005, `expected small drift, got ${drift}`);
});

Deno.test("[price-fan] same seed yields identical output", () => {
  const a = priceFan(120, 0.25, 0.04, 5, 3_600, 500, "stable");
  const b = priceFan(120, 0.25, 0.04, 5, 3_600, 500, "stable");
  assertEquals(a, b);
});

Deno.test("[price-fan] different seeds yield different output", () => {
  const a = priceFan(120, 0.25, 0.04, 5, 3_600, 500, "alpha");
  const b = priceFan(120, 0.25, 0.04, 5, 3_600, 500, "beta");
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i].p50 !== b[i].p50) diff++;
  }
  assert(diff > 0, "expected at least one step to differ");
});

Deno.test("[price-fan] odd path count is rounded up to even for antithetic pairing", () => {
  const r = priceFan(100, 0.2, 0.05, 3, 60, 99, "odd");
  assertEquals(r.length, 3);
  for (const s of r) {
    assert(s.p5 < s.p95, "spread must be positive");
  }
});

Deno.test("[price-fan] zero vol collapses spread (drift-only path)", () => {
  const r = priceFan(100, 0, 0.05, 3, 86_400, 200, "flat");
  for (const s of r) {
    assertEquals(s.p5, s.p95);
    assertEquals(s.p25, s.p75);
  }
});

Deno.test("[price-fan] higher vol widens p5-p95 spread", () => {
  const calm = priceFan(100, 0.10, 0.05, 5, 86_400, 1_000, "vol");
  const wild = priceFan(100, 0.80, 0.05, 5, 86_400, 1_000, "vol");
  const lastCalm = calm.at(-1)!;
  const lastWild = wild.at(-1)!;
  assert(
    (lastWild.p95 - lastWild.p5) > (lastCalm.p95 - lastCalm.p5),
    "higher vol must produce a wider fan at the final step",
  );
});

Deno.test("[price-fan] empty seedKey falls back to derived seed and is deterministic", () => {
  const a = priceFan(100, 0.2, 0.05, 3, 60, 100, "");
  const b = priceFan(100, 0.2, 0.05, 3, 60, 100, "");
  assertEquals(a, b);
});
