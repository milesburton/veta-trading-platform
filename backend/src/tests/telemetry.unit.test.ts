import { assert, assertEquals, assertRejects } from "jsr:@std/assert@0.217";

import {
  __resetTelemetryForTests,
  __setOtelApiLoaderForTests,
  deriveServiceName,
  injectTraceContext,
  recordGauge,
  setupProcessMetrics,
  withExtractedContext,
  withSpan,
} from "../lib/telemetry.ts";

function withEnv<T>(
  values: Record<string, string | undefined>,
  fn: () => T | Promise<T>
): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    prev[key] = Deno.env.get(key);
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
    __resetTelemetryForTests();
  });
}

function createFakeOtelApi() {
  const gaugeCreations: {
    name: string;
    options?: { description?: string; unit?: string };
    records: {
      value: number;
      attributes?: Record<string, string | number | boolean>;
    }[];
  }[] = [];
  const observableGauges = new Map<
    string,
    {
      callback: ((result: { observe(value: number): void }) => void | Promise<void>) | null;
      removed: number;
      observations: number[];
    }
  >();
  const spanState = {
    names: [] as string[],
    attributes: [] as Array<[string, string | number | boolean]>,
    exceptions: [] as unknown[],
    ended: 0,
  };
  const propagationState = {
    activeContexts: [] as unknown[],
    injected: [] as Array<{ key: string; value: string }>,
    extractedGets: [] as Array<[string, string | undefined]>,
    extractedKeys: [] as string[][],
    withContexts: [] as unknown[],
  };

  const api = {
    trace: {
      getTracer: () => ({
        startActiveSpan: async <T>(
          name: string,
          fn: (span: {
            end(): void;
            setAttribute(key: string, value: string | number | boolean): void;
            recordException(err: Error): void;
          }) => Promise<T> | T
        ): Promise<T> => {
          spanState.names.push(name);
          const span = {
            end: () => {
              spanState.ended += 1;
            },
            setAttribute: (key: string, value: string | number | boolean) => {
              spanState.attributes.push([key, value]);
            },
            recordException: (err: Error) => {
              spanState.exceptions.push(err);
            },
          };
          return await fn(span);
        },
      }),
    },
    metrics: {
      getMeter: () => ({
        createGauge: (name: string, options?: { description?: string; unit?: string }) => {
          const state = {
            name,
            options,
            records: [] as (typeof gaugeCreations)[number]["records"],
          };
          gaugeCreations.push(state);
          return {
            record: (value: number, attributes?: Record<string, string | number | boolean>) => {
              state.records.push({ value, attributes });
            },
          };
        },
        createObservableGauge: (name: string) => {
          const state: {
            callback: ((result: { observe(value: number): void }) => void | Promise<void>) | null;
            removed: number;
            observations: number[];
          } = {
            callback: null,
            removed: 0,
            observations: [],
          };
          observableGauges.set(name, state);
          return {
            addCallback: (
              callback: (result: { observe(value: number): void }) => void | Promise<void>
            ) => {
              state.callback = callback;
            },
            removeCallback: () => {
              state.removed += 1;
              state.callback = null;
            },
          };
        },
      }),
    },
    context: {
      active: () => {
        const ctx = { kind: "active" };
        propagationState.activeContexts.push(ctx);
        return ctx;
      },
      with: async <T>(context: unknown, fn: () => Promise<T>): Promise<T> => {
        propagationState.withContexts.push(context);
        return await fn();
      },
    },
    propagation: {
      inject: (
        context: unknown,
        carrier: Record<string, string | Uint8Array>,
        setter: {
          set(c: Record<string, string | Uint8Array>, k: string, v: unknown): void;
        }
      ) => {
        propagationState.activeContexts.push(context);
        setter.set(carrier, "traceparent", 12345);
        propagationState.injected.push({
          key: "traceparent",
          value: String(carrier.traceparent),
        });
      },
      extract: (
        context: unknown,
        carrier: Record<string, unknown>,
        getter: {
          get(c: Record<string, unknown>, k: string): string | undefined;
          keys(c: Record<string, unknown>): string[];
        }
      ) => {
        propagationState.activeContexts.push(context);
        const keys = getter.keys(carrier);
        propagationState.extractedKeys.push(keys);
        for (const key of keys) {
          propagationState.extractedGets.push([key, getter.get(carrier, key)]);
        }
        return { kind: "extracted", size: keys.length };
      },
    },
  };

  return { api, gaugeCreations, observableGauges, propagationState, spanState };
}

