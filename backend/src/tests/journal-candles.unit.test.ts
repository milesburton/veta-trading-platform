import { assertEquals } from "jsr:@std/assert@0.217";
import { candleFromRow } from "../journal/candles.ts";

Deno.test("[journal-candles] decodes float8 strings from the driver as numbers", () => {
  const time = new Date("2026-10-09T13:30:00Z");
  assertEquals(candleFromRow([time, "190.1643", "190.17", "190.0717", "190.0961", "23012.93"]), {
    time: time.getTime(),
    open: 190.1643,
    high: 190.17,
    low: 190.0717,
    close: 190.0961,
    volume: 23012.93,
  });
});

Deno.test("[journal-candles] treats a missing volume as zero", () => {
  assertEquals(candleFromRow([0, 1, 1, 1, 1, null]).volume, 0);
});
