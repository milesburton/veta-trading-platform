import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { type AbuseConfig, AbuseTracker } from "../gateway/abuse-tracker.ts";

const TIGHT: AbuseConfig = {
  perSocketThreshold: 3,
  perSocketWindowMs: 1_000,
  userForceCloseThreshold: 2,
  userWindowMs: 5_000,
  userBackoffMs: 10_000,
};

function fakeSocket(): object {
  return { tag: Math.random() };
}

Deno.test("under per-socket threshold returns ok", () => {
  const tracker = new AbuseTracker(TIGHT);
  const sock = fakeSocket();
  assertEquals(tracker.recordRateLimited(sock, "alice", 1000).kind, "ok");
  assertEquals(tracker.recordRateLimited(sock, "alice", 1100).kind, "ok");
});

Deno.test("hitting per-socket threshold returns forceClose", () => {
  const tracker = new AbuseTracker(TIGHT);
  const sock = fakeSocket();
  tracker.recordRateLimited(sock, "alice", 1000);
  tracker.recordRateLimited(sock, "alice", 1100);
  const d = tracker.recordRateLimited(sock, "alice", 1200);
  assertEquals(d.kind, "forceClose");
});

Deno.test("rate-limited frames outside the window do not count", () => {
  const tracker = new AbuseTracker(TIGHT);
  const sock = fakeSocket();
  tracker.recordRateLimited(sock, "alice", 1000);
  tracker.recordRateLimited(sock, "alice", 1100);
  // 2_500 is 1_500ms after the second event, outside the 1s window
  const d = tracker.recordRateLimited(sock, "alice", 2_500);
  assertEquals(d.kind, "ok");
});

Deno.test("force-closes are counted per user across sockets", () => {
  const tracker = new AbuseTracker(TIGHT);
  for (let i = 0; i < 3; i++) {
    const sock = fakeSocket();
    tracker.recordRateLimited(sock, "alice", 1000 + i);
    tracker.recordRateLimited(sock, "alice", 1100 + i);
    tracker.recordRateLimited(sock, "alice", 1200 + i);
  }
  // After three force-closes (>= 2 threshold), user should be blocked.
  const decision = tracker.upgradeDecision("alice", 1500);
  assertEquals(decision.kind, "blockUser");
});

Deno.test("user backoff expires after userBackoffMs", () => {
  const tracker = new AbuseTracker(TIGHT);
  for (let i = 0; i < 2; i++) {
    const sock = fakeSocket();
    tracker.recordRateLimited(sock, "alice", 1000 + i);
    tracker.recordRateLimited(sock, "alice", 1100 + i);
    tracker.recordRateLimited(sock, "alice", 1200 + i);
  }
  // Block was set at ~1202ms with userBackoffMs=10_000, so until ~11202
  assert(tracker.upgradeDecision("alice", 5_000).kind === "blockUser");
  assertEquals(tracker.upgradeDecision("alice", 15_000).kind, "ok");
});

Deno.test("user with no history is not blocked", () => {
  const tracker = new AbuseTracker(TIGHT);
  assertEquals(tracker.upgradeDecision("never-seen", 1000).kind, "ok");
  assertEquals(tracker.upgradeDecision(null, 1000).kind, "ok");
});

Deno.test("anonymous sockets share a single user bucket", () => {
  const tracker = new AbuseTracker(TIGHT);
  // Trigger two force-closes against anon sockets — should now block anon.
  for (let i = 0; i < 2; i++) {
    const sock = fakeSocket();
    tracker.recordRateLimited(sock, null, 1000 + i * 10);
    tracker.recordRateLimited(sock, null, 1010 + i * 10);
    tracker.recordRateLimited(sock, null, 1020 + i * 10);
  }
  assertEquals(tracker.upgradeDecision(null, 1500).kind, "blockUser");
});

Deno.test("authenticated user's force-closes do not affect anonymous", () => {
  const tracker = new AbuseTracker(TIGHT);
  for (let i = 0; i < 3; i++) {
    const sock = fakeSocket();
    tracker.recordRateLimited(sock, "alice", 1000 + i);
    tracker.recordRateLimited(sock, "alice", 1100 + i);
    tracker.recordRateLimited(sock, "alice", 1200 + i);
  }
  assertEquals(tracker.upgradeDecision("alice", 1500).kind, "blockUser");
  assertEquals(tracker.upgradeDecision(null, 1500).kind, "ok");
});

Deno.test("old force-closes age out of the user window", () => {
  const tracker = new AbuseTracker(TIGHT);
  // One force-close at t=1000, second at t=10_000 (outside 5s window from t=1000)
  for (let pass = 0; pass < 2; pass++) {
    const sock = fakeSocket();
    const t = pass === 0 ? 1000 : 10_000;
    tracker.recordRateLimited(sock, "alice", t);
    tracker.recordRateLimited(sock, "alice", t + 50);
    const last = tracker.recordRateLimited(sock, "alice", t + 100);
    // Each pass should only have 1 force-close in window, not 2.
    assertEquals(last.kind, "forceClose");
  }
});

Deno.test("forgetSocket prevents memory growth", () => {
  const tracker = new AbuseTracker(TIGHT);
  const sock = fakeSocket();
  tracker.recordRateLimited(sock, "alice", 1000);
  tracker.forgetSocket(sock);
  // Recording on the same socket again should start from empty state.
  const d = tracker.recordRateLimited(sock, "alice", 1100);
  assertEquals(d.kind, "ok");
});
