// fallow-ignore-file unused-file
import { CORS_HEADERS } from "@veta/http";
import { recordGauge } from "@veta/telemetry";
import { type GatewayContext, isResponse } from "../context.ts";

interface FrontendMemorySample {
  ts: number;
  userId: string;
  jsHeapSizeUsed: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  userAgent: string;
}

const RING_CAPACITY_PER_USER = 100;
const samples = new Map<string, FrontendMemorySample[]>();

function pushSample(s: FrontendMemorySample): void {
  const arr = samples.get(s.userId) ?? [];
  arr.push(s);
  if (arr.length > RING_CAPACITY_PER_USER) arr.shift();
  samples.set(s.userId, arr);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const REQUIRED_FIELDS = ["jsHeapSizeUsed", "totalJSHeapSize", "jsHeapSizeLimit"] as const;

function isValidSamplePayload(body: unknown): body is Pick<
  FrontendMemorySample,
  (typeof REQUIRED_FIELDS)[number]
> {
  const s = body as Record<string, unknown> | null;
  return Boolean(s) && REQUIRED_FIELDS.every((f) => typeof s?.[f] === "number");
}

async function handlePost(req: Request, userId: string): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }
  if (!isValidSamplePayload(body)) {
    return jsonResponse({ error: "missing memory fields" }, 400);
  }
  pushSample({
    ts: Date.now(),
    userId,
    jsHeapSizeUsed: body.jsHeapSizeUsed,
    totalJSHeapSize: body.totalJSHeapSize,
    jsHeapSizeLimit: body.jsHeapSizeLimit,
    userAgent: req.headers.get("user-agent") ?? "unknown",
  });
  recordFrontendHeapMax();
  return jsonResponse({ ok: true }, 200);
}

function recordFrontendHeapMax(): void {
  let max = 0;
  for (const arr of samples.values()) {
    const latest = arr[arr.length - 1];
    if (latest && latest.jsHeapSizeUsed > max) max = latest.jsHeapSizeUsed;
  }
  recordGauge("frontend_memory_heap_used_max_bytes", max, {
    description: "Max jsHeapSizeUsed across all live browser sessions (last sample per user)",
    unit: "By",
  }).catch(() => {});
}

function handleGet(role: string): Response {
  if (role !== "admin" && role !== "oncall") {
    return jsonResponse({ error: "forbidden" }, 403);
  }
  const all: Record<string, FrontendMemorySample[]> = {};
  for (const [uid, arr] of samples) all[uid] = arr;
  return jsonResponse({ samples: all }, 200);
}

type HandlerForMethod = (
  req: Request,
  user: { id: string; role: string },
) => Promise<Response> | Response;

const METHOD_HANDLERS: Record<string, HandlerForMethod | undefined> = {
  POST: (req, user) => handlePost(req, user.id),
  GET: (_req, user) => handleGet(user.role),
};

// fallow-ignore-next-line unused-export
export async function handleTelemetryRoute(
  req: Request,
  path: string,
  context: GatewayContext,
): Promise<Response | null> {
  if (path !== "/telemetry/frontend") return null;
  const authResult = await context.requireAuth(req);
  if (isResponse(authResult)) return authResult;
  const handler = METHOD_HANDLERS[req.method];
  return handler ? await handler(req, authResult.user) : null;
}
