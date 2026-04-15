import { assert, assertEquals } from "jsr:@std/assert@0.217";

import { logger } from "../lib/logger.ts";

function captureStdout<T>(fn: () => T): { result: T; lines: string[] } {
  const originalWriteSync = Deno.stdout.writeSync;
  const captured: string[] = [];
  const decoder = new TextDecoder();
  Deno.stdout.writeSync = (data: Uint8Array) => {
    captured.push(decoder.decode(data));
    return data.length;
  };
  try {
    const result = fn();
    return { result, lines: captured.join("").split("\n").filter((l) => l.length > 0) };
  } finally {
    Deno.stdout.writeSync = originalWriteSync;
  }
}

function parseLine(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}

Deno.test("[logger] emits newline-terminated JSON line", () => {
  const { lines } = captureStdout(() => logger.info("hello"));
  assertEquals(lines.length, 1);
  const parsed = parseLine(lines[0]);
  assertEquals(parsed.msg, "hello");
  assertEquals(parsed.level, "info");
});

Deno.test("[logger] record has ts, level, service, msg", () => {
  const { lines } = captureStdout(() => logger.info("x"));
  const parsed = parseLine(lines[0]);
  assert(typeof parsed.ts === "string");
  assert(/^\d{4}-\d{2}-\d{2}T/.test(parsed.ts as string), "ts should be ISO-8601");
  assertEquals(parsed.level, "info");
  assert(typeof parsed.service === "string");
  assertEquals(parsed.msg, "x");
});

Deno.test("[logger] ctx fields spread at top level, not nested", () => {
  const { lines } = captureStdout(() =>
    logger.info("x", { userId: "u1", orderId: 42 }),
  );
  const parsed = parseLine(lines[0]);
  assertEquals(parsed.userId, "u1");
  assertEquals(parsed.orderId, 42);
  assert(!("ctx" in parsed), "ctx should not be a nested property");
});

Deno.test("[logger] err: Error serializes to { name, message, stack }", () => {
  const err = new Error("boom");
  const { lines } = captureStdout(() => logger.warn("oops", { err }));
  const parsed = parseLine(lines[0]);
  const errField = parsed.err as { name: string; message: string; stack: string };
  assertEquals(errField.name, "Error");
  assertEquals(errField.message, "boom");
  assert(typeof errField.stack === "string");
});

Deno.test("[logger] level methods route correctly", () => {
  const { lines } = captureStdout(() => {
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
  });
  const levels = lines.map((l) => parseLine(l).level);
  assertEquals(levels, ["info", "warn", "error"]);
});

Deno.test("[logger] debug is filtered out by default info threshold", () => {
  const { lines } = captureStdout(() => logger.debug("hidden"));
  assertEquals(lines.length, 0);
});

Deno.test("[logger] circular ctx falls back to _serializeError record", () => {
  const bad: Record<string, unknown> = {};
  bad.self = bad;
  const { lines } = captureStdout(() => logger.error("cycle", bad));
  assertEquals(lines.length, 1);
  const parsed = parseLine(lines[0]);
  assert(typeof parsed._serializeError === "string");
  assertEquals(parsed.msg, "cycle");
  assertEquals(parsed.level, "error");
});

Deno.test("[logger] Error without stack still serializes", () => {
  const err = new Error("nostack");
  err.stack = undefined;
  const { lines } = captureStdout(() => logger.error("x", { err }));
  const parsed = parseLine(lines[0]);
  const errField = parsed.err as { stack: string };
  assertEquals(errField.stack, "");
});

Deno.test("[logger] multiple ctx values coexist", () => {
  const { lines } = captureStdout(() =>
    logger.info("x", {
      symbol: "AAPL",
      qty: 100,
      side: "BUY",
      err: new Error("warn"),
    }),
  );
  const parsed = parseLine(lines[0]);
  assertEquals(parsed.symbol, "AAPL");
  assertEquals(parsed.qty, 100);
  assertEquals(parsed.side, "BUY");
  assert(typeof (parsed.err as Record<string, unknown>).message === "string");
});

Deno.test("[logger] LOG_LEVEL=debug enables debug output (subprocess)", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["eval", "--quiet", `
      import { logger } from "${new URL("../lib/logger.ts", import.meta.url).href}";
      logger.debug("d-msg");
      logger.info("i-msg");
    `],
    env: { LOG_LEVEL: "debug", OTEL_SERVICE_NAME: "subtest" },
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout } = await cmd.output();
  const text = new TextDecoder().decode(stdout);
  const lines = text.split("\n").filter((l) => l.length > 0);
  const levels = lines.map((l) => JSON.parse(l).level);
  assertEquals(levels, ["debug", "info"]);
});

Deno.test("[logger] LOG_LEVEL=warn suppresses info (subprocess)", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["eval", "--quiet", `
      import { logger } from "${new URL("../lib/logger.ts", import.meta.url).href}";
      logger.info("i");
      logger.warn("w");
      logger.error("e");
    `],
    env: { LOG_LEVEL: "warn", OTEL_SERVICE_NAME: "subtest" },
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout } = await cmd.output();
  const text = new TextDecoder().decode(stdout);
  const lines = text.split("\n").filter((l) => l.length > 0);
  assertEquals(lines.length, 2);
  const levels = lines.map((l) => JSON.parse(l).level);
  assertEquals(levels, ["warn", "error"]);
});

Deno.test("[logger] OTEL_SERVICE_NAME populates service field (subprocess)", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["eval", "--quiet", `
      import { logger } from "${new URL("../lib/logger.ts", import.meta.url).href}";
      logger.info("hi");
    `],
    env: { OTEL_SERVICE_NAME: "test-service-42" },
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout } = await cmd.output();
  const text = new TextDecoder().decode(stdout);
  const parsed = JSON.parse(text.trim());
  assertEquals(parsed.service, "test-service-42");
});

Deno.test("[logger] missing OTEL_SERVICE_NAME falls back to 'unknown' (subprocess)", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["eval", "--quiet", `
      import { logger } from "${new URL("../lib/logger.ts", import.meta.url).href}";
      logger.info("hi");
    `],
    env: {},
    clearEnv: true,
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout } = await cmd.output();
  const text = new TextDecoder().decode(stdout);
  const parsed = JSON.parse(text.trim());
  assertEquals(parsed.service, "unknown");
});

Deno.test("[logger] invalid LOG_LEVEL falls back to info (subprocess)", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["eval", "--quiet", `
      import { logger } from "${new URL("../lib/logger.ts", import.meta.url).href}";
      logger.debug("d");
      logger.info("i");
    `],
    env: { LOG_LEVEL: "nonsense", OTEL_SERVICE_NAME: "subtest" },
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout } = await cmd.output();
  const text = new TextDecoder().decode(stdout);
  const lines = text.split("\n").filter((l) => l.length > 0);
  assertEquals(lines.length, 1);
  assertEquals(JSON.parse(lines[0]).level, "info");
});
