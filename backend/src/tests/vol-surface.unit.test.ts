import { test } from "#veta/test";
import { assert, assertAlmostEquals, assertEquals } from "#veta/test-assert";
import { buildVolSurface } from "../analytics/vol-surface.ts";

test("[vol-surface] surface has 45 points", () => {
  const result = buildVolSurface("AAPL", 189.3, 0.25);

  assertEquals(result.surface.length, 45);
  assertEquals(result.expiries.length, 5);
  assertEquals(result.moneynesses.length, 9);
});

test("[vol-surface] ATM points stay anchored to ATM vol", () => {
  const result = buildVolSurface("AAPL", 189.3, 0.25);
  const atmPoints = result.surface.filter((point) => point.moneyness === 1.0);

  assertEquals(atmPoints.length, 5);
  for (const point of atmPoints) {
    assertAlmostEquals(point.impliedVol, 0.25, 1e-10);
    assert(point.strike > 0);
  }
});
