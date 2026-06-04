import { logger } from "@veta/logger";

function isOtelEnabled(): boolean {
  return (Deno.env.get("OTEL_DENO") ?? "").toLowerCase() === "true";
}

const OTEL_ENABLED_AT_IMPORT = isOtelEnabled();

export function deriveServiceName(): string {
  const explicit = Deno.env.get("OTEL_SERVICE_NAME");
  if (explicit && explicit.length > 0) return explicit;
  const host = Deno.env.get("HOSTNAME") ?? "";
  const stripped = host.replace(/^veta-/, "").replace(/-\d+$/, "");
  return stripped || "veta-service";
}

if (OTEL_ENABLED_AT_IMPORT && !Deno.env.get("OTEL_SERVICE_NAME")) {
  Deno.env.set("OTEL_SERVICE_NAME", deriveServiceName());
}

if (OTEL_ENABLED_AT_IMPORT) {
  logger.info("OTel enabled", {
    component: "telemetry",
    service: Deno.env.get("OTEL_SERVICE_NAME"),
    endpoint: Deno.env.get("OTEL_EXPORTER_OTLP_ENDPOINT"),
  });
  queueMicrotask(() => {
    setupProcessMetrics().catch((err) => {
      logger.warn("setupProcessMetrics failed", {
        component: "telemetry",
        err: err instanceof Error ? err.message : String(err),
      });
    });
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

interface ObservableResultLike {
  observe(value: number, attributes?: Record<string, string | number | boolean>): void;
}

interface ObservableLike {
  addCallback(callback: (result: ObservableResultLike) => void | Promise<void>): void;
  removeCallback(callback: (result: ObservableResultLike) => void | Promise<void>): void;
}

interface MeterLike {
  createGauge(name: string, options?: { description?: string; unit?: string }): GaugeLike;
  createObservableGauge(
    name: string,
    options?: { description?: string; unit?: string }
  ): ObservableLike;
}

let tracerCache: TracerLike | null = null;
let meterCache: MeterLike | null = null;
const gaugeCache = new Map<string, GaugeLike>();

interface OTelApiLike {
  trace: { getTracer(name: string): unknown };
  metrics: { getMeter(name: string): unknown };
  propagation: {
    inject(
      context: unknown,
      carrier: Carrier,
      setter: { set(c: Carrier, k: string, v: unknown): void }
    ): void;
    extract(
      context: unknown,
      carrier: Record<string, unknown>,
      getter: {
        get(c: Record<string, unknown>, k: string): string | undefined;
        keys(c: Record<string, unknown>): string[];
      }
    ): unknown;
  };
  context: {
    active(): unknown;
    with<T>(context: unknown, fn: () => Promise<T>): Promise<T>;
  };
}

let otelApiLoader: (() => Promise<OTelApiLike>) | null = null;

async function loadOtelApi(): Promise<OTelApiLike> {
  if (otelApiLoader) return await otelApiLoader();
  return (await import("@opentelemetry/api")) as unknown as OTelApiLike;
}

async function getTracer(): Promise<TracerLike | null> {
  if (!isOtelEnabled()) return null;
  if (tracerCache) return tracerCache;
  try {
    const api = await loadOtelApi();
    tracerCache = api.trace.getTracer("veta") as unknown as TracerLike;
    return tracerCache;
  } catch {
    return null;
  }
}

async function getMeter(): Promise<MeterLike | null> {
  if (!isOtelEnabled()) return null;
  if (meterCache) return meterCache;
  try {
    const api = await loadOtelApi();
    meterCache = api.metrics.getMeter("veta") as unknown as MeterLike;
    return meterCache;
  } catch {
    return null;
  }
}

interface ProcessMetricsHandle {
  stop(): void;
}

let processMetricsHandle: ProcessMetricsHandle | null = null;

export async function setupProcessMetrics(): Promise<ProcessMetricsHandle | null> {
  if (!isOtelEnabled()) return null;
  if (processMetricsHandle) return processMetricsHandle;
  const meter = await getMeter();
  if (!meter) return null;

  const cpuStart = readCpuTimeSeconds();
  const wallStart = performance.now() / 1000;

  const rssGauge = meter.createObservableGauge("process_memory_usage_bytes", {
    description: "Resident set size of the Deno process",
    unit: "By",
  });
  const heapUsedGauge = meter.createObservableGauge("process_runtime_deno_memory_heap_used_bytes", {
    description: "V8 heap used by the Deno runtime",
    unit: "By",
  });
  const heapTotalGauge = meter.createObservableGauge(
    "process_runtime_deno_memory_heap_total_bytes",
    {
      description: "V8 heap total allocated by the Deno runtime",
      unit: "By",
    }
  );
  const externalGauge = meter.createObservableGauge("process_runtime_deno_memory_external_bytes", {
    description: "Memory used by C++ objects bound to JavaScript",
    unit: "By",
  });
  const cpuGauge = meter.createObservableGauge("process_cpu_seconds_total", {
    description: "Total CPU time consumed by the process since startup",
    unit: "s",
  });
  const uptimeGauge = meter.createObservableGauge("process_uptime_seconds", {
    description: "Wall-clock seconds since the process started",
    unit: "s",
  });

  const rssCb = (r: ObservableResultLike) => {
    const mem = Deno.memoryUsage();
    r.observe(mem.rss);
  };
  const heapUsedCb = (r: ObservableResultLike) => r.observe(Deno.memoryUsage().heapUsed);
  const heapTotalCb = (r: ObservableResultLike) => r.observe(Deno.memoryUsage().heapTotal);
  const externalCb = (r: ObservableResultLike) => r.observe(Deno.memoryUsage().external);
  const cpuCb = (r: ObservableResultLike) => {
    const now = readCpuTimeSeconds();
    if (now !== null) r.observe(now - (cpuStart ?? 0));
  };
  const uptimeCb = (r: ObservableResultLike) => r.observe(performance.now() / 1000 - wallStart);

  rssGauge.addCallback(rssCb);
  heapUsedGauge.addCallback(heapUsedCb);
  heapTotalGauge.addCallback(heapTotalCb);
  externalGauge.addCallback(externalCb);
  cpuGauge.addCallback(cpuCb);
  uptimeGauge.addCallback(uptimeCb);

  logger.info("process metrics registered", {
    component: "telemetry",
    service: Deno.env.get("OTEL_SERVICE_NAME"),
  });

  processMetricsHandle = {
    stop: () => {
      rssGauge.removeCallback(rssCb);
      heapUsedGauge.removeCallback(heapUsedCb);
      heapTotalGauge.removeCallback(heapTotalCb);
      externalGauge.removeCallback(externalCb);
      cpuGauge.removeCallback(cpuCb);
      uptimeGauge.removeCallback(uptimeCb);
      processMetricsHandle = null;
    },
  };
  return processMetricsHandle;
}

function readCpuTimeSeconds(): number | null {
  try {
    const usage = (
      Deno as unknown as { cpuUsage?: () => { user: number; system: number } }
    ).cpuUsage?.();
    if (usage) return (usage.user + usage.system) / 1_000_000;
  } catch {
    /* ignore */
  }
  return null;
}

export async function recordGauge(
  name: string,
  value: number,
  options?: {
    description?: string;
    unit?: string;
    attributes?: Record<string, string | number | boolean>;
  }
): Promise<void> {
  if (!isOtelEnabled()) return;
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
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  if (!isOtelEnabled()) return await fn(NOOP_SPAN);

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
  if (!isOtelEnabled()) return;
  try {
    const api = await loadOtelApi();
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
  fn: () => Promise<T>
): Promise<T> {
  if (!isOtelEnabled()) return await fn();
  try {
    const api = await loadOtelApi();
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

export function __setOtelApiLoaderForTests(loader: (() => Promise<OTelApiLike>) | null): void {
  otelApiLoader = loader;
  tracerCache = null;
  meterCache = null;
  gaugeCache.clear();
  processMetricsHandle = null;
}

export function __resetTelemetryForTests(): void {
  otelApiLoader = null;
  tracerCache = null;
  meterCache = null;
  gaugeCache.clear();
  processMetricsHandle = null;
}
