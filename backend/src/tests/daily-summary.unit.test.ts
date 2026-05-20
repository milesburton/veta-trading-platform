// fallow-ignore-file unused-file
import { assertEquals } from "jsr:@std/assert@0.217";
import { buildDailySummary, startDailySummary } from "../gateway/daily-summary.ts";
import { PlatformStats } from "../gateway/platform-stats.ts";

function ctx(stats: PlatformStats, services: Record<string, boolean> | null = { gateway: true }) {
  return {
    version: "abc1234deadbeef",
    environment: "prod",
    startedAt: Date.now() - 5 * 60 * 60 * 1000,
    getStats: () => stats.snapshot(),
    getServices: () => services,
  };
}

Deno.test("buildDailySummary header: ✅ when worst window is 100%", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(32, 32);
  const msg = buildDailySummary(ctx(stats));
  if (!msg.startsWith("✅")) throw new Error(`expected ✅ start, got: ${msg.slice(0, 20)}`);
  if (!msg.includes("`abc1234`")) throw new Error("expected short SHA in header");
  if (!msg.includes("(prod)")) throw new Error("expected env in header");
});

Deno.test("buildDailySummary header: ⚠️ when worst window 95-99.9%", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(31, 32);
  const msg = buildDailySummary(ctx(stats));
  if (!msg.startsWith("⚠️")) throw new Error(`expected ⚠️ start, got: ${msg.slice(0, 20)}`);
});

Deno.test("buildDailySummary header: 🚨 when worst window below 95%", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(20, 32);
  const msg = buildDailySummary(ctx(stats));
  if (!msg.startsWith("🚨")) throw new Error(`expected 🚨 start, got: ${msg.slice(0, 20)}`);
});

Deno.test("buildDailySummary lists no alerts when none recorded", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(32, 32);
  const msg = buildDailySummary(ctx(stats));
  if (!msg.includes("Alerts (last 24h):** none")) {
    throw new Error("expected no-alerts line");
  }
});

Deno.test("buildDailySummary breaks down alerts by severity", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(32, 32);
  stats.recordAlert({ severity: "CRITICAL", source: "risk", message: "limit breach", ts: Date.now() });
  stats.recordAlert({ severity: "WARNING", source: "ws", message: "ws hiccup", ts: Date.now() });
  stats.recordAlert({ severity: "WARNING", source: "ws", message: "ws hiccup 2", ts: Date.now() });
  const msg = buildDailySummary(ctx(stats));
  if (!msg.includes("3 total")) throw new Error("expected total count");
  if (!msg.includes("critical: 1")) throw new Error("expected critical count");
  if (!msg.includes("warning: 2")) throw new Error("expected warning count");
  if (!msg.includes("Last critical")) throw new Error("expected last-critical line");
});

Deno.test("buildDailySummary lists down services in 'now' line", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(31, 32);
  const msg = buildDailySummary(ctx(stats, { gateway: true, oms: false, ems: true }));
  if (!msg.includes("🔴 oms")) throw new Error("expected down-services line including oms");
});

Deno.test("buildDailySummary lists bug counts with unique reporter count", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(32, 32);
  stats.recordBug({ title: "x", userId: "alice", ts: Date.now() });
  stats.recordBug({ title: "y", userId: "alice", ts: Date.now() });
  stats.recordBug({ title: "z", userId: "bob", ts: Date.now() });
  const msg = buildDailySummary(ctx(stats));
  if (!msg.includes("3 from 2 users")) {
    throw new Error("expected '3 from 2 users' in bug line");
  }
});

Deno.test("startDailySummary schedules next fire at 09:00 UTC", () => {
  // Force a "now" of 2026-05-20T05:00:00 UTC
  const baseNow = Date.UTC(2026, 4, 20, 5, 0, 0);
  let calls = 0;
  const h = startDailySummary({
    version: "v",
    environment: "test",
    startedAt: baseNow - 1000,
    getStats: () => new PlatformStats().snapshot(),
    getServices: () => null,
    hourUtc: 9,
    sender: () => Promise.resolve((calls++, true)),
    now: () => baseNow,
  });
  const nextFire = h.nextFireAt();
  h.stop();
  const expected = Date.UTC(2026, 4, 20, 9, 0, 0);
  assertEquals(nextFire, expected);
  assertEquals(calls, 0);
});

Deno.test("startDailySummary nextFire rolls over to tomorrow if past today's hour", () => {
  // Force a now of 2026-05-20T14:30:00 UTC
  const baseNow = Date.UTC(2026, 4, 20, 14, 30, 0);
  const h = startDailySummary({
    version: "v",
    environment: "test",
    startedAt: baseNow - 1000,
    getStats: () => new PlatformStats().snapshot(),
    getServices: () => null,
    hourUtc: 9,
    sender: () => Promise.resolve(true),
    now: () => baseNow,
  });
  const nextFire = h.nextFireAt();
  h.stop();
  const expected = Date.UTC(2026, 4, 21, 9, 0, 0);
  assertEquals(nextFire, expected);
});
