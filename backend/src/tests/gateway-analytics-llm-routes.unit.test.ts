import { afterEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import type { GatewayContext, ServiceUrls } from "../gateway/context.ts";
import { handleAnalyticsRoute } from "../gateway/routes/analytics.ts";
import { handleLlmAdvisoryRoute } from "../gateway/routes/llm-advisory.ts";

const URLS = {
  analytics: "http://analytics",
  signalEngine: "http://signal",
  featureEngine: "http://feature",
  recommendationEngine: "http://recommend",
  scenarioEngine: "http://scenario",
  llmAdvisory: "http://advisory",
} as ServiceUrls;

interface Upstream {
  url: string;
  method: string;
  body: string | null;
  cookie: string | null;
}

function stubUpstream(
  respond: () => Response | Promise<Response> = () => new Response("{}", { status: 200 })
): Upstream[] {
  const calls: Upstream[] = [];
  vi.stubGlobal("fetch", (input: Request | URL | string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
      cookie: headers.cookie ?? null,
    });
    return Promise.resolve(respond());
  });
  return calls;
}

function context(role: string | null): GatewayContext {
  return {
    urls: URLS,
    requireAuth: () =>
      Promise.resolve(
        role === null
          ? new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
          : {
              user: { id: "u-7", name: "Test", role, avatar_emoji: "x" },
              limits: { max_order_qty: 1, max_daily_notional: 1, allowed_strategies: [] },
            }
      ),
  } as unknown as GatewayContext;
}

