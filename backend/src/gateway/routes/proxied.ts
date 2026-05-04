import { CORS_HEADERS } from "@veta/http";
import { type GatewayContext, isResponse } from "../context.ts";
import { proxyGet, proxyPost, proxyPut } from "../proxy.ts";

interface ForwardOptions {
  method?: string;
  body?: BodyInit;
  contentType?: string;
}

async function forwardWithCookie(
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

export async function handleProxiedRoutes(
  req: Request,
  path: string,
  ctx: GatewayContext,
): Promise<Response | null> {
  const url = new URL(req.url);

  // ── User self-info ───────────────────────────────────────────
  if (path === "/me" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return new Response(JSON.stringify({ user: auth.user, limits: auth.limits }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  // ── Reference data ───────────────────────────────────────────
  if (path === "/assets" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${ctx.urls.marketSim}/assets`, req);
  }
  if (path === "/data-depth" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${ctx.urls.journal}/data-depth`, req);
  }
  if (path === "/candles" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${ctx.urls.journal}/candles`, req);
  }
  if (path === "/orders" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${ctx.urls.journal}/orders`, req);
  }

  // ── Dark pool / CCP ──────────────────────────────────────────
  if (path === "/pool/stats" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${ctx.urls.darkPool}/pool/stats`, req);
  }
  if (path === "/ccp/stats" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${ctx.urls.ccpService}/ccp/stats`, req);
  }
  if (path === "/ccp/settlements" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${ctx.urls.ccpService}/ccp/settlements`, req);
  }
  const ccpSettlementDateMatch = path.match(/^\/ccp\/settlements\/([^/]+)$/);
  if (ccpSettlementDateMatch && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(
      `${ctx.urls.ccpService}/ccp/settlements/${ccpSettlementDateMatch[1]}`,
      req,
    );
  }
  const ccpMarginMatch = path.match(/^\/ccp\/margin\/([^/]+)$/);
  if (ccpMarginMatch && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    const targetUserId = ccpMarginMatch[1];
    if (
      auth.user.id !== targetUserId &&
      auth.user.role !== "admin" &&
      auth.user.role !== "compliance"
    ) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
    return proxyGet(`${ctx.urls.ccpService}/ccp/margin/${targetUserId}`, req);
  }

  // ── RFQ ──────────────────────────────────────────────────────
  if (path === "/rfq/stats" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${ctx.urls.rfqService}/rfq/stats`, req);
  }
  if (path === "/rfq" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    const target = new URL(`${ctx.urls.rfqService}/rfq`);
    target.search = url.search;
    if (!target.searchParams.has("userId")) target.searchParams.set("userId", auth.user.id);
    try {
      const res = await fetch(target.toString(), { signal: AbortSignal.timeout(8_000) });
      const body = await res.arrayBuffer();
      return new Response(body, {
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
  const rfqIdMatch = path.match(/^\/rfq\/([^/]+)(\/execute)?$/);
  if (rfqIdMatch) {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    const rfqId = rfqIdMatch[1];
    const isExecute = rfqIdMatch[2] === "/execute";
    if (isExecute && req.method === "POST") {
      return proxyPost(`${ctx.urls.rfqService}/rfq/${rfqId}/execute`, req);
    }
    if (!isExecute && req.method === "GET") {
      return proxyGet(`${ctx.urls.rfqService}/rfq/${rfqId}`, req);
    }
  }
  if (path === "/rfq/sellside" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ctx.urls.rfqService}/rfq/sellside`, req);
  }
  if (path === "/rfq/sellside" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${ctx.urls.rfqService}/rfq/sellside${url.search}`, req);
  }
  if (path === "/rfq/sellside/stats" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${ctx.urls.rfqService}/rfq/sellside/stats`, req);
  }
  const matchSsRfq = path.match(/^\/rfq\/sellside\/([^/]+)$/);
  if (matchSsRfq && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${ctx.urls.rfqService}/rfq/sellside/${matchSsRfq[1]}`, req);
  }
  const matchSsRoute = path.match(
    /^\/rfq\/sellside\/([^/]+)\/(route|markup|confirm|reject)$/,
  );
  if (matchSsRoute && req.method === "PUT") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPut(
      `${ctx.urls.rfqService}/rfq/sellside/${matchSsRoute[1]}/${matchSsRoute[2]}`,
      req,
    );
  }

  // ── Products ─────────────────────────────────────────────────
  if (path === "/products" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    const qs = new URLSearchParams(url.search);
    if (auth.user.role === "external-client") {
      qs.set("userId", auth.user.id);
      qs.set("userRole", "external-client");
    }
    return proxyGet(`${ctx.urls.productService}/products?${qs.toString()}`, req);
  }
  if (path === "/products/stats" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${ctx.urls.productService}/products/stats`, req);
  }
  if (path === "/products" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ctx.urls.productService}/products`, req);
  }
  const matchProductId = path.match(/^\/products\/([^/]+)$/);
  if (matchProductId && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${ctx.urls.productService}/products/${matchProductId[1]}`, req);
  }
  const matchProductAction = path.match(
    /^\/products\/([^/]+)\/(legs|structure|issue|sell|unwind)$/,
  );
  if (matchProductAction && req.method === "PUT") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPut(
      `${ctx.urls.productService}/products/${matchProductAction[1]}/${matchProductAction[2]}`,
      req,
    );
  }

  // ── Grid query ───────────────────────────────────────────────
  if (path === "/grid/query" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    try {
      const body = await req.text();
      const res = await fetch(`${ctx.urls.journal}/grid/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": auth.user.id,
        },
        body,
        signal: AbortSignal.timeout(10_000),
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

  // ── Preferences ──────────────────────────────────────────────
  if (path === "/preferences" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return forwardWithCookie(
      `${ctx.urls.userService}/users/${auth.user.id}/preferences`,
      req,
    );
  }
  if (path === "/preferences" && req.method === "PUT") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    const body = await req.arrayBuffer();
    return forwardWithCookie(
      `${ctx.urls.userService}/users/${auth.user.id}/preferences`,
      req,
      { method: "PUT", body, contentType: "application/json" },
    );
  }

  // ── Shared workspaces ────────────────────────────────────────
  if (path === "/shared-workspaces" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return forwardWithCookie(`${ctx.urls.userService}/shared-workspaces`, req);
  }
  if (path === "/shared-workspaces" && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    const body = await req.arrayBuffer();
    return forwardWithCookie(`${ctx.urls.userService}/shared-workspaces`, req, {
      method: "POST",
      body,
      contentType: "application/json",
    });
  }
  const sharedWsMatch = path.match(/^\/shared-workspaces\/([^/]+)$/);
  if (sharedWsMatch && req.method === "DELETE") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return forwardWithCookie(
      `${ctx.urls.userService}/shared-workspaces/${sharedWsMatch[1]}`,
      req,
      { method: "DELETE" },
    );
  }
  if (sharedWsMatch && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return forwardWithCookie(
      `${ctx.urls.userService}/shared-workspaces/${sharedWsMatch[1]}`,
      req,
    );
  }

  // ── Market-data sources/overrides ────────────────────────────
  if (path === "/market-data/sources" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${ctx.urls.marketData}/sources`, req);
  }
  if (path === "/market-data/overrides" && req.method === "GET") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${ctx.urls.marketData}/overrides`, req);
  }
  if (path === "/market-data/overrides" && req.method === "PUT") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPut(`${ctx.urls.marketData}/overrides`, req);
  }
  const mdsToggleMatch = path.match(/^\/market-data\/sources\/([^/]+)\/toggle$/);
  if (mdsToggleMatch && req.method === "POST") {
    const auth = await ctx.requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ctx.urls.marketData}/sources/${mdsToggleMatch[1]}/toggle`, req);
  }

  return null;
}
