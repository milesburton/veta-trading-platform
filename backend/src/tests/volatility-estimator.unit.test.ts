import { assertEquals } from "jsr:@std/assert@0.217";
import { computeVol } from "../analytics/volatility-estimator.ts";

Deno.test("computeVol - basic functionality", () => {
  const closes = [100, 105, 102, 108, 110];
  const timestamps = [1, 2, 3, 4, 5];
  const result = computeVol(closes, timestamps);

  assertEquals(typeof result, "object");
  assertEquals("ewmaVol" in result, true);
  assertEquals("rollingVol" in result, true);
  assertEquals("ewmaSeries" in result, true);
});