function request(method: string, path: string, body?: unknown, headers: HeadersInit = {}): Request {
  return new Request(`http://gw${path}`, {
    method,
    headers,
    ...(body === undefined || method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const ROUTES: [method: string, path: string, upstream: string][] = [
  ["POST", "/analytics/quote", "http://analytics/quote"],
  ["POST", "/analytics/scenario", "http://analytics/scenario"],
  ["POST", "/analytics/recommend", "http://analytics/recommend"],
  ["GET", "/analytics/vol-profile/AAPL", "http://analytics/vol-profile/AAPL"],
  ["GET", "/analytics/greeks-surface/AAPL", "http://analytics/greeks-surface/AAPL"],
  ["POST", "/analytics/bond-price", "http://analytics/bond-price"],
  ["POST", "/analytics/yield-curve", "http://analytics/yield-curve"],
  ["GET", "/analytics/price-fan/AAPL", "http://analytics/price-fan/AAPL"],
  ["POST", "/analytics/spread-analysis", "http://analytics/spread-analysis"],
  ["POST", "/analytics/duration-ladder", "http://analytics/duration-ladder"],
  ["GET", "/analytics/vol-surface/AAPL", "http://analytics/vol-surface/AAPL"],
  ["GET", "/intelligence/features", "http://feature/features"],
  ["GET", "/intelligence/features/AAPL", "http://feature/features/AAPL"],
  ["GET", "/intelligence/signals", "http://signal/signals"],
  ["GET", "/intelligence/signals/AAPL", "http://signal/signals/AAPL"],
  ["GET", "/intelligence/weights", "http://signal/weights"],
  ["GET", "/intelligence/recommendations", "http://recommend/recommendations"],
  ["POST", "/intelligence/scenario", "http://scenario/scenario"],
  ["POST", "/intelligence/replay", "http://signal/replay"],
  ["GET", "/advisory/note-1", "http://advisory/advisory/note-1"],
  ["GET", "/advisory/jobs", "http://advisory/jobs"],
];

test("[analytics-route] every proxied path forwards to its upstream service", async () => {
  for (const [method, path, upstream] of ROUTES) {
    const calls = stubUpstream(() => new Response('{"ok":true}', { status: 200 }));
    const res = await handleAnalyticsRoute(
      request(method, path, method === "POST" ? { a: 1 } : undefined),
      path,
      context("trader")
    );
    assertEquals(res?.status, 200, path);
    assertEquals(calls.length, 1, path);
    assertEquals(calls[0].url, upstream, path);
    assertEquals(calls[0].method, method, path);
  }
});

test("[analytics-route] query strings are preserved on proxied GETs", async () => {
  const calls = stubUpstream();
  await handleAnalyticsRoute(
    request("GET", "/analytics/vol-surface/BRK%2FB?expiry=30"),
    "/analytics/vol-surface/BRK%2FB",
    context("trader")
  );
  assertEquals(calls[0].url, "http://analytics/vol-surface/BRK%252FB?expiry=30");
});

test("[analytics-route] unauthenticated callers get the auth response and nothing is proxied", async () => {
  for (const [method, path] of ROUTES) {
    const calls = stubUpstream();
    const res = await handleAnalyticsRoute(request(method, path, {}), path, context(null));
    assertEquals(res?.status, 401, path);
    assertEquals(calls.length, 0, path);
  }
});

test("[analytics-route] unknown paths and methods fall through", async () => {
  stubUpstream();
  assertEquals(
    await handleAnalyticsRoute(request("GET", "/other"), "/other", context("admin")),
    null
  );
  assertEquals(
    await handleAnalyticsRoute(
      request("DELETE", "/analytics/quote"),
      "/analytics/quote",
      context("admin")
    ),
    null
  );
});

test("[analytics-route] admin-only intelligence and advisory routes reject other roles", async () => {
  const adminOnly: [string, string][] = [
    ["PUT", "/intelligence/weights"],
    ["GET", "/advisory/admin/state"],
    ["PUT", "/advisory/admin/state"],
    ["POST", "/advisory/admin/trigger-worker"],
  ];
  for (const [method, path] of adminOnly) {
    const denied = stubUpstream();
    const res = await handleAnalyticsRoute(request(method, path, {}), path, context("trader"));
    assertEquals(res?.status, 403, path);
    assertEquals(denied.length, 0, path);

    const allowed = stubUpstream();
    const ok = await handleAnalyticsRoute(request(method, path, {}), path, context("admin"));
    assertEquals(ok?.status, 200, path);
    assertEquals(allowed.length, 1, path);
  }
});

test("[analytics-route] advisory requests are stamped with the calling user", async () => {
  const request1 = stubUpstream();
  await handleAnalyticsRoute(
    request("POST", "/advisory/request", { symbol: "AAPL" }),
    "/advisory/request",
    context("trader")
  );
  assertEquals(request1[0].url, "http://advisory/advisory/request");
  assertEquals(JSON.parse(request1[0].body ?? ""), { symbol: "AAPL", requestedBy: "u-7" });

  const brief = stubUpstream();
  await handleAnalyticsRoute(
    request("POST", "/advisory/admin/watchlist-brief", { symbols: ["AAPL"] }),
    "/advisory/admin/watchlist-brief",
    context("trader")
  );
  assertEquals(brief[0].url, "http://advisory/admin/watchlist-brief");
  assertEquals(JSON.parse(brief[0].body ?? ""), { symbols: ["AAPL"], requestedBy: "u-7" });

  const state = stubUpstream();
  await handleAnalyticsRoute(
    request("PUT", "/advisory/admin/state", { enabled: true }),
    "/advisory/admin/state",
    context("admin")
  );
  assertEquals(state[0].url, "http://advisory/admin/state");
  assertEquals(JSON.parse(state[0].body ?? ""), { enabled: true, updatedBy: "u-7" });
});

test("[analytics-route] upstream failures surface as a bad gateway", async () => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("upstream down")));
  const res = await handleAnalyticsRoute(
    request("POST", "/analytics/quote", {}),
    "/analytics/quote",
    context("trader")
  );
  assertEquals(res?.status, 502);
});

test("[llm-advisory-route] ignores other paths", async () => {
  assertEquals(
    await handleLlmAdvisoryRoute(request("GET", "/api/other"), "/api/other", context("trader")),
    null
  );
});

test("[llm-advisory-route] requires authentication and an allowed role", async () => {
  const path = "/api/gateway/llm-advisory";
  const calls = stubUpstream();
  assertEquals(
    (await handleLlmAdvisoryRoute(request("GET", path), path, context(null)))?.status,
    401
  );
  assertEquals(
    (await handleLlmAdvisoryRoute(request("GET", path), path, context("guest")))?.status,
    403
  );
  assertEquals(calls.length, 0);
});

test("[llm-advisory-route] GET relays the upstream body, query string, cookie and content type", async () => {
  const path = "/api/gateway/llm-advisory";
  const calls = stubUpstream(
    () =>
      new Response('{"models":[]}', {
        status: 200,
        headers: { "Content-Type": "application/vnd.test+json", "set-cookie": "sid=1" },
      })
  );
  const res = await handleLlmAdvisoryRoute(
    request("GET", `${path}?view=full`, undefined, { cookie: "veta=abc" }),
    path,
    context("risk-manager")
  );
  assertEquals(calls[0].url, "http://advisory/llm-advisory?view=full");
  assertEquals(calls[0].cookie, "veta=abc");
  assertEquals(calls[0].body, null);
  assertEquals(res?.status, 200);
  assertEquals(res?.headers.get("Content-Type"), "application/vnd.test+json");
  assertEquals(res?.headers.get("Set-Cookie"), "sid=1");
  assertEquals(await res?.text(), '{"models":[]}');
});

test("[llm-advisory-route] POST forwards the body and content type", async () => {
  const path = "/api/gateway/llm-advisory";
  const calls = stubUpstream();
  await handleLlmAdvisoryRoute(
    request("POST", path, { q: 1 }, { "content-type": "application/json" }),
    path,
    context("trader")
  );
  assertEquals(calls[0].method, "POST");
  assertEquals(calls[0].body, '{"q":1}');
});

test("[llm-advisory-route] upstream errors become a 502 with the message", async () => {
  const path = "/api/gateway/llm-advisory";
  vi.stubGlobal("fetch", () => Promise.reject(new Error("advisory offline")));
  const res = await handleLlmAdvisoryRoute(request("GET", path), path, context("admin"));
  assertEquals(res?.status, 502);
  assert((await res?.text())?.includes("advisory offline"));
});
