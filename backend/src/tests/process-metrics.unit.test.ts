import { test } from "vitest";
import { assert, assertEquals } from "#veta/test-assert";
import { setupProcessMetrics } from "../lib/telemetry.ts";

function denoMemorySnapshot() {
  const mem = process.memoryUsage();
  return { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal };
}

test("setupProcessMetrics is a no-op when OTEL_DENO is unset", async () => {
  const prev = process.env["OTEL_DENO"];
  delete process.env["OTEL_DENO"];
  try {
    const handle = await setupProcessMetrics();
    assertEquals(handle, null);
  } finally {
    if (prev !== undefined) process.env["OTEL_DENO"] = prev;
  }
});

test("process.memoryUsage() exposes the four fields the gauges read", () => {
  const mem = process.memoryUsage();
  assert(typeof mem.rss === "number" && mem.rss > 0, "rss should be a positive number");
  assert(typeof mem.heapUsed === "number" && mem.heapUsed > 0, "heapUsed should be positive");
  assert(typeof mem.heapTotal === "number" && mem.heapTotal > 0, "heapTotal should be positive");
  assert(typeof mem.external === "number" && mem.external >= 0, "external should be >= 0");
});

test("process.cpuUsage() exposes user + system in microseconds", () => {
  const u = process.cpuUsage();
  assert(u !== undefined, "cpuUsage");
  assert(typeof u?.user === "number" && u?.user >= 0);
  assert(typeof u?.system === "number" && u?.system >= 0);
});

test("memoryUsage snapshot stays sane between two consecutive reads", () => {
  const a = denoMemorySnapshot();
  const b = denoMemorySnapshot();
  assert(a.rss > 0 && b.rss > 0);
  assert(Math.abs(b.rss - a.rss) < 1024 * 1024 * 1024, "rss shouldn't jump by >1GB between reads");
});
