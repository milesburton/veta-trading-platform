import { test } from "vitest";
import { runNode } from "#veta/run-node";
import { assert, assertEquals } from "#veta/test-assert";

import { type LogLevel, logger, registerLogSink } from "../lib/logger.ts";

function captureStdout<T>(fn: () => T): { result: T; lines: string[] } {
  const originalWrite = process.stdout.write;
  const captured: string[] = [];
  process.stdout.write = ((data: string | Uint8Array) => {
    captured.push(typeof data === "string" ? data : new TextDecoder().decode(data));
    return true;
  }) as typeof process.stdout.write;
  try {
    const result = fn();
    return {
      result,
      lines: captured
        .join("")
        .split("\n")
        .filter((l) => l.length > 0),
    };
  } finally {
    process.stdout.write = originalWrite;
  }
}

function parseLine(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}

test("[logger] emits newline-terminated JSON line", () => {
  const { lines } = captureStdout(() => logger.info("hello"));
  assertEquals(lines.length, 1);
  const parsed = parseLine(lines[0]);
  assertEquals(parsed.msg, "hello");
  assertEquals(parsed.level, "info");
});

test("[logger] record has ts, level, service, msg", () => {
  const { lines } = captureStdout(() => logger.info("x"));
  const parsed = parseLine(lines[0]);
  assert(typeof parsed.ts === "string");
  assert(/^\d{4}-\d{2}-\d{2}T/.test(parsed.ts as string), "ts should be ISO-8601");
  assertEquals(parsed.level, "info");
  assert(typeof parsed.service === "string");
  assertEquals(parsed.msg, "x");
});

test("[logger] ctx fields spread at top level, not nested", () => {
  const { lines } = captureStdout(() => logger.info("x", { userId: "u1", orderId: 42 }));
  const parsed = parseLine(lines[0]);
  assertEquals(parsed.userId, "u1");
  assertEquals(parsed.orderId, 42);
  assert(!("ctx" in parsed), "ctx should not be a nested property");
});

test("[logger] err: Error serializes to { name, message, stack }", () => {
  const err = new Error("boom");
  const { lines } = captureStdout(() => logger.warn("oops", { err }));
  const parsed = parseLine(lines[0]);
  const errField = parsed.err as { name: string; message: string; stack: string };
  assertEquals(errField.name, "Error");
  assertEquals(errField.message, "boom");
  assert(typeof errField.stack === "string");
});

test("[logger] level methods route correctly", () => {
  const { lines } = captureStdout(() => {
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
  });
  const levels = lines.map((l) => parseLine(l).level);
  assertEquals(levels, ["info", "warn", "error"]);
});

test("[logger] debug is filtered out by default info threshold", () => {
  const { lines } = captureStdout(() => logger.debug("hidden"));
  assertEquals(lines.length, 0);
});

test("[logger] circular ctx falls back to _serializeError record", () => {
  const bad: Record<string, unknown> = {};
  bad.self = bad;
  const { lines } = captureStdout(() => logger.error("cycle", bad));
  assertEquals(lines.length, 1);
  const parsed = parseLine(lines[0]);
  assert(typeof parsed._serializeError === "string");
  assertEquals(parsed.msg, "cycle");
  assertEquals(parsed.level, "error");
});

test("[logger] Error without stack still serializes", () => {
  const err = new Error("nostack");
  err.stack = undefined;
  const { lines } = captureStdout(() => logger.error("x", { err }));
  const parsed = parseLine(lines[0]);
  const errField = parsed.err as { stack: string };
  assertEquals(errField.stack, "");
});

test("[logger] multiple ctx values coexist", () => {
  const { lines } = captureStdout(() =>
    logger.info("x", {
      symbol: "AAPL",
      qty: 100,
      side: "BUY",
      err: new Error("warn"),
    })
  );
  const parsed = parseLine(lines[0]);
  assertEquals(parsed.symbol, "AAPL");
  assertEquals(parsed.qty, 100);
  assertEquals(parsed.side, "BUY");
  assert(typeof (parsed.err as Record<string, unknown>).message === "string");
});

