import { CORS_HEADERS } from "@veta/http";
import { type GatewayContext, isResponse } from "../context.ts";

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
