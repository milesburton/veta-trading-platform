// fallow-ignore-file unused-file
import { assertEquals } from "jsr:@std/assert@0.217";
import { PlatformStats } from "../gateway/platform-stats.ts";

Deno.test("PlatformStats counts alerts by severity", () => {
  const s = new PlatformStats();
  s.recordAlert({ severity: "CRITICAL", source: "x", message: "m", ts: Date.now() });
  s.recordAlert({ severity: "WARNING", source: "x", message: "m", ts: Date.now() });
  s.recordAlert({ severity: "WARNING", source: "x", message: "m", ts: Date.now() });
  s.recordAlert({ severity: "INFO", source: "x", message: "m", ts: Date.now() });
  const snap = s.snapshot();
  assertEquals(snap.alertsBySeverity.CRITICAL, 1);
  assertEquals(snap.alertsBySeverity.WARNING, 2);
  assertEquals(snap.alertsBySeverity.INFO, 1);
});

Deno.test("PlatformStats prunes events older than 24h", () => {
  const s = new PlatformStats();
  const now = Date.now();
  s.recordAlert({
    severity: "CRITICAL",
    source: "x",
    message: "old",
    ts: now - 25 * 60 * 60 * 1000,
  });
  s.recordAlert({ severity: "CRITICAL", source: "x", message: "fresh", ts: now });
  const snap = s.snapshot();
  assertEquals(snap.alertsBySeverity.CRITICAL, 1);
  assertEquals(snap.lastCritical?.message, "fresh");
});

Deno.test("PlatformStats lastCritical is most recent CRITICAL", () => {
  const s = new PlatformStats();
  const now = Date.now();
  s.recordAlert({ severity: "CRITICAL", source: "x", message: "first", ts: now - 60_000 });
  s.recordAlert({ severity: "WARNING", source: "x", message: "warn", ts: now - 30_000 });
  s.recordAlert({ severity: "CRITICAL", source: "x", message: "later", ts: now - 10_000 });
  const snap = s.snapshot();
  assertEquals(snap.lastCritical?.message, "later");
});

Deno.test("PlatformStats counts unique bug reporters", () => {
  const s = new PlatformStats();
  s.recordBug({ title: "a", userId: "alice", ts: Date.now() });
  s.recordBug({ title: "b", userId: "alice", ts: Date.now() });
  s.recordBug({ title: "c", userId: "bob", ts: Date.now() });
  const snap = s.snapshot();
  assertEquals(snap.bugReports, 3);
  assertEquals(snap.uniqueBugReporters, 2);
});

Deno.test("PlatformStats serviceUpRatio is mean of snapshot ratios", () => {
  const s = new PlatformStats();
  s.recordServiceSnapshot(32, 32);
  s.recordServiceSnapshot(28, 32);
  s.recordServiceSnapshot(32, 32);
  const snap = s.snapshot();
  if (snap.serviceUpRatio === null) throw new Error("expected ratio");
  // (1 + 28/32 + 1) / 3 = 0.9583
  const expected = (1 + 28 / 32 + 1) / 3;
  if (Math.abs(snap.serviceUpRatio - expected) > 0.001) {
    throw new Error(`expected ${expected}, got ${snap.serviceUpRatio}`);
  }
  if (snap.worstServiceUpRatio !== 28 / 32) {
    throw new Error(`expected worst ${28 / 32}, got ${snap.worstServiceUpRatio}`);
  }
});

Deno.test("PlatformStats serviceUpRatio is null when no snapshots", () => {
  const s = new PlatformStats();
  const snap = s.snapshot();
  assertEquals(snap.serviceUpRatio, null);
  assertEquals(snap.worstServiceUpRatio, null);
});

Deno.test("PlatformStats setDeploySha surfaces in snapshot", () => {
  const s = new PlatformStats();
  s.setDeploySha("deadbeef1234");
  const snap = s.snapshot();
  assertEquals(snap.lastDeploySha, "deadbeef1234");
});

Deno.test("PlatformStats snapshot(now) re-prunes using the supplied now", () => {
  const s = new PlatformStats();
  const now = Date.now();
  s.recordAlert({ severity: "CRITICAL", source: "x", message: "earlier", ts: now });
  s.recordAlert({
    severity: "CRITICAL",
    source: "x",
    message: "later",
    ts: now + 6 * 60 * 60 * 1000,
  });
  const futureNow = now + 25 * 60 * 60 * 1000;
  const snap = s.snapshot(futureNow);
  assertEquals(snap.alertsBySeverity.CRITICAL, 1);
  assertEquals(snap.lastCritical?.message, "later");
});

Deno.test("PlatformStats event at exact cutoff is included (>= boundary)", () => {
  const s = new PlatformStats();
  const now = Date.now();
  s.recordAlert({ severity: "CRITICAL", source: "x", message: "fresh", ts: now });
  const exactlyAtBoundary = now + 24 * 60 * 60 * 1000;
  const snap = s.snapshot(exactlyAtBoundary);
  assertEquals(snap.alertsBySeverity.CRITICAL, 1);
  assertEquals(snap.lastCritical?.message, "fresh");
});

Deno.test("PlatformStats serviceUpRatio treats total=0 snapshots as 100% up", () => {
  const s = new PlatformStats();
  s.recordServiceSnapshot(0, 0);
  s.recordServiceSnapshot(8, 10);
  const snap = s.snapshot();
  if (snap.serviceUpRatio === null) throw new Error("expected ratio");
  const expected = (1 + 0.8) / 2;
  if (Math.abs(snap.serviceUpRatio - expected) > 0.001) {
    throw new Error(`expected ${expected}, got ${snap.serviceUpRatio}`);
  }
  assertEquals(snap.worstServiceUpRatio, 0.8);
});

Deno.test("PlatformStats deploy SHA can be updated mid-window", () => {
  const s = new PlatformStats();
  s.setDeploySha("aaaa1111");
  s.recordAlert({ severity: "CRITICAL", source: "x", message: "before", ts: Date.now() });
  s.setDeploySha("bbbb2222");
  const snap = s.snapshot();
  assertEquals(snap.lastDeploySha, "bbbb2222");
});
