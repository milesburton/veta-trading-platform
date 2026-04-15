export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SERVICE = Deno.env.get("OTEL_SERVICE_NAME") ?? "unknown";

function resolveThreshold(): number {
  const raw = (Deno.env.get("LOG_LEVEL") ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return LEVEL_ORDER[raw];
  }
  return LEVEL_ORDER.info;
}

const THRESHOLD = resolveThreshold();
const encoder = new TextEncoder();

type Ctx = Record<string, unknown>;

function serializeErr(err: Error): Record<string, string> {
  return {
    name: err.name,
    message: err.message,
    stack: err.stack ?? "",
  };
}

function serializeCtx(ctx: Ctx | undefined): Ctx {
  if (!ctx) return {};
  const out: Ctx = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (value instanceof Error) {
      out[key] = serializeErr(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function emit(level: LogLevel, msg: string, ctx?: Ctx): void {
  if (LEVEL_ORDER[level] < THRESHOLD) return;
  let line: string;
  try {
    const record = {
      ts: new Date().toISOString(),
      level,
      service: SERVICE,
      msg,
      ...serializeCtx(ctx),
    };
    line = JSON.stringify(record) + "\n";
  } catch (err) {
    const fallback = {
      ts: new Date().toISOString(),
      level,
      service: SERVICE,
      msg,
      _serializeError: err instanceof Error ? err.message : String(err),
    };
    line = JSON.stringify(fallback) + "\n";
  }
  try {
    Deno.stdout.writeSync(encoder.encode(line));
  } catch {
    // stdout may be unavailable in rare test scenarios; silently drop
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
