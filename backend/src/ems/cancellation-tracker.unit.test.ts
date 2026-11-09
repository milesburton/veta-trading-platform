import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { createCancellationTracker } from "./cancellation-tracker.ts";

test("[cancellation-tracker] flags children by order id or client order id", () => {
  const tracker = createCancellationTracker();
  tracker.record(["o1", "c-1", undefined]);
  assertEquals(tracker.isCancelled(["o1"]), true);
  assertEquals(tracker.isCancelled([undefined, "c-1"]), true);
  assertEquals(tracker.isCancelled(["o2", undefined]), false);
  assertEquals(tracker.size(), 2);
});

test("[cancellation-tracker] forgets cancellations after the ttl", () => {
  let clock = 0;
  const tracker = createCancellationTracker(() => clock, 1000);
  tracker.record(["old"]);
  clock = 1500;
  tracker.record(["new"]);
  assertEquals(tracker.isCancelled(["old"]), false);
  assertEquals(tracker.isCancelled(["new"]), true);
});
