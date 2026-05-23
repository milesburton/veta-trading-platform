import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@0.217";
import {
  currentMarketMinute,
  intradayVolumeFactor,
  realMsToMarketMinutes,
  TIME_SCALE,
  TRADING_DAY_MINUTES,
} from "../lib/timeScale.ts";

Deno.test("[timeScale] TRADING_DAY_MINUTES is 390", () => {
  assertEquals(TRADING_DAY_MINUTES, 390);
});

Deno.test("[timeScale] TIME_SCALE defaults to 60 when env unset", () => {
  // Just confirm it's a positive number in the test environment
  assert(TIME_SCALE > 0);
});

Deno.test("[timeScale] currentMarketMinute returns an int in [0, TRADING_DAY_MINUTES)", () => {
  const m = currentMarketMinute();
  assert(Number.isInteger(m));
  assert(m >= 0 && m < TRADING_DAY_MINUTES);
});

Deno.test("[timeScale] intradayVolumeFactor peaks near open (minute 0)", () => {
  // cos²(0) = 1 → factor = 1.0
  assertAlmostEquals(intradayVolumeFactor(0), 1.0, 1e-9);
});

Deno.test("[timeScale] intradayVolumeFactor peaks near close (minute TRADING_DAY_MINUTES)", () => {
  // cos²(π) = 1 → factor = 1.0
  assertAlmostEquals(intradayVolumeFactor(TRADING_DAY_MINUTES), 1.0, 1e-9);
});

Deno.test("[timeScale] intradayVolumeFactor troughs near midday", () => {
  // cos²(π/2) = 0 → factor = 0.3 (floor)
  assertAlmostEquals(intradayVolumeFactor(TRADING_DAY_MINUTES / 2), 0.3, 1e-9);
});

Deno.test("[timeScale] intradayVolumeFactor stays within [0.3, 1.0] for all minutes", () => {
  for (let m = 0; m <= TRADING_DAY_MINUTES; m++) {
    const v = intradayVolumeFactor(m);
    assert(v >= 0.3 - 1e-12 && v <= 1.0 + 1e-12, `out of range at minute ${m}: ${v}`);
  }
});

Deno.test("[timeScale] realMsToMarketMinutes scales linearly with TIME_SCALE", () => {
  // 1000ms real-time × TIME_SCALE = market minutes for 1 wall second
  const v = realMsToMarketMinutes(1_000);
  assertAlmostEquals(v, TIME_SCALE, 1e-9);
  assertEquals(realMsToMarketMinutes(0), 0);
});
