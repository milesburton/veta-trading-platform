import { assert, assertEquals } from "jsr:@std/assert@0.217";

const OTEL_DISABLED = (Deno.env.get("OTEL_DENO") ?? "").toLowerCase() !== "true";

import {
  deriveServiceName,
  injectTraceContext,
  recordGauge,
  withExtractedContext,
  withSpan,
} from "../lib/telemetry.ts";

function withEnv<T>(
  values: Record<string, string | undefined>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(values)) {
    prev[k] = Deno.env.get(k);
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  return Promise.resolve(fn()).finally(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  });
}

Deno.test("[telemetry] deriveServiceName prefers OTEL_SERVICE_NAME when set", async () => {
  await withEnv({ OTEL_SERVICE_NAME: "explicit-name", HOSTNAME: "veta-other-1" }, () => {
    assertEquals(deriveServiceName(), "explicit-name");
  });
});

Deno.test("[telemetry] deriveServiceName strips veta- prefix and -N suffix from HOSTNAME", async () => {
  await withEnv({ OTEL_SERVICE_NAME: undefined, HOSTNAME: "veta-gateway-3" }, () => {
    assertEquals(deriveServiceName(), "gateway");
  });
});

Deno.test("[telemetry] deriveServiceName falls back to veta-service when HOSTNAME is empty", async () => {
  await withEnv({ OTEL_SERVICE_NAME: undefined, HOSTNAME: "" }, () => {
    assertEquals(deriveServiceName(), "veta-service");
  });
});

Deno.test("[telemetry] deriveServiceName falls back to veta-service when stripping yields empty string", async () => {
  await withEnv({ OTEL_SERVICE_NAME: undefined, HOSTNAME: "veta-" }, () => {
    assertEquals(deriveServiceName(), "veta-service");
  });
});

Deno.test({
  name: "[telemetry] recordGauge is a no-op when OTEL is disabled",
  ignore: !OTEL_DISABLED,
  async fn() {
    await recordGauge("test_gauge", 42);
    await recordGauge("test_gauge", 1, { description: "x", unit: "ms", attributes: { k: "v" } });
  },
});

Deno.test({
  name: "[telemetry] withSpan runs the inner function and forwards its return value",
  ignore: !OTEL_DISABLED,
  async fn() {
    const result = await withSpan("noop", () => 42);
    assertEquals(result, 42);
  },
});

Deno.test({
  name: "[telemetry] withSpan runs the inner async function and forwards its resolved value",
  ignore: !OTEL_DISABLED,
  async fn() {
    const result = await withSpan("noop-async", () => Promise.resolve("done"));
    assertEquals(result, "done");
  },
});

Deno.test({
  name: "[telemetry] withSpan propagates thrown errors",
  ignore: !OTEL_DISABLED,
  async fn() {
    let threw = false;
    try {
      await withSpan("noop", () => {
        throw new Error("inner fail");
      });
    } catch (err) {
      threw = true;
      assert(err instanceof Error);
      assertEquals(err.message, "inner fail");
    }
    assert(threw, "expected withSpan to rethrow");
  },
});

Deno.test({
  name: "[telemetry] withSpan exposes a no-op span object usable in callers",
  ignore: !OTEL_DISABLED,
  async fn() {
    await withSpan("noop", (span) => {
      span.setAttribute("a", 1);
      span.recordException(new Error("ignored"));
      span.end();
    }, { foo: "bar" });
  },
});

Deno.test({
  name: "[telemetry] injectTraceContext is a no-op when OTEL is disabled",
  ignore: !OTEL_DISABLED,
  async fn() {
    const carrier: Record<string, string | Uint8Array> = {};
    await injectTraceContext(carrier);
    assertEquals(Object.keys(carrier).length, 0);
  },
});

Deno.test({
  name: "[telemetry] withExtractedContext invokes the callback with extracted context (OTEL disabled passthrough)",
  ignore: !OTEL_DISABLED,
  async fn() {
    const out = await withExtractedContext({}, () => Promise.resolve("value"));
    assertEquals(out, "value");
  },
});