test("[logger] LOG_LEVEL=debug enables debug output (subprocess)", async () => {
  const text = (await runNode(`
      import { logger } from "${new URL("../lib/logger.ts", import.meta.url).href}";
      logger.debug("d-msg");
      logger.info("i-msg");
    `, { LOG_LEVEL: "debug", OTEL_SERVICE_NAME: "subtest" })).stdout;
  const lines = text.split("\n").filter((l) => l.length > 0);
  const levels = lines.map((l) => JSON.parse(l).level);
  assertEquals(levels, ["debug", "info"]);
});

test("[logger] LOG_LEVEL=warn suppresses info (subprocess)", async () => {
  const text = (await runNode(`
      import { logger } from "${new URL("../lib/logger.ts", import.meta.url).href}";
      logger.info("i");
      logger.warn("w");
      logger.error("e");
    `, { LOG_LEVEL: "warn", OTEL_SERVICE_NAME: "subtest" })).stdout;
  const lines = text.split("\n").filter((l) => l.length > 0);
  assertEquals(lines.length, 2);
  const levels = lines.map((l) => JSON.parse(l).level);
  assertEquals(levels, ["warn", "error"]);
});

test("[logger] OTEL_SERVICE_NAME populates service field (subprocess)", async () => {
  const text = (await runNode(`
      import { logger } from "${new URL("../lib/logger.ts", import.meta.url).href}";
      logger.info("hi");
    `, { OTEL_SERVICE_NAME: "test-service-42" })).stdout;
  const parsed = JSON.parse(text.trim());
  assertEquals(parsed.service, "test-service-42");
});

test("[logger] missing OTEL_SERVICE_NAME falls back to 'unknown' (subprocess)", async () => {
  const text = (await runNode(`
      import { logger } from "${new URL("../lib/logger.ts", import.meta.url).href}";
      logger.info("hi");
    `, {})).stdout;
  const parsed = JSON.parse(text.trim());
  assertEquals(parsed.service, "unknown");
});

test("[logger] invalid LOG_LEVEL falls back to info (subprocess)", async () => {
  const text = (await runNode(`
      import { logger } from "${new URL("../lib/logger.ts", import.meta.url).href}";
      logger.debug("d");
      logger.info("i");
    `, { LOG_LEVEL: "nonsense", OTEL_SERVICE_NAME: "subtest" })).stdout;
  const lines = text.split("\n").filter((l) => l.length > 0);
  assertEquals(lines.length, 1);
  assertEquals(JSON.parse(lines[0]).level, "info");
});

test("[logger] registerLogSink forwards every emit until unsubscribed", () => {
  const events: { level: LogLevel; msg: string; line: string; ctx?: Record<string, unknown> }[] =
    [];
  const unsubscribe = registerLogSink((level, msg, line, ctx) => {
    events.push({ level, msg, line, ctx });
  });
  try {
    captureStdout(() => logger.info("hello", { user: "alice" }));
    captureStdout(() => logger.warn("oops"));
  } finally {
    unsubscribe();
  }
  captureStdout(() => logger.info("after-unsubscribe"));
  assertEquals(events.length, 2);
  assertEquals(events[0].level, "info");
  assertEquals(events[0].msg, "hello");
  assertEquals(events[0].ctx?.user, "alice");
  assertEquals(events[1].level, "warn");
  assert(events[0].line.includes('"msg":"hello"'));
});

test("[logger] sink that throws does not break subsequent sinks or emit", () => {
  const events: string[] = [];
  const u1 = registerLogSink(() => {
    throw new Error("boom");
  });
  const u2 = registerLogSink((_l, msg) => {
    events.push(msg);
  });
  try {
    captureStdout(() => logger.info("via-throwing-sink"));
  } finally {
    u1();
    u2();
  }
  assertEquals(events, ["via-throwing-sink"]);
});

test("[logger] unsubscribe is idempotent (calling twice is harmless)", () => {
  const u = registerLogSink(() => {});
  u();
  u();
});
