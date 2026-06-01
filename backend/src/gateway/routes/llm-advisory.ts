import { type GatewayContext } from "../context.ts";
import { isResponse } from "../context.ts";

export async function handleLlmAdvisoryRoute(
  req: Request,
  path: string,
  ctx: GatewayContext,
): Promise<Response | null> {
  if (path !== "/api/gateway/llm-advisory") {
    return null;
  }

  const auth = await ctx.requireAuth(req);
  if (isResponse(auth)) return auth;

  const allowedRoles = new Set(["trader", "desk-head", "risk-manager", "compliance", "admin"]);
  if (!allowedRoles.has(auth.user.role)) {
    return new Response(
      JSON.stringify({ error: "forbidden" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const targetUrl = `${ctx.urls.llmAdvisory}${path.replace("/api/gateway", "")}${new URL(req.url).search}`;
  try {
    const headers: Record<string, string> = {};
    const cookie = req.headers.get("cookie");
    if (cookie) headers["cookie"] = cookie;
    const ct = req.headers.get("content-type");
    if (ct) headers["content-type"] = ct;
    
    const fetchInit: RequestInit = { 
      method: req.method, 
      headers,
      signal: AbortSignal.timeout(15_000) 
    };
    
    if (req.method !== "GET" && req.method !== "HEAD") {
      fetchInit.body = await req.text();
    }
    
    const res = await fetch(targetUrl, fetchInit);
    const resBody = await res.arrayBuffer();
    const resHeaders: Record<string, string> = {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
    };
    
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) resHeaders["Set-Cookie"] = setCookie;
    
    return new Response(resBody, { status: res.status, headers: resHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 502, 
      headers: { "Content-Type": "application/json" },
    });
  }
}