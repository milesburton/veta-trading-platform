import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { cancellationApplies, createCancellationTracker } from "./cancellation-tracker.ts";

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

test("[cancellation-tracker] expires on lookup without another record call", () => {
  let clock = 0;
  const tracker = createCancellationTracker(() => clock, 1000);
  tracker.record(["o1"]);
  clock = 999;
  assertEquals(tracker.isCancelled(["o1"]), true);
  clock = 1001;
  assertEquals(tracker.isCancelled(["o1"]), false);
  assertEquals(tracker.size(), 0);
});

test("[cancellation-tracker] keeps live tombstones past the capacity limit and reports it", () => {
  const tracker = createCancellationTracker(() => 0, 1000, 3);
  tracker.record(["a", "b"]);
  assertEquals(tracker.overCapacity(), false);
  tracker.record(["c", "d", "e"]);
  assertEquals(tracker.size(), 5);
  assertEquals(tracker.overCapacity(), true);
  assertEquals(tracker.isCancelled(["a"]), true);
});

test("[cancellation-tracker] re-recording an id refreshes its ttl", () => {
  let clock = 0;
  const tracker = createCancellationTracker(() => clock, 1000);
  tracker.record(["o1"]);
  clock = 800;
  tracker.record(["o1"]);
  clock = 1500;
  assertEquals(tracker.isCancelled(["o1"]), true);
});

test("[cancellation-tracker] returns the recorded details on lookup", () => {
  const tracker = createCancellationTracker(() => 5);
  tracker.record(["o1"], { ownerId: "u1", issuedBy: "admin-1", issuedByRole: "admin" });
  assertEquals(tracker.lookup(["o1"]), {
    at: 5,
    ownerId: "u1",
    issuedBy: "admin-1",
    issuedByRole: "admin",
  });
});

test("[cancellation-tracker] a cancellation only applies to the owner unless a privileged role issued it", () => {
  const child = { userId: "u1" };
  assertEquals(cancellationApplies({ at: 0, ownerId: "u1" }, child), true);
  assertEquals(cancellationApplies({ at: 0, ownerId: "u2" }, child), false);
  assertEquals(cancellationApplies({ at: 0, issuedBy: "u1", issuedByRole: "trader" }, child), true);
  assertEquals(
    cancellationApplies({ at: 0, issuedBy: "u2", issuedByRole: "trader" }, child),
    false
  );
  assertEquals(
    cancellationApplies({ at: 0, issuedBy: "r1", issuedByRole: "risk-manager" }, child),
    true
  );
  assertEquals(cancellationApplies({ at: 0 }, child), true);
});
