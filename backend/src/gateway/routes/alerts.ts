import { CORS_HEADERS } from "@veta/http";
import { type GatewayContext, isResponse } from "../context.ts";
import { notifyDiscord } from "../discord-notifier.ts";
import { platformStats } from "../platform-stats.ts";
import { createTicketForAlert } from "../ticketing.ts";

export async function handleAlertsRoute(
  req: Request,
  path: string,
  ctx: GatewayContext,
): Promise<Response | null> {
  if (path === "/alerts" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return forward(`${ctx.urls.userService}/users/${auth.user.id}/alerts`, req);
  }

  if (path === "/alerts" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    const body = await req.arrayBuffer();
    void notifyDiscordFromBody(body, auth.user.id);
    return forward(`${ctx.urls.userService}/users/${auth.user.id}/alerts`, req, {
      method: "POST",
      body,
      contentType: "application/json",
    });
  }

  if (path === "/alerts/dismiss-all" && req.method === "PUT") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return forward(
      `${ctx.urls.userService}/users/${auth.user.id}/alerts/dismiss-all`,
      req,
      { method: "PUT" },
    );
  }

  const dismissMatch = path.match(/^\/alerts\/([^/]+)\/dismiss$/);
  if (req.method === "PUT" && dismissMatch) {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return forward(
      `${ctx.urls.userService}/users/${auth.user.id}/alerts/${dismissMatch[1]}/dismiss`,
      req,
      { method: "PUT" },
    );
  }

  return null;
}

function pickString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

interface SanitisedAlert {
  severity?: string;
  source?: string;
  message?: string;
  detail?: string;
}

function sanitiseAlert(body: ArrayBuffer): SanitisedAlert | null {
  try {
    const candidate = JSON.parse(new TextDecoder().decode(body));
    if (!candidate || typeof candidate !== "object") return null;
    const raw = candidate as Record<string, unknown>;
    return {
      severity: pickString(raw.severity),
      source: pickString(raw.source),
      message: pickString(raw.message),
      detail: pickString(raw.detail),
    };
  } catch {
    return null;
  }
}

async function notifyDiscordFromBody(body: ArrayBuffer, userId: string): Promise<void> {
  const alert = sanitiseAlert(body);
  if (!alert) return;
  platformStats.recordAlert({
    severity: alert.severity ?? "UNKNOWN",
    source: alert.source ?? "unknown",
    message: alert.message ?? "",
    ts: Date.now(),
  });
  await Promise.allSettled([
    notifyDiscord(alert, userId),
    createTicketForAlert(alert, userId),
  ]);
}

interface ForwardOptions {
  method?: string;
  body?: BodyInit;
  contentType?: string;
}

async function forward(
  url: string,
  req: Request,
  opts: ForwardOptions = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    cookie: req.headers.get("cookie") ?? "",
  };
  if (opts.contentType) headers["Content-Type"] = opts.contentType;
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body,
      signal: AbortSignal.timeout(8_000),
    });
    const resBody = await res.arrayBuffer();
    return new Response(resBody, {
      status: res.status,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}
