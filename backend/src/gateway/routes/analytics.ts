import { CORS_HEADERS } from "@veta/http";
import { type AuthResult, type GatewayContext, isResponse } from "../context.ts";
import { proxyGet, proxyPost, proxyPut } from "../proxy.ts";

function requireAdmin(auth: AuthResult): Response | null {
  if (auth.user.role !== "admin") {
    return new Response(JSON.stringify({ error: "Admin role required" }), {
      status: 403,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
  return null;
}

export async function handleAnalyticsRoute(
  req: Request,
  path: string,
  ctx: GatewayContext,
): Promise<Response | null> {
  const url = new URL(req.url);
  const ANALYTICS_URL = ctx.urls.analytics;
  const SIGNAL_ENGINE_URL = ctx.urls.signalEngine;
  const FEATURE_ENGINE_URL = ctx.urls.featureEngine;
  const RECOMMENDATION_ENGINE_URL = ctx.urls.recommendationEngine;
  const SCENARIO_ENGINE_URL = ctx.urls.scenarioEngine;
  const LLM_ADVISORY_URL = ctx.urls.llmAdvisory;

  // ── Analytics ────────────────────────────────────────────────
  if (path === "/analytics/quote" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ANALYTICS_URL}/quote`, req);
  }
  if (path === "/analytics/scenario" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ANALYTICS_URL}/scenario`, req);
  }
  if (path === "/analytics/recommend" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ANALYTICS_URL}/recommend`, req);
  }
  const volProfileMatch = path.match(/^\/analytics\/vol-profile\/(.+)$/);
  if (volProfileMatch && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(
      `${ANALYTICS_URL}/vol-profile/${encodeURIComponent(volProfileMatch[1])}${url.search}`,
      req,
    );
  }
  const greeksSurfaceMatch = path.match(/^\/analytics\/greeks-surface\/(.+)$/);
  if (greeksSurfaceMatch && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(
      `${ANALYTICS_URL}/greeks-surface/${encodeURIComponent(greeksSurfaceMatch[1])}${url.search}`,
      req,
    );
  }
  if (path === "/analytics/bond-price" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ANALYTICS_URL}/bond-price`, req);
  }
  if (path === "/analytics/yield-curve" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ANALYTICS_URL}/yield-curve`, req);
  }
  const priceFanMatch = path.match(/^\/analytics\/price-fan\/(.+)$/);
  if (priceFanMatch && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(
      `${ANALYTICS_URL}/price-fan/${encodeURIComponent(priceFanMatch[1])}${url.search}`,
      req,
    );
  }
  if (path === "/analytics/spread-analysis" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ANALYTICS_URL}/spread-analysis`, req);
  }
  if (path === "/analytics/duration-ladder" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ANALYTICS_URL}/duration-ladder`, req);
  }
  const volSurfaceMatch = path.match(/^\/analytics\/vol-surface\/(.+)$/);
  if (volSurfaceMatch && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(
      `${ANALYTICS_URL}/vol-surface/${encodeURIComponent(volSurfaceMatch[1])}${url.search}`,
      req,
    );
  }

  // ── Intelligence ─────────────────────────────────────────────
  const featureMatch = path.match(/^\/intelligence\/features(\/.*)?$/);
  if (featureMatch && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${FEATURE_ENGINE_URL}/features${featureMatch[1] ?? ""}`, req);
  }
  const signalMatch = path.match(/^\/intelligence\/signals(\/.*)?$/);
  if (signalMatch && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${SIGNAL_ENGINE_URL}/signals${signalMatch[1] ?? ""}`, req);
  }
  if (path === "/intelligence/weights" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${SIGNAL_ENGINE_URL}/weights`, req);
  }
  if (path === "/intelligence/weights" && req.method === "PUT") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    const adminRej = requireAdmin(auth);
    if (adminRej) return adminRej;
    return proxyPut(`${SIGNAL_ENGINE_URL}/weights`, req);
  }
  if (path === "/intelligence/recommendations" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${RECOMMENDATION_ENGINE_URL}/recommendations`, req);
  }
  if (path === "/intelligence/scenario" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${SCENARIO_ENGINE_URL}/scenario`, req);
  }
  if (path === "/intelligence/replay" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${SIGNAL_ENGINE_URL}/replay`, req);
  }

  // ── Advisory ─────────────────────────────────────────────────
  const advisoryNoteMatch = path.match(/^\/advisory\/([^/]+)$/);
  if (advisoryNoteMatch && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${LLM_ADVISORY_URL}/advisory/${advisoryNoteMatch[1]}`, req);
  }
  if (path === "/advisory/request" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    const body = await req.text();
    const parsed = JSON.parse(body) as { symbol?: string };
    return proxyPost(`${LLM_ADVISORY_URL}/advisory/request`, new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...parsed, requestedBy: auth.user.id }),
    }));
  }
  if (path === "/advisory/jobs" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${LLM_ADVISORY_URL}/jobs`, req);
  }
  if (path === "/advisory/admin/state" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    const adminRej = requireAdmin(auth);
    if (adminRej) return adminRej;
    return proxyGet(`${LLM_ADVISORY_URL}/admin/state`, req);
  }
  if (path === "/advisory/admin/state" && req.method === "PUT") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    const adminRej = requireAdmin(auth);
    if (adminRej) return adminRej;
    const body = await req.text();
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return proxyPut(`${LLM_ADVISORY_URL}/admin/state`, new Request(req.url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...parsed, updatedBy: auth.user.id }),
    }));
  }
  if (path === "/advisory/admin/watchlist-brief" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    const body = await req.text();
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return proxyPost(`${LLM_ADVISORY_URL}/admin/watchlist-brief`, new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...parsed, requestedBy: auth.user.id }),
    }));
  }
  if (path === "/advisory/admin/trigger-worker" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    const adminRej = requireAdmin(auth);
    if (adminRej) return adminRej;
    return proxyPost(`${LLM_ADVISORY_URL}/admin/trigger-worker`, req);
  }

  return null;
}
