import { CORS_HEADERS } from "@veta/http";
import { type GatewayContext, isResponse } from "../context.ts";

const LOKI_URL = Deno.env.get("LOKI_URL") ?? "";

interface LogLine {
  ts: number;
  service: string;
  level: string;
  message: string;
  trace_id?: string;
  raw: string;
}

interface RingBuffer {
  push(line: LogLine): void;
  recent(limit: number): LogLine[];
}

const RING_CAPACITY = 2_000;

function makeRingBuffer(): RingBuffer {
  const buf: LogLine[] = [];
  return {
    push(line) {
      buf.push(line);
      if (buf.length > RING_CAPACITY) buf.shift();
    },
    recent(limit) {
      return buf.slice(-limit).reverse();
    },
  };
}

const ringBuffer = makeRingBuffer();

export function recordLogLine(line: Omit<LogLine, "ts" | "raw">, raw: string, ts = Date.now()): void {
  ringBuffer.push({ ...line, ts, raw });
}

function parseDuration(s: string | null): number {
  if (!s) return 5 * 60_000;
  const match = s.match(/^(\d+)([smh])$/);
  if (!match) return 5 * 60_000;
  const n = Number(match[1]);
  const unit = match[2];
  return n * (unit === "h" ? 3_600_000 : unit === "m" ? 60_000 : 1_000);
}

async function queryLoki(
  service: string | null,
  level: string | null,
  search: string | null,
  sinceMs: number,
  limit: number,
): Promise<LogLine[]> {
  if (!LOKI_URL) return [];
  const filters: string[] = [];
  if (service) filters.push(`service_name="${service}"`);
  if (filters.length === 0) filters.push(`service_name=~".+"`);

  let logQL = `{${filters.join(",")}}`;
  if (level) logQL += ` |~ "(?i)\\"level\\":\\"${level}"`;
  if (search) {
    const escaped = search.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    logQL += ` |~ "(?i)${escaped}"`;
  }

  const params = new URLSearchParams({
    query: logQL,
    limit: String(limit),
    start: String((Date.now() - sinceMs) * 1_000_000),
    end: String(Date.now() * 1_000_000),
    direction: "backward",
  });

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5_000);
  try {
    const res = await fetch(`${LOKI_URL}/loki/api/v1/query_range?${params.toString()}`, {
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      data?: { result?: Array<{ stream?: Record<string, string>; values?: Array<[string, string]> }> };
    };
    const out: LogLine[] = [];
    for (const stream of body.data?.result ?? []) {
      const labels = stream.stream ?? {};
      for (const [tsNs, raw] of stream.values ?? []) {
        let parsed: { msg?: string; level?: string; trace_id?: string } = {};
        try {
          parsed = JSON.parse(raw);
        } catch {
          // not JSON — treat as plain message
        }
        out.push({
          ts: Math.floor(Number(tsNs) / 1_000_000),
          service: labels.service_name ?? "unknown",
          level: parsed.level ?? labels.level ?? "info",
          message: parsed.msg ?? raw,
          trace_id: parsed.trace_id,
          raw,
        });
      }
    }
    return out.sort((a, b) => b.ts - a.ts).slice(0, limit);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

function filterRingBuffer(
  service: string | null,
  level: string | null,
  search: string | null,
  sinceMs: number,
  limit: number,
): LogLine[] {
  const cutoff = Date.now() - sinceMs;
  const re = search ? new RegExp(search, "i") : null;
  return ringBuffer
    .recent(RING_CAPACITY)
    .filter((l) => {
      if (l.ts < cutoff) return false;
      if (service && l.service !== service) return false;
      if (level && l.level.toLowerCase() !== level.toLowerCase()) return false;
      if (re && !re.test(l.raw)) return false;
      return true;
    })
    .slice(0, limit);
}

export async function handleLogsRoute(
  req: Request,
  path: string,
  context: GatewayContext,
): Promise<Response | null> {
  if (path !== "/logs/query") return null;

  const authResult = await context.requireAuth(req);
  if (isResponse(authResult)) return authResult;
  if (authResult.user.role === "viewer" || authResult.user.role === "external-client") {
    return new Response(JSON.stringify({ error: "Insufficient permission" }), {
      status: 403,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const url = new URL(req.url);
  const service = url.searchParams.get("service");
  const level = url.searchParams.get("level");
  const search = url.searchParams.get("q");
  const sinceMs = parseDuration(url.searchParams.get("since"));
  const rawLimit = Number(url.searchParams.get("limit") ?? "200");
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 200;

  let lines: LogLine[] = [];
  let source: "loki" | "ring-buffer" = "ring-buffer";

  if (LOKI_URL) {
    lines = await queryLoki(service, level, search, sinceMs, limit);
    source = "loki";
  }

  if (lines.length === 0) {
    lines = filterRingBuffer(service, level, search, sinceMs, limit);
    source = "ring-buffer";
  }

  return new Response(
    JSON.stringify({
      lines,
      source,
      lokiConfigured: Boolean(LOKI_URL),
      ringSize: RING_CAPACITY,
    }),
    { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
  );
}
