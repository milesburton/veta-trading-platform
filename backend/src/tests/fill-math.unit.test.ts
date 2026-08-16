import { assertEquals } from "jsr:@std/assert@0.217";
import { computeFill } from "../fix/fill-math.ts";

Deno.test("[fix/fill-math] filled qty capped at participation cap × tick volume", () => {
  const result = computeFill(10_000, "BUY", 100, 1_000, 0.2, 1.0);
  assertEquals(result.filledQty, Math.floor(1_000 * 0.2));
  assertEquals(result.remainingQty, 10_000 - result.filledQty);
});

Deno.test("[fix/fill-math] full fill when requested qty is within cap", () => {
  const result = computeFill(50, "BUY", 100, 1_000, 0.2, 1.0);
  assertEquals(result.filledQty, 50);
  assertEquals(result.remainingQty, 0);
});

Deno.test("[fix/fill-math] BUY impact pushes average fill price up", () => {
  const result = computeFill(200, "BUY", 100, 1_000, 0.2, 1.0);
  assertEquals(result.filledQty, 200);
  assertEquals(result.avgFillPrice > 100, true);
});

Deno.test("[fix/fill-math] SELL impact pushes average fill price down", () => {
  const result = computeFill(200, "SELL", 100, 1_000, 0.2, 1.0);
  assertEquals(result.filledQty, 200);
  assertEquals(result.avgFillPrice < 100, true);
});

Deno.test("[fix/fill-math] zero tick volume yields zero fill", () => {
  const result = computeFill(100, "BUY", 100, 0, 0.2, 1.0);
  assertEquals(result.filledQty, 0);
  assertEquals(result.remainingQty, 100);
});

Deno.test("[fix/fill-math] marketImpactBps scales linearly with filled qty", () => {
  const small = computeFill(1_000, "BUY", 100, 100_000, 1, 2.0);
  const large = computeFill(2_000, "BUY", 100, 100_000, 1, 2.0);
  assertEquals(large.marketImpactBps, small.marketImpactBps * 2);
});