for (const [name, env, expected] of [
  [
    "prefers OTEL_SERVICE_NAME when set",
    { OTEL_SERVICE_NAME: "explicit-name", HOSTNAME: "veta-other-1" },
    "explicit-name",
  ],
  [
    "strips veta- prefix and -N suffix from HOSTNAME",
    { OTEL_SERVICE_NAME: undefined, HOSTNAME: "veta-gateway-3" },
    "gateway",
  ],
  [
    "falls back to veta-service when HOSTNAME is empty",
    { OTEL_SERVICE_NAME: undefined, HOSTNAME: "" },
    "veta-service",
  ],
  [
    "falls back to veta-service when stripping yields empty string",
    { OTEL_SERVICE_NAME: undefined, HOSTNAME: "veta-" },
    "veta-service",
  ],
] as const) {
  Deno.test(`[telemetry] deriveServiceName ${name}`, async () => {
    await withEnv(env, () => {
      assertEquals(deriveServiceName(), expected);
    });
  });
}

Deno.test("[telemetry] import-time setup derives OTEL service name in a subprocess", async () => {
  const moduleUrl = new URL("../lib/telemetry.ts", import.meta.url).href;
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "eval",
      "--quiet",
      `await import("${moduleUrl}"); console.log(Deno.env.get("OTEL_SERVICE_NAME") ?? "");`,
    ],
    env: {
      OTEL_DENO: "true",
      HOSTNAME: "veta-gateway-7",
    },
    clearEnv: true,
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout } = await command.output();
  const lines = new TextDecoder().decode(stdout).trim().split("\n");
  assertEquals(code, 0);
  assert(lines.includes("gateway"));
});

Deno.test("[telemetry] disabled-path helpers are no-ops or passthroughs", async () => {
  await withEnv(
    {
      OTEL_DENO: undefined,
      OTEL_SERVICE_NAME: undefined,
    },
    async () => {
      const carrier: Record<string, string | Uint8Array> = {};
      await recordGauge("test_gauge", 42);
      const spanResult = await withSpan("noop", (span) => {
        span.setAttribute("a", 1);
        span.recordException(new Error("ignored"));
        span.end();
        return 42;
      });
      await injectTraceContext(carrier);
      const extracted = await withExtractedContext({}, () => Promise.resolve("value"));
      const handle = await setupProcessMetrics();

      assertEquals(spanResult, 42);
      assertEquals(extracted, "value");
      assertEquals(Object.keys(carrier).length, 0);
      assertEquals(handle, null);
    }
  );
});

Deno.test("[telemetry] enabled recordGauge caches gauges and preserves attributes", async () => {
  const fake = createFakeOtelApi();
  await withEnv(
    {
      OTEL_DENO: "true",
      OTEL_SERVICE_NAME: "telemetry-test",
    },
    async () => {
      __setOtelApiLoaderForTests(() => fake.api);

      await recordGauge("latency_ms", 7, {
        description: "Latency",
        unit: "ms",
        attributes: { route: "/health" },
      });
      await recordGauge("latency_ms", 9, {
        description: "ignored-on-reuse",
        unit: "ignored",
        attributes: { route: "/ready" },
      });

      assertEquals(fake.gaugeCreations.length, 1);
      assertEquals(fake.gaugeCreations[0].name, "latency_ms");
      assertEquals(fake.gaugeCreations[0].options, {
        description: "Latency",
        unit: "ms",
      });
      assertEquals(fake.gaugeCreations[0].records, [
        { value: 7, attributes: { route: "/health" } },
        { value: 9, attributes: { route: "/ready" } },
      ]);
    }
  );
});

Deno.test("[telemetry] setupProcessMetrics registers callbacks, reuses the handle, and removes callbacks on stop", async () => {
  const fake = createFakeOtelApi();
  await withEnv(
    {
      OTEL_DENO: "true",
      OTEL_SERVICE_NAME: "telemetry-test",
    },
    async () => {
      __setOtelApiLoaderForTests(() => fake.api);

      const handle = await setupProcessMetrics();
      const reusedHandle = await setupProcessMetrics();

      assert(handle !== null);
      assertEquals(reusedHandle, handle);
      assertEquals([...fake.observableGauges.keys()].sort(), [
        "process_cpu_seconds_total",
        "process_memory_usage_bytes",
        "process_runtime_deno_memory_external_bytes",
        "process_runtime_deno_memory_heap_total_bytes",
        "process_runtime_deno_memory_heap_used_bytes",
        "process_uptime_seconds",
      ]);

      for (const state of fake.observableGauges.values()) {
        assert(state.callback, "expected callback to be registered");
        await state.callback?.({
          observe: (value: number) => {
            state.observations.push(value);
          },
        });
        assertEquals(state.observations.length, 1);
      }

      handle.stop();

      for (const state of fake.observableGauges.values()) {
        assertEquals(state.removed, 1);
        assertEquals(state.callback, null);
      }
    }
  );
});

