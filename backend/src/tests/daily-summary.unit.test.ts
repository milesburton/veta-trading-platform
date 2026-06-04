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

function expectHeaderPrefix(stats: PlatformStats, expected: string, detail: string): void {
  const msg = buildDailySummary(ctx(stats));
  if (!msg.startsWith(expected)) {
    throw new Error(`${detail}, got: ${msg.slice(0, 20)}`);
  }
}

Deno.test("buildDailySummary header: ✅ when worst window is 100%", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(32, 32);
  const msg = buildDailySummary(ctx(stats));
  if (!msg.startsWith("✅")) {
    throw new Error(`expected ✅ start, got: ${msg.slice(0, 20)}`);
  }
  if (!msg.includes("`abc1234`")) {
    throw new Error("expected short SHA in header");
  }
  if (!msg.includes("(prod)")) throw new Error("expected env in header");
});

Deno.test("buildDailySummary header: ⚠️ when worst window below 100% but at-or-above 95%", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(31, 32);
  expectHeaderPrefix(stats, "⚠️", "expected ⚠️ start");
});

Deno.test("buildDailySummary header: ⚠️ when worst window is exactly 99.9% (not ✅)", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(999, 1000);
  expectHeaderPrefix(stats, "⚠️", "expected ⚠️ at 99.9%");
});

Deno.test("buildDailySummary header: ⚠️ at exactly 95% (boundary)", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(95, 100);
  expectHeaderPrefix(stats, "⚠️", "expected ⚠️ at 95%");
});

Deno.test("buildDailySummary header: 🚨 just below 95%", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(94, 100);
  const msg = buildDailySummary(ctx(stats));
  if (!msg.startsWith("🚨")) {
    throw new Error(`expected 🚨 below 95%, got: ${msg.slice(0, 20)}`);
  }
});

Deno.test("buildDailySummary header: 🚨 when worst window below 95%", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(20, 32);
  const msg = buildDailySummary(ctx(stats));
  if (!msg.startsWith("🚨")) {
    throw new Error(`expected 🚨 start, got: ${msg.slice(0, 20)}`);
  }
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
  stats.recordAlert({
    severity: "CRITICAL",
    source: "risk",
    message: "limit breach",
    ts: Date.now(),
  });
  stats.recordAlert({
    severity: "WARNING",
    source: "ws",
    message: "ws hiccup",
    ts: Date.now(),
  });
  stats.recordAlert({
    severity: "WARNING",
    source: "ws",
    message: "ws hiccup 2",
    ts: Date.now(),
  });
  const msg = buildDailySummary(ctx(stats));
  if (!msg.includes("3 total")) throw new Error("expected total count");
  if (!msg.includes("critical: 1")) throw new Error("expected critical count");
  if (!msg.includes("warning: 2")) throw new Error("expected warning count");
  if (!msg.includes("Last critical")) {
    throw new Error("expected last-critical line");
  }
});

Deno.test("buildDailySummary surfaces unknown-severity alerts in the breakdown", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(32, 32);
  stats.recordAlert({
    severity: "UNKNOWN",
    source: "x",
    message: "weird",
    ts: Date.now(),
  });
  stats.recordAlert({
    severity: "DEBUG",
    source: "x",
    message: "trace",
    ts: Date.now(),
  });
  const msg = buildDailySummary(ctx(stats));
  if (!msg.includes("2 total")) {
    throw new Error("expected total to include all severities");
  }
  if (!msg.includes("unknown: 1")) {
    throw new Error("expected unknown shown in breakdown");
  }
  if (!msg.includes("debug: 1")) {
    throw new Error("expected debug shown in breakdown");
  }
});

Deno.test("buildDailySummary lists down services in 'now' line", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(31, 32);
  const msg = buildDailySummary(ctx(stats, { gateway: true, oms: false, ems: true }));
  if (!msg.includes("🔴 oms")) {
    throw new Error("expected down-services line including oms");
  }
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
  const baseNow = Date.UTC(2026, 4, 20, 5, 0, 0);
  let calls = 0;
  const h = startDailySummary({
    version: "v",
    environment: "test",
    startedAt: baseNow - 1000,
    getStats: () => new PlatformStats().snapshot(),
    getServices: () => null,
    hourUtc: 9,
    sender: () => {
      calls++;
      return Promise.resolve(true);
    },
    now: () => baseNow,
  });
  const nextFire = h.nextFireAt();
  h.stop();
  const expected = Date.UTC(2026, 4, 20, 9, 0, 0);
  assertEquals(nextFire, expected);
  assertEquals(calls, 0);
});

