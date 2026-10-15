import { logger } from "#veta/logger";
import { deriveServiceName } from "./service-name.ts";

function isOtelEnabled(): boolean {
  return (process.env.OTEL_ENABLED ?? "").toLowerCase() === "true";
}

const OTEL_ENABLED_AT_IMPORT = isOtelEnabled();

export { deriveServiceName };

if (OTEL_ENABLED_AT_IMPORT && !process.env.OTEL_SERVICE_NAME) {
  process.env.OTEL_SERVICE_NAME = deriveServiceName();
}

if (OTEL_ENABLED_AT_IMPORT) {
  logger.info("OTel enabled", {
    component: "telemetry",
    service: process.env.OTEL_SERVICE_NAME,
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
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

interface UpDownCounterLike {
  add(value: number, attributes?: Record<string, string | number | boolean>): void;
}

interface HistogramLike {
  record(value: number, attributes?: Record<string, string | number | boolean>): void;
}

interface MeterLike {
  createUpDownCounter(
    name: string,
    options?: { description?: string; unit?: string }
  ): UpDownCounterLike;
  createHistogram(name: string, options?: { description?: string; unit?: string }): HistogramLike;
  createGauge(name: string, options?: { description?: string; unit?: string }): GaugeLike;
  createObservableGauge(
    name: string,
    options?: { description?: string; unit?: string }
  ): ObservableLike;
}

interface HttpServerInstruments {
  active: UpDownCounterLike;
  bodySize: HistogramLike;
}

let httpInstrumentsPromise: Promise<HttpServerInstruments | null> | null = null;
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

function getHttpServerInstruments(): Promise<HttpServerInstruments | null> {
  httpInstrumentsPromise ??= getMeter().then((meter) =>
    meter
      ? {
          active: meter.createUpDownCounter("http.server.active_requests", {
            description: "Number of in-flight HTTP server requests",
            unit: "{request}",
          }),
          bodySize: meter.createHistogram("http.server.request.body.size", {
            description: "Size of HTTP server request bodies",
            unit: "By",
          }),
        }
      : null
  );
  return httpInstrumentsPromise;
}

export async function trackHttpServerRequest(
  req: Request,
  handler: () => Response | Promise<Response>
): Promise<Response> {
  if (!isOtelEnabled()) return handler();
  const instruments = await getHttpServerInstruments();
  if (!instruments) return handler();
  const attributes = { "http.request.method": req.method };
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 0) {
    instruments.bodySize.record(contentLength, attributes);
  }
  instruments.active.add(1, attributes);
  try {
    return await handler();
  } finally {
    instruments.active.add(-1, attributes);
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
    description: "Resident set size of the process",
    unit: "By",
  });
  const heapUsedGauge = meter.createObservableGauge(
    "process_runtime_nodejs_memory_heap_used_bytes",
    {
      description: "V8 heap used by the runtime",
      unit: "By",
    }
  );
  const heapTotalGauge = meter.createObservableGauge(
    "process_runtime_nodejs_memory_heap_total_bytes",
    {
      description: "V8 heap total allocated by the runtime",
      unit: "By",
    }
  );
  const externalGauge = meter.createObservableGauge(
    "process_runtime_nodejs_memory_external_bytes",
    {
      description: "Memory used by C++ objects bound to JavaScript",
      unit: "By",
    }
  );
  const v8HeapGauge = meter.createObservableGauge("v8js.memory.heap.size", {
    description: "V8 heap size in use",
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
    const mem = process.memoryUsage();
    r.observe(mem.rss);
  };
  const heapUsedCb = (r: ObservableResultLike) => r.observe(process.memoryUsage().heapUsed);
  const heapTotalCb = (r: ObservableResultLike) => r.observe(process.memoryUsage().heapTotal);
  const externalCb = (r: ObservableResultLike) => r.observe(process.memoryUsage().external);
  const cpuCb = (r: ObservableResultLike) => {
    const now = readCpuTimeSeconds();
    if (now !== null) r.observe(now - (cpuStart ?? 0));
  };
  const uptimeCb = (r: ObservableResultLike) => r.observe(performance.now() / 1000 - wallStart);

  rssGauge.addCallback(rssCb);
  const v8HeapCb = (r: ObservableResultLike) => r.observe(process.memoryUsage().heapUsed);
  v8HeapGauge.addCallback(v8HeapCb);
  heapUsedGauge.addCallback(heapUsedCb);
  heapTotalGauge.addCallback(heapTotalCb);
  externalGauge.addCallback(externalCb);
  cpuGauge.addCallback(cpuCb);
  uptimeGauge.addCallback(uptimeCb);

  logger.info("process metrics registered", {
    component: "telemetry",
    service: process.env.OTEL_SERVICE_NAME,
  });

  processMetricsHandle = {
    stop: () => {
      rssGauge.removeCallback(rssCb);
      v8HeapGauge.removeCallback(v8HeapCb);
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
  const usage = process.cpuUsage();
  return (usage.user + usage.system) / 1_000_000;
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

// fallow-ignore-next-line unused-export
export function __setOtelApiLoaderForTests(loader: (() => Promise<OTelApiLike>) | null): void {
  otelApiLoader = loader;
  tracerCache = null;
  meterCache = null;
  gaugeCache.clear();
  httpInstrumentsPromise = null;
  processMetricsHandle = null;
}

// fallow-ignore-next-line unused-export
export function __resetTelemetryForTests(): void {
  otelApiLoader = null;
  tracerCache = null;
  meterCache = null;
  gaugeCache.clear();
  httpInstrumentsPromise = null;
  processMetricsHandle = null;
}