Deno.test("[telemetry] withSpan sets attributes, returns values, and records Error exceptions", async () => {
  const fake = createFakeOtelApi();
  await withEnv(
    {
      OTEL_DENO: "true",
      OTEL_SERVICE_NAME: "telemetry-test",
    },
    async () => {
      __setOtelApiLoaderForTests(() => fake.api);

      const result = await withSpan("priced-span", () => "ok", { symbol: "AAPL", qty: 10 });

      assertEquals(result, "ok");
      assertEquals(fake.spanState.names, ["priced-span"]);
      assertEquals(fake.spanState.attributes, [
        ["symbol", "AAPL"],
        ["qty", 10],
      ]);
      assertEquals(fake.spanState.ended, 1);

      await assertRejects(
        () =>
          withSpan("boom-span", () => {
            throw new Error("inner fail");
          }),
        Error,
        "inner fail"
      );
      assertEquals(fake.spanState.exceptions.length, 1);
      assertEquals(fake.spanState.ended, 2);

      let nonErrorThrown: unknown;
      try {
        await withSpan("string-boom", () => {
          throw "non-error";
        });
      } catch (err) {
        nonErrorThrown = err;
      }
      assertEquals(nonErrorThrown, "non-error");
      assertEquals(fake.spanState.exceptions.length, 1);
      assertEquals(fake.spanState.ended, 3);
    }
  );
});

Deno.test("[telemetry] injectTraceContext stringifies setter values when OTEL is enabled", async () => {
  const fake = createFakeOtelApi();
  await withEnv(
    {
      OTEL_DENO: "true",
      OTEL_SERVICE_NAME: "telemetry-test",
    },
    async () => {
      __setOtelApiLoaderForTests(() => fake.api);

      const carrier: Record<string, string | Uint8Array> = {};
      await injectTraceContext(carrier);

      assertEquals(carrier.traceparent, "12345");
      assertEquals(fake.propagationState.injected, [
        {
          key: "traceparent",
          value: "12345",
        },
      ]);
    }
  );
});

Deno.test("[telemetry] withExtractedContext coerces carrier values and runs inside extracted context", async () => {
  const fake = createFakeOtelApi();
  await withEnv(
    {
      OTEL_DENO: "true",
      OTEL_SERVICE_NAME: "telemetry-test",
    },
    async () => {
      __setOtelApiLoaderForTests(() => fake.api);

      const result = await withExtractedContext(
        {
          traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00",
          tracestate: new TextEncoder().encode("vendor=value"),
          retryCount: 3,
          missing: undefined,
        },
        () => "value"
      );

      assertEquals(result, "value");
      assertEquals(fake.propagationState.extractedKeys.at(-1), [
        "traceparent",
        "tracestate",
        "retryCount",
        "missing",
      ]);
      assertEquals(fake.propagationState.extractedGets.at(-4), [
        "traceparent",
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00",
      ]);
      assertEquals(fake.propagationState.extractedGets.at(-3), ["tracestate", "vendor=value"]);
      assertEquals(fake.propagationState.extractedGets.at(-2), ["retryCount", "3"]);
      assertEquals(fake.propagationState.extractedGets.at(-1), ["missing", undefined]);
      assertEquals(fake.propagationState.withContexts.at(-1), {
        kind: "extracted",
        size: 4,
      });
    }
  );
});

Deno.test("[telemetry] OTEL loader failures gracefully fall back to no-op behavior", async () => {
  await withEnv(
    {
      OTEL_DENO: "true",
      OTEL_SERVICE_NAME: "telemetry-test",
    },
    async () => {
      __setOtelApiLoaderForTests(() => {
        throw new Error("loader boom");
      });

      const spanResult = await withSpan("fallback-span", () => "ok");
      const extracted = await withExtractedContext({ traceparent: "00-abc-123-01" }, () => "value");
      const carrier: Record<string, string | Uint8Array> = {};

      await recordGauge("will_not_record", 1);
      await injectTraceContext(carrier);

      assertEquals(spanResult, "ok");
      assertEquals(extracted, "value");
      assertEquals(await setupProcessMetrics(), null);
      assertEquals(Object.keys(carrier).length, 0);
    }
  );
});