Deno.test("startDailySummary nextFire rolls over to tomorrow if past today's hour", () => {
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

Deno.test("buildDailySummary uptime formats <1h as Nm only", () => {
  const stats = new PlatformStats();
  const baseNow = 1_700_000_000_000;
  const c = {
    version: "v",
    environment: "test",
    startedAt: baseNow - 45 * 60 * 1000,
    getStats: () => stats.snapshot(baseNow),
    getServices: () => null,
  };
  const msg = buildDailySummary(c, baseNow);
  if (!msg.includes("gateway uptime 45m")) {
    throw new Error(`got: ${msg.split("\n")[0]}`);
  }
});

Deno.test("buildDailySummary uptime formats >=1d as Nd Nh Nm", () => {
  const stats = new PlatformStats();
  const baseNow = 1_700_000_000_000;
  const c = {
    version: "v",
    environment: "test",
    startedAt: baseNow - (2 * 86400 + 3 * 3600 + 7 * 60) * 1000,
    getStats: () => stats.snapshot(baseNow),
    getServices: () => null,
  };
  const msg = buildDailySummary(c, baseNow);
  if (!msg.includes("gateway uptime 2d 3h 7m")) {
    throw new Error(`got: ${msg.split("\n")[0]}`);
  }
});

Deno.test("buildDailySummary 'no samples in window yet' path when no service snapshots", () => {
  const stats = new PlatformStats();
  const msg = buildDailySummary(ctx(stats, null));
  if (!msg.includes("**Services:** no samples in window yet")) {
    throw new Error(`expected no-samples line, got:\n${msg}`);
  }
});

Deno.test("buildDailySummary includes Deployed SHA when setDeploySha was called", () => {
  const stats = new PlatformStats();
  stats.setDeploySha("deadbeef1234567");
  stats.recordServiceSnapshot(10, 10);
  const msg = buildDailySummary(ctx(stats));
  if (!msg.includes("**Deployed SHA:** `deadbee`")) {
    throw new Error(
      `expected Deployed SHA line, got tail:\n${msg.split("\n").slice(-3).join("\n")}`
    );
  }
});

Deno.test("buildDailySummary omits Deployed SHA when none set", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(10, 10);
  const msg = buildDailySummary(ctx(stats));
  if (msg.includes("**Deployed SHA:**")) {
    throw new Error("did not expect Deployed SHA line");
  }
});

Deno.test("startDailySummary clamps hourUtc to the default for invalid input", () => {
  const stats = new PlatformStats();
  const baseNow = Date.UTC(2026, 4, 20, 14, 30, 0);
  const c = {
    version: "v",
    environment: "test",
    startedAt: baseNow - 1000,
    getStats: () => stats.snapshot(baseNow),
    getServices: () => null,
    now: () => baseNow,
    sender: () => Promise.resolve(true),
  };
  for (const bad of [-1, 24, 99, NaN, Infinity, 1.5]) {
    const h = startDailySummary({ ...c, hourUtc: bad });
    const next = h.nextFireAt();
    h.stop();
    const d = new Date(next);
    assertEquals(d.getUTCHours(), 9, `hourUtc=${bad} should fall back to 9`);
  }
});

Deno.test("startDailySummary constructs successfully with no sender (uses default)", () => {
  const stats = new PlatformStats();
  const baseNow = Date.UTC(2026, 4, 20, 8, 30, 0);
  const h = startDailySummary({
    version: "v",
    environment: "test",
    startedAt: baseNow - 1000,
    getStats: () => stats.snapshot(baseNow),
    getServices: () => null,
    hourUtc: 9,
    now: () => baseNow,
  });
  const next = h.nextFireAt();
  h.stop();
  assertEquals(next, Date.UTC(2026, 4, 20, 9, 0, 0));
});

Deno.test("buildDailySummary header: ℹ️ when no worst service ratio exists yet", () => {
  const stats = new PlatformStats();
  const msg = buildDailySummary(ctx(stats, { gateway: true, oms: true }));
  if (!msg.startsWith("ℹ️")) {
    throw new Error(`expected ℹ️ start, got: ${msg.slice(0, 20)}`);
  }
  if (!msg.includes("Now: all 2 services up")) {
    throw new Error("expected all-services-up line");
  }
});

Deno.test("buildDailySummary bug line uses singular 'user' for one reporter", () => {
  const stats = new PlatformStats();
  stats.recordServiceSnapshot(32, 32);
  stats.recordBug({ title: "x", userId: "alice", ts: Date.now() });
  const msg = buildDailySummary(ctx(stats));
  if (!msg.includes("1 from 1 user")) {
    throw new Error("expected singular user wording");
  }
});

Deno.test({
  name: "startDailySummary fires scheduled callback, reschedules, and swallows sender rejection",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const scheduled: Array<{ fn: () => void; delay: number }> = [];
    const cleared: unknown[] = [];
    const nowValues = [
      Date.UTC(2026, 4, 20, 8, 59, 59),
      Date.UTC(2026, 4, 20, 9, 0, 1),
      Date.UTC(2026, 4, 20, 9, 0, 1),
    ];
    let nowIndex = 0;
    const sent: string[] = [];
    try {
      globalThis.setTimeout = ((fn: () => void, delay?: number) => {
        scheduled.push({ fn, delay: delay ?? 0 });
        return scheduled.length as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout;
      globalThis.clearTimeout = ((id: unknown) => {
        cleared.push(id);
      }) as typeof clearTimeout;

      const handle = startDailySummary({
        version: "abcdef123456",
        environment: "test",
        startedAt: nowValues[0] - 60_000,
        getStats: () =>
          new PlatformStats().snapshot(nowValues[Math.min(nowIndex, nowValues.length - 1)]),
        getServices: () => null,
        hourUtc: undefined,
        now: () => nowValues[Math.min(nowIndex++, nowValues.length - 1)],
        sender: (msg) => {
          sent.push(msg);
          throw new Error("send failed");
        },
      });

      assertEquals(scheduled.length, 1);
      assertEquals(scheduled[0].delay, 1000);

      scheduled[0].fn();
      await Promise.resolve();

      assertEquals(sent.length, 1);
      assertEquals(handle.nextFireAt(), Date.UTC(2026, 4, 21, 9, 0, 0));
      assertEquals(scheduled.length, 2);

      handle.stop();
      assertEquals(cleared.length, 1);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  },
});
