import { redactString, redactValue } from "./log-redaction.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SERVICE = process.env.OTEL_SERVICE_NAME ?? "unknown";

function resolveThreshold(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return LEVEL_ORDER[raw];
  }
  return LEVEL_ORDER.info;
}

const THRESHOLD = resolveThreshold();

type Ctx = Record<string, unknown>;

function serializeCtx(ctx: Ctx | undefined): Ctx {
  if (!ctx) return {};
  return redactValue(ctx) as Ctx;
}

export type LogSink = (level: LogLevel, msg: string, line: string, ctx?: Ctx) => void;

const sinks: LogSink[] = [];

export function registerLogSink(sink: LogSink): () => void {
  sinks.push(sink);
  return () => {
    const idx = sinks.indexOf(sink);
    if (idx >= 0) sinks.splice(idx, 1);
  };
}

function emit(level: LogLevel, msg: string, ctx?: Ctx): void {
  if (LEVEL_ORDER[level] < THRESHOLD) return;
  let line: string;
  try {
    const record = {
      ts: new Date().toISOString(),
      level,
      service: SERVICE,
      msg: redactString(msg),
      ...serializeCtx(ctx),
    };
    line = `${JSON.stringify(record)}\n`;
  } catch (err) {
    const fallback = {
      ts: new Date().toISOString(),
      level,
      service: SERVICE,
      msg: redactString(msg),
      _serializeError: redactString(err instanceof Error ? err.message : String(err)),
    };
    line = `${JSON.stringify(fallback)}\n`;
  }
  try {
    process.stdout.write(line);
  } catch {
    // stdout may be unavailable in rare test scenarios; silently drop
  }
  for (const sink of sinks) {
    try {
      sink(level, redactString(msg), line.trimEnd(), serializeCtx(ctx));
    } catch {
      // Sinks must not break the logger
    }
  }
}

export const logger = {
  debug(msg: string, ctx?: Ctx): void {
    emit("debug", msg, ctx);
  },
  info(msg: string, ctx?: Ctx): void {
    emit("info", msg, ctx);
  },
  warn(msg: string, ctx?: Ctx): void {
    emit("warn", msg, ctx);
  },
  error(msg: string, ctx?: Ctx): void {
    emit("error", msg, ctx);
  },
};
