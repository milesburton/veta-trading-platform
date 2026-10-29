import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import type { GatewayContext } from "../gateway/context.ts";
import { handleProxiedRoutes } from "../gateway/routes/proxied.ts";

const URLS = {
  marketSim: "http://sim",
  journal: "http://journal",
  userService: "http://users",
  marketData: "http://md",
  rfqService: "http://rfq",
  ccpService: "http://ccp",
  darkPool: "http://pool",
  productService: "http://products",
};

interface Upstream {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

let upstream: Upstream[];
let upstreamResponse: () => Promise<Response>;

function context(role: string | null, id = "u-1"): GatewayContext {
  return {
    urls: URLS,
    requireAuth: () =>
      Promise.resolve(
        role === null
          ? new Response("{}", { status: 401 })
          : {
              user: { id, name: "T", role, avatar_emoji: "x" },
              limits: { max_order_qty: 1, max_daily_notional: 1, allowed_strategies: [] },
            }
      ),
  } as unknown as GatewayContext;
}

function call(
  role: string | null,
  method: string,
  pathAndQuery: string,
  body?: string,
  headers: Record<string, string> = {}
) {
  const req = new Request(`http://gw${pathAndQuery}`, { method, body, headers });
  return handleProxiedRoutes(req, pathAndQuery.split("?")[0], context(role));
}

beforeEach(() => {
  upstream = [];
  upstreamResponse = () =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  vi.stubGlobal("fetch", (input: string | URL, init?: RequestInit) => {
    upstream.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return upstreamResponse();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("[proxied] returns null for unknown paths and unmatched methods", async () => {
  assertEquals(await call("trader", "GET", "/nothing"), null);
  assertEquals(await call("trader", "DELETE", "/assets"), null);
  assertEquals(upstream.length, 0);
});

test("[proxied] /me returns the authenticated user and limits without calling upstream", async () => {
  const res = await call("trader", "GET", "/me");
  const body = await res?.json();
  assertEquals(res?.status, 200);
  assertEquals(body.user.id, "u-1");
  assertEquals(body.limits.max_order_qty, 1);
  assertEquals(upstream.length, 0);
});

const GET_ROUTES: Array<[string, string]> = [
  ["/assets", "http://sim/assets"],
  ["/data-depth", "http://journal/data-depth"],
  ["/candles?symbol=AAPL", "http://journal/candles?symbol=AAPL"],
  ["/pool/stats", "http://pool/pool/stats"],
  ["/ccp/stats", "http://ccp/ccp/stats"],
  ["/ccp/settlements", "http://ccp/ccp/settlements"],
  ["/ccp/settlements/2026-10-16", "http://ccp/ccp/settlements/2026-10-16"],
  ["/rfq/stats", "http://rfq/rfq/stats"],
  ["/rfq/r-1", "http://rfq/rfq/r-1"],
  ["/rfq/sellside?status=open", "http://rfq/rfq/sellside?status=open"],
  ["/rfq/sellside/stats", "http://rfq/rfq/sellside/stats"],
  ["/rfq/sellside/ss-1", "http://rfq/rfq/sellside/ss-1"],
  ["/products/stats", "http://products/products/stats"],
  ["/products/p-1", "http://products/products/p-1"],
  ["/market-data/sources", "http://md/sources"],
  ["/market-data/overrides", "http://md/overrides"],
];

for (const [path, expected] of GET_ROUTES) {
  test(`[proxied] GET ${path} requires auth and proxies to ${expected}`, async () => {
    assertEquals((await call(null, "GET", path))?.status, 401);
    assertEquals(upstream.length, 0);

    const res = await call("trader", "GET", path);
    assertEquals(res?.status, 200);
    assertEquals(await res?.json(), { ok: true });
    assertEquals(upstream[0].url, expected);
  });
}

const WRITE_ROUTES: Array<[string, string, string, string]> = [
  ["POST", "/rfq/r-1/execute", "http://rfq/rfq/r-1/execute", "trader"],
  ["POST", "/rfq/sellside", "http://rfq/rfq/sellside", "external-client"],
  ["PUT", "/rfq/sellside/ss-1/route", "http://rfq/rfq/sellside/ss-1/route", "sales"],
  ["PUT", "/rfq/sellside/ss-1/markup", "http://rfq/rfq/sellside/ss-1/markup", "sales"],
  ["PUT", "/rfq/sellside/ss-1/confirm", "http://rfq/rfq/sellside/ss-1/confirm", "external-client"],
  ["PUT", "/rfq/sellside/ss-1/reject", "http://rfq/rfq/sellside/ss-1/reject", "external-client"],
  ["POST", "/products", "http://products/products", "sales"],
  ["PUT", "/products/p-1/legs", "http://products/products/p-1/legs", "sales"],
  ["PUT", "/products/p-1/unwind", "http://products/products/p-1/unwind", "sales"],
  ["PUT", "/market-data/overrides", "http://md/overrides", "admin"],
  ["POST", "/market-data/sources/finnhub/toggle", "http://md/sources/finnhub/toggle", "admin"],
];

for (const [method, path, expected, role] of WRITE_ROUTES) {
  test(`[proxied] ${method} ${path} forwards the body to ${expected}`, async () => {
    assertEquals((await call(null, method, path, "{}"))?.status, 401);

    const res = await call(role, method, path, '{"a":1}');
    assertEquals(res?.status, 200);
    assertEquals(upstream[0].url, expected);
    assertEquals(upstream[0].method, method);
    assertEquals(upstream[0].body, '{"a":1}');
  });
}

const RESTRICTED_WRITE_ROUTES = WRITE_ROUTES.filter(([, , , role]) => role !== "trader");

for (const [method, path] of RESTRICTED_WRITE_ROUTES) {
  test(`[proxied] ${method} ${path} rejects a viewer without reaching the upstream`, async () => {
    const res = await call("viewer", method, path, '{"a":1}');
    assertEquals(res?.status, 403);
    assertEquals(upstream.length, 0);
  });
}

test("[proxied] GET /orders scopes ordinary users to their own orders", async () => {
  await call("trader", "GET", "/orders?limit=5", undefined);
  assertEquals(upstream[0].url, "http://journal/orders?limit=5&userId=u-1");

  upstream = [];
  await call("trader", "GET", "/orders?userId=u-9");
  assertEquals(upstream[0].url, "http://journal/orders?userId=u-9");
});

test("[proxied] GET /orders leaves admin and compliance queries unscoped", async () => {
  await call("admin", "GET", "/orders?limit=5");
  await call("compliance", "GET", "/orders");
  assertEquals(upstream[0].url, "http://journal/orders?limit=5");
  assertEquals(upstream[1].url, "http://journal/orders");
});

test("[proxied] CCP margin is limited to the owner, admin and compliance", async () => {
  const denied = await call("trader", "GET", "/ccp/margin/u-2");
  assertEquals(denied?.status, 403);
  assertEquals(upstream.length, 0);

  assertEquals((await call("trader", "GET", "/ccp/margin/u-1"))?.status, 200);
  assertEquals((await call("admin", "GET", "/ccp/margin/u-2"))?.status, 200);
  assertEquals((await call("compliance", "GET", "/ccp/margin/u-2"))?.status, 200);
  assertEquals(
    upstream.map((u) => u.url),
    ["http://ccp/ccp/margin/u-1", "http://ccp/ccp/margin/u-2", "http://ccp/ccp/margin/u-2"]
  );
});

test("[proxied] GET /rfq defaults userId to the caller and keeps an explicit one", async () => {
  await call("trader", "GET", "/rfq?status=open");
  await call("trader", "GET", "/rfq?userId=u-7");
  assertEquals(upstream[0].url, "http://rfq/rfq?status=open&userId=u-1");
  assertEquals(upstream[1].url, "http://rfq/rfq?userId=u-7");
});

test("[proxied] GET /rfq answers 502 when the upstream is unreachable", async () => {
  upstreamResponse = () => Promise.reject(new Error("refused"));
  const res = await call("trader", "GET", "/rfq");
  assertEquals(res?.status, 502);
  assertEquals(await res?.json(), { error: "refused" });
});

test("[proxied] RFQ id routes ignore unsupported method and action combinations", async () => {
  assertEquals(await call("trader", "DELETE", "/rfq/r-1"), null);
  assertEquals(await call("trader", "GET", "/rfq/r-1/execute"), null);
  assertEquals(upstream.length, 0);
});

test("[proxied] GET /products scopes external clients to themselves", async () => {
  await call("trader", "GET", "/products?kind=note");
  await call("external-client", "GET", "/products?kind=note");
  assertEquals(upstream[0].url, "http://products/products?kind=note");
  assertEquals(
    upstream[1].url,
    "http://products/products?kind=note&userId=u-1&userRole=external-client"
  );
});

test("[proxied] POST /grid/query forwards the body with the caller identity", async () => {
  const res = await call("trader", "POST", "/grid/query", '{"q":1}');
  assertEquals(res?.status, 200);
  assertEquals(upstream[0].url, "http://journal/grid/query");
  assertEquals(upstream[0].body, '{"q":1}');
  assertEquals(upstream[0].headers["x-user-id"], "u-1");
});

test("[proxied] POST /grid/query answers 502 when the journal is unreachable", async () => {
  upstreamResponse = () => Promise.reject(new Error("down"));
  const res = await call("trader", "POST", "/grid/query", "{}");
  assertEquals(res?.status, 502);
  assertEquals(await res?.json(), { error: "down" });
});

test("[proxied] preferences are read and written against the caller's own record", async () => {
  await call("trader", "GET", "/preferences", undefined, { cookie: "sid=abc" });
  await call("trader", "PUT", "/preferences", '{"theme":"dark"}', { cookie: "sid=abc" });

  assertEquals(upstream[0].url, "http://users/users/u-1/preferences");
  assertEquals(upstream[0].method, "GET");
  assertEquals(upstream[0].headers.cookie, "sid=abc");
  assertEquals(upstream[1].url, "http://users/users/u-1/preferences");
  assertEquals(upstream[1].method, "PUT");
  assertEquals(upstream[1].headers["Content-Type"], "application/json");
  assert(upstream[1].body instanceof ArrayBuffer);
});

test("[proxied] shared workspace routes forward with the session cookie", async () => {
  await call("trader", "GET", "/shared-workspaces");
  await call("trader", "POST", "/shared-workspaces", '{"name":"w"}');
  await call("trader", "GET", "/shared-workspaces/w-1");
  await call("trader", "DELETE", "/shared-workspaces/w-1");

  assertEquals(
    upstream.map((u) => `${u.method} ${u.url}`),
    [
      "GET http://users/shared-workspaces",
      "POST http://users/shared-workspaces",
      "GET http://users/shared-workspaces/w-1",
      "DELETE http://users/shared-workspaces/w-1",
    ]
  );
  assertEquals(upstream[0].headers.cookie, "");
});

test("[proxied] cookie-forwarded routes answer 502 when the user service is unreachable", async () => {
  upstreamResponse = () => Promise.reject(new Error("no route"));
  const res = await call("trader", "GET", "/preferences");
  assertEquals(res?.status, 502);
  assertEquals(await res?.json(), { error: "no route" });
});

test("[proxied] upstream status codes pass through", async () => {
  upstreamResponse = () => Promise.resolve(new Response("{}", { status: 404 }));
  assertEquals((await call("trader", "GET", "/assets"))?.status, 404);
  assertEquals((await call("trader", "GET", "/preferences"))?.status, 404);
});
