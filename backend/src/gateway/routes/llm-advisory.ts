import { type GatewayContext, isResponse } from "../context.ts";

const LLM_ADVISORY_PATH = "/api/gateway/llm-advisory";
const ALLOWED_ROLES = new Set([
  "trader",
  "desk-head",
  "risk-manager",
  "compliance",
  "admin",
]);

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const forwardHeaders = (req: Request): Record<string, string> => {
  const headers: Record<string, string> = {};
  const cookie = req.headers.get("cookie");
  if (cookie) headers["cookie"] = cookie;
  const contentType = req.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;
  return headers;
};

const buildFetchInit = async (req: Request): Promise<RequestInit> => {
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return {
    method: req.method,
    headers: forwardHeaders(req),
    signal: AbortSignal.timeout(15_000),
    ...(hasBody ? { body: await req.text() } : {}),
  };
};

const relayResponse = (res: Response, body: ArrayBuffer): Response => {
  const headers: Record<string, string> = {
    "Content-Type": res.headers.get("Content-Type") ?? "application/json",
  };
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) headers["Set-Cookie"] = setCookie;
  return new Response(body, { status: res.status, headers });
};

const proxyToLlmAdvisory = async (
  targetUrl: string,
  req: Request,
): Promise<Response> => {
  try {
    const res = await fetch(targetUrl, await buildFetchInit(req));
    return relayResponse(res, await res.arrayBuffer());
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 502);
  }
};

export async function handleLlmAdvisoryRoute(
  req: Request,
  path: string,
  ctx: GatewayContext,
): Promise<Response | null> {
  if (path !== LLM_ADVISORY_PATH) return null;

  const auth = await ctx.requireAuth(req);
  if (isResponse(auth)) return auth;
  if (!ALLOWED_ROLES.has(auth.user.role)) {
    return jsonResponse({ error: "forbidden" }, 403);
  }

  const upstreamPath = path.replace("/api/gateway", "");
  const targetUrl = `${ctx.urls.llmAdvisory}${upstreamPath}${new URL(req.url).search}`;
  return proxyToLlmAdvisory(targetUrl, req);
}
