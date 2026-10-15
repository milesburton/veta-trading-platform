import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { nextDelayMs } from "../synthetic-trader/pacing.ts";

test("[synthetic-trader-pacing] delay is always within [min, max]", () => {
  for (let i = 0; i < 200; i++) {
    const delay = nextDelayMs(30_000, 480_000);
    assert(delay >= 30_000 && delay <= 480_000, `delay ${delay} out of bounds`);
  }
});

test("[synthetic-trader-pacing] delay is not degenerate (min random returns min, max random returns max)", () => {
  assertEquals(nextDelayMs(30_000, 480_000, () => 0), 30_000);
  assertEquals(nextDelayMs(30_000, 480_000, () => 1), 480_000);
});

test("[synthetic-trader-pacing] defaults min==max to a fixed delay", () => {
  assertEquals(nextDelayMs(60_000, 60_000), 60_000);
});
