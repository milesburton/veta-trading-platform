import type { AuthResult, GatewayContext } from "../gateway/context.ts";
import { handleAdminRoute } from "../gateway/routes/admin.ts";
import { handleAlertsRoute } from "../gateway/routes/alerts.ts";
import { handleAnalyticsRoute } from "../gateway/routes/analytics.ts";
import { handleBugReportRoute } from "../gateway/routes/bug-report.ts";
import { handleLlmAdvisoryRoute } from "../gateway/routes/llm-advisory.ts";
import { handleLoadgenAnnounceRoute } from "../gateway/routes/loadgen-announce.ts";
import { handleLogsRoute } from "../gateway/routes/logs.ts";
import { handleProxiedRoutes } from "../gateway/routes/proxied.ts";
import { handleScenariosRoute } from "../gateway/routes/scenarios.ts";
import { handleTelemetryRoute } from "../gateway/routes/telemetry.ts";
import { handleTicketAttachmentsRoute } from "../gateway/routes/ticket-attachments.ts";
import { handleWebSocketRoute } from "../gateway/routes/websocket.ts";

type RouteHandler = (req: Request, path: string, ctx: GatewayContext) => unknown;

export const ROUTES_DIR = new URL("../gateway/routes/", import.meta.url);
export const GATEWAY_SOURCE = new URL("../gateway/gateway.ts", import.meta.url);

export const HANDLERS: Record<string, RouteHandler> = {
  "admin.ts": handleAdminRoute,
  "alerts.ts": handleAlertsRoute,
  "analytics.ts": handleAnalyticsRoute,
  "bug-report.ts": handleBugReportRoute,
  "llm-advisory.ts": handleLlmAdvisoryRoute,
  "loadgen-announce.ts": handleLoadgenAnnounceRoute,
  "logs.ts": handleLogsRoute,
  "proxied.ts": handleProxiedRoutes,
  "scenarios.ts": handleScenariosRoute,
  "telemetry.ts": handleTelemetryRoute,
  "ticket-attachments.ts": handleTicketAttachmentsRoute,
  "websocket.ts": (req, path, ctx) =>
    req.method !== "GET"
      ? null
      : handleWebSocketRoute(req, path, ctx, {
          validateToken: () => Promise.resolve<AuthResult | null>(null),
        }),
};

export const METHODS = ["GET", "POST", "PUT", "DELETE"] as const;
const UNREACHABLE = "http://127.0.0.1:1";

const PLAIN_WORD = /^[\w-]+$/;

function expandGroups(pattern: string): string[] {
  const group = pattern.match(/\(([^()]*)\)/);
  if (!group) return [pattern];
  const options = group[1].split("|");
  const replacements = options.every((o) => PLAIN_WORD.test(o)) ? options : ["x"];
  return replacements.flatMap((replacement) =>
    expandGroups(pattern.replace(group[0], replacement))
  );
}

function instantiateRegexSource(source: string): string[] {
  const withoutOptional = source.replace(/\((?:[^()]*)\)\?/g, "");
  return expandGroups(withoutOptional).map((p) =>
    p.replace(/^\^/, "").replace(/\$$/, "").replace(/\\\//g, "/")
  );
}

export function discoverCandidatePaths(source: string): string[] {
  const literals = [...source.matchAll(/["'`](\/[\w\-/]*)["'`]/g)].map((m) => m[1]);
  const regexes = [
    ...source.matchAll(/\/(\^\\\/(?:\[[^\]\n]*\]|[^/\n[]|\\\/)*?\$?)\/[gimsuy]*\s*[,;)]/g),
  ].flatMap((m) => instantiateRegexSource(m[1]));
  return [...new Set([...literals, ...regexes])].filter((p) => p.startsWith("/"));
}

export function makeProbeContext(
  authenticate: () => AuthResult | Response,
  onAuthCheck: () => void = () => undefined
): GatewayContext {
  const urls = new Proxy({}, { get: () => UNREACHABLE });
  return {
    requireAuth: () => {
      onAuthCheck();
      return Promise.resolve(authenticate());
    },
    urls,
    producer: { send: () => Promise.resolve() },
    publishAccessEvent: () => undefined,
    publicGuestTradingEnabled: false,
  } as unknown as GatewayContext;
}

export function asRole(role: string): AuthResult {
  return {
    user: { id: "u-probe", name: "Probe", role, avatar_emoji: "" },
    limits: { max_order_qty: 100, max_daily_notional: 1_000_000, allowed_strategies: [] },
  };
}

export function unauthenticated(): Response {
  return new Response('{"error":"unauthenticated"}', { status: 401 });
}

export function probeRequest(method: string, path: string): Request {
  return new Request(`http://gw${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" ? undefined : "{}",
  });
}
