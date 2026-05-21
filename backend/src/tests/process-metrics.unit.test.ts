import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { setupProcessMetrics } from "../lib/telemetry.ts";

function denoMemorySnapshot() {
  const mem = Deno.memoryUsage();
  return { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal };
}

Deno.test("setupProcessMetrics is a no-op when OTEL_DENO is unset", async () => {
  const prev = Deno.env.get("OTEL_DENO");
  Deno.env.delete("OTEL_DENO");
  try {
    const handle = await setupProcessMetrics();
    assertEquals(handle, null);
  } finally {
    if (prev !== undefined) Deno.env.set("OTEL_DENO", prev);
  }
});

Deno.test("Deno.memoryUsage() exposes the four fields the gauges read", () => {
  const mem = Deno.memoryUsage();
  assert(typeof mem.rss === "number" && mem.rss > 0, "rss should be a positive number");
  assert(typeof mem.heapUsed === "number" && mem.heapUsed > 0, "heapUsed should be positive");
  assert(typeof mem.heapTotal === "number" && mem.heapTotal > 0, "heapTotal should be positive");
  assert(typeof mem.external === "number" && mem.external >= 0, "external should be >= 0");
});

Deno.test("Deno.cpuUsage() exposes user + system in microseconds", () => {
  const u = (Deno as unknown as { cpuUsage?: () => { user: number; system: number } }).cpuUsage?.();
  assert(u !== undefined, "Deno.cpuUsage should exist in 2.x");
  assert(typeof u!.user === "number" && u!.user >= 0);
  assert(typeof u!.system === "number" && u!.system >= 0);
});

Deno.test("memoryUsage snapshot stays sane between two consecutive reads", () => {
  const a = denoMemorySnapshot();
  const b = denoMemorySnapshot();
  assert(a.rss > 0 && b.rss > 0);
  assert(Math.abs(b.rss - a.rss) < 1024 * 1024 * 1024, "rss shouldn't jump by >1GB between reads");
});
