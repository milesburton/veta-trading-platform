import {
  assert,
  assertAlmostEquals,
  assertGreater,
  assertGreaterOrEqual,
  assertLess,
} from "jsr:@std/assert@0.217";
import {
  blackScholes,
  normCdf,
  normPdf,
} from "../analytics/black-scholes.ts";

Deno.test("[black-scholes] normCdf at 0 is 0.5", () => {
  assertAlmostEquals(normCdf(0), 0.5, 1e-7);
});

Deno.test("[black-scholes] normCdf is symmetric: N(-x) + N(x) = 1", () => {
  for (const x of [0.1, 0.5, 1.0, 2.0, 3.0]) {
    assertAlmostEquals(normCdf(-x) + normCdf(x), 1, 1e-6);
  }
});

Deno.test("[black-scholes] normCdf is monotonically increasing and bounded by [0,1]", () => {
  let prev = -Infinity;
  for (const x of [-3, -2, -1, 0, 1, 2, 3]) {
    const v = normCdf(x);
    assert(v >= 0 && v <= 1, `normCdf(${x}) = ${v} outside [0,1]`);
    assertGreaterOrEqual(v, prev);
    prev = v;
  }
});

Deno.test("[black-scholes] normCdf matches known values within Abramowitz approx error (<1e-7)", () => {
  assertAlmostEquals(normCdf(1), 0.8413447, 1e-6);
  assertAlmostEquals(normCdf(2), 0.9772499, 1e-6);
  assertAlmostEquals(normCdf(-1.96), 0.025, 1e-3);
});

Deno.test("[black-scholes] normPdf at 0 is 1/sqrt(2π)", () => {
  assertAlmostEquals(normPdf(0), 1 / Math.sqrt(2 * Math.PI), 1e-9);
});

Deno.test("[black-scholes] normPdf is symmetric: φ(-x) = φ(x)", () => {
  for (const x of [0.1, 0.5, 1, 2]) {
    assertAlmostEquals(normPdf(-x), normPdf(x), 1e-12);
  }
});

Deno.test("[black-scholes] put-call parity: C - P = S - K e^{-rT}", () => {
  const S = 100, K = 100, T = 1, r = 0.05, sigma = 0.2;
  const call = blackScholes("call", S, K, T, r, sigma).price;
  const put = blackScholes("put", S, K, T, r, sigma).price;
  const parity = S - K * Math.exp(-r * T);
  assertAlmostEquals(call - put, parity, 1e-8);
});

Deno.test("[black-scholes] put-call parity holds for ITM, ATM, OTM", () => {
  for (const S of [80, 100, 120]) {
    const call = blackScholes("call", S, 100, 0.5, 0.04, 0.25).price;
    const put = blackScholes("put", S, 100, 0.5, 0.04, 0.25).price;
    const parity = S - 100 * Math.exp(-0.04 * 0.5);
    assertAlmostEquals(call - put, parity, 1e-8);
  }
});

Deno.test("[black-scholes] T=0 returns intrinsic value (call ITM)", () => {
  const r = blackScholes("call", 110, 100, 0, 0.05, 0.2);
  assertAlmostEquals(r.price, 10, 1e-9);
  assertAlmostEquals(r.greeks.delta, 1, 1e-9);
  assertAlmostEquals(r.greeks.gamma, 0, 1e-9);
});

Deno.test("[black-scholes] T=0 returns intrinsic value (put ITM)", () => {
  const r = blackScholes("put", 90, 100, 0, 0.05, 0.2);
  assertAlmostEquals(r.price, 10, 1e-9);
  assertAlmostEquals(r.greeks.delta, -1, 1e-9);
});

Deno.test("[black-scholes] T=0 OTM returns 0 with delta 0", () => {
  const r = blackScholes("call", 90, 100, 0, 0.05, 0.2);
  assertAlmostEquals(r.price, 0, 1e-9);
  assertAlmostEquals(r.greeks.delta, 0, 1e-9);
});

Deno.test("[black-scholes] σ=0 returns intrinsic value", () => {
  const r = blackScholes("call", 110, 100, 1, 0.05, 0);
  assertAlmostEquals(r.price, 10, 1e-9);
});

Deno.test("[black-scholes] negative S or K returns intrinsic via guard", () => {
  const r = blackScholes("call", -1, 100, 1, 0.05, 0.2);
  assertAlmostEquals(r.price, 0, 1e-9);
});

Deno.test("[black-scholes] call delta is between 0 and 1; put delta is between -1 and 0", () => {
  const callDelta = blackScholes("call", 100, 100, 1, 0.05, 0.2).greeks.delta;
  const putDelta = blackScholes("put", 100, 100, 1, 0.05, 0.2).greeks.delta;
  assertGreater(callDelta, 0);
  assertLess(callDelta, 1);
  assertLess(putDelta, 0);
  assertGreater(putDelta, -1);
});

Deno.test("[black-scholes] gamma and vega are equal across call and put (parity)", () => {
  const c = blackScholes("call", 100, 100, 1, 0.05, 0.2).greeks;
  const p = blackScholes("put", 100, 100, 1, 0.05, 0.2).greeks;
  assertAlmostEquals(c.gamma, p.gamma, 1e-9);
  assertAlmostEquals(c.vega, p.vega, 1e-9);
});

Deno.test("[black-scholes] deep ITM call has delta near 1; deep OTM call has delta near 0", () => {
  const itm = blackScholes("call", 200, 100, 1, 0.05, 0.2).greeks.delta;
  const otm = blackScholes("call", 50, 100, 1, 0.05, 0.2).greeks.delta;
  assertGreater(itm, 0.95);
  assertLess(otm, 0.05);
});

Deno.test("[black-scholes] price increases with volatility (vega > 0)", () => {
  const lowVol = blackScholes("call", 100, 100, 1, 0.05, 0.1).price;
  const highVol = blackScholes("call", 100, 100, 1, 0.05, 0.4).price;
  assertGreater(highVol, lowVol);
});

Deno.test("[black-scholes] price decreases with time decay for ATM (theta < 0)", () => {
  const theta = blackScholes("call", 100, 100, 1, 0.05, 0.2).greeks.theta;
  assertLess(theta, 0);
});

Deno.test("[black-scholes] ATM call price agrees with Brenner-Subrahmanyam approximation for small T", () => {
  const S = 100, sigma = 0.2, T = 0.25;
  const approx = S * sigma * Math.sqrt(T) / Math.sqrt(2 * Math.PI);
  const exact = blackScholes("call", S, S, T, 0, sigma).price;
  assertAlmostEquals(exact, approx, 0.01);
});
