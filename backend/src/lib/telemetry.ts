import { logger } from "@veta/logger";

const OTEL_ENABLED = (Deno.env.get("OTEL_DENO") ?? "").toLowerCase() === "true";

export function deriveServiceName(): string {
  const explicit = Deno.env.get("OTEL_SERVICE_NAME");
  if (explicit && explicit.length > 0) return explicit;
  const host = Deno.env.get("HOSTNAME") ?? "";
  const stripped = host.replace(/^veta-/, "").replace(/-\d+$/, "");
  return stripped || "veta-service";
}

if (OTEL_ENABLED && !Deno.env.get("OTEL_SERVICE_NAME")) {
  Deno.env.set("OTEL_SERVICE_NAME", deriveServiceName());
}

if (OTEL_ENABLED) {
  logger.info("OTel enabled", {
    component: "telemetry",
    service: Deno.env.get("OTEL_SERVICE_NAME"),
    endpoint: Deno.env.get("OTEL_EXPORTER_OTLP_ENDPOINT"),
  });
}

interface SpanLike {
  end(): void;
  setAttribute(key: string, value: string | number | boolean): void;
  recordException(err: Error): void;
}

interface TracerLike {
  startActiveSpan<T>(name: string, fn: (span: SpanLike) => Promise<T> | T): Promise<T>;
}

interface GaugeLike {
  record(value: number, attributes?: Record<string, string | number | boolean>): void;
}

interface MeterLike {
  createGauge(name: string, options?: { description?: string; unit?: string }): GaugeLike;
}

let tracerCache: TracerLike | null = null;
let meterCache: MeterLike | null = null;
const gaugeCache = new Map<string, GaugeLike>();

async function getTracer(): Promise<TracerLike | null> {
  if (!OTEL_ENABLED) return null;
  if (tracerCache) return tracerCache;
  try {
    const api = await import("@opentelemetry/api");
    tracerCache = api.trace.getTracer("veta") as unknown as TracerLike;
    return tracerCache;
  } catch {
    return null;
  }
}

async function getMeter(): Promise<MeterLike | null> {
  if (!OTEL_ENABLED) return null;
  if (meterCache) return meterCache;
  try {
    const api = await import("@opentelemetry/api");
    meterCache = api.metrics.getMeter("veta") as unknown as MeterLike;
    return meterCache;
  } catch {
    return null;
  }
}

export async function recordGauge(
  name: string,
  value: number,
  options?: {
    description?: string;
    unit?: string;
    attributes?: Record<string, string | number | boolean>;
  },
): Promise<void> {
  if (!OTEL_ENABLED) return;
  const meter = await getMeter();
  if (!meter) return;
  let gauge = gaugeCache.get(name);
  if (!gauge) {
    gauge = meter.createGauge(name, {
      description: options?.description,
      unit: options?.unit,
    });
    gaugeCache.set(name, gauge);
  }
  gauge.record(value, options?.attributes);
}

const NOOP_SPAN: SpanLike = {
  end: () => {},
  setAttribute: () => {},
  recordException: () => {},
};

export async function withSpan<T>(
  name: string,
  fn: (span: SpanLike) => Promise<T> | T,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  if (!OTEL_ENABLED) return await fn(NOOP_SPAN);

  const tracer = await getTracer();
  if (!tracer) return await fn(NOOP_SPAN);

  return tracer.startActiveSpan(name, async (span) => {
    if (attributes) {
      for (const [k, v] of Object.entries(attributes)) span.setAttribute(k, v);
    }
    try {
      return await fn(span);
    } catch (err) {
      if (err instanceof Error) span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
}

type Carrier = Record<string, string | Uint8Array>;

export async function injectTraceContext(carrier: Carrier): Promise<void> {
  if (!OTEL_ENABLED) return;
  try {
    const api = await import("@opentelemetry/api");
    api.propagation.inject(api.context.active(), carrier, {
      set: (c: Carrier, k: string, v: unknown) => {
        c[k] = String(v);
      },
    });
  } catch {
    return;
  }
}

export async function withExtractedContext<T>(
  carrier: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  if (!OTEL_ENABLED) return await fn();
  try {
    const api = await import("@opentelemetry/api");
    const ctx = api.propagation.extract(api.context.active(), carrier, {
      get: (c: Record<string, unknown>, k: string) => {
        const v = c[k];
        if (v === undefined) return undefined;
        if (typeof v === "string") return v;
        if (v instanceof Uint8Array) return new TextDecoder().decode(v);
        return String(v);
      },
      keys: (c: Record<string, unknown>) => Object.keys(c),
    });
    return await api.context.with(ctx, fn);
  } catch {
    return await fn();
  }
}
