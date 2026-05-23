import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { handleAlertsRoute } from "../gateway/routes/alerts.ts";
import type { GatewayContext } from "../gateway/context.ts";

const realFetch = globalThis.fetch;

interface FetchCall {
  url: string;
  method: string;
  body: BodyInit | null;
  cookie: string | null;
}

function captureFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : (url as URL).toString();
    const cookie = init?.headers
      ? (init.headers as Record<string, string>).cookie ?? null
      : null;
    calls.push({
      url: u,
      method: init?.method ?? "GET",
      body: init?.body ?? null,
      cookie,
    });
    return Promise.resolve(handler(u, init));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

function makeContext(role = "trader"): GatewayContext {
  return {
    requireAuth: (_req: Request) =>
      Promise.resolve({
        user: { id: "u-1", name: "Test User", role, avatar_emoji: "🧪" },
        limits: {
          max_order_qty: 100,
          max_daily_notional: 1_000_000,
          allowed_strategies: [],
        },
      }),
    urls: {
      userService: "http://user-service.example",
    },
  } as unknown as GatewayContext;
}

function unauthContext(): GatewayContext {
  return {
    requireAuth: (_req: Request) =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
      ),
    urls: { userService: "http://user-service.example" },
  } as unknown as GatewayContext;
}

Deno.test("[alerts-route] returns null for paths it does not handle", async () => {
  const ctx = makeContext();
  const res = await handleAlertsRoute(
    new Request("http://gw/other", { method: "GET" }),
    "/other",
    ctx,
  );
  assertEquals(res, null);
});

Deno.test("[alerts-route] returns null for unknown method on /alerts", async () => {
  const ctx = makeContext();
  const res = await handleAlertsRoute(
    new Request("http://gw/alerts", { method: "DELETE" }),
    "/alerts",
    ctx,
  );
  assertEquals(res, null);
});

Deno.test("[alerts-route] GET /alerts proxies to user-service with the user id", async () => {
  const ctx = makeContext();
  const f = captureFetch(() => new Response(JSON.stringify([{ id: "a" }]), { status: 200 }));
  try {
    const res = await handleAlertsRoute(
      new Request("http://gw/alerts", { method: "GET", headers: { cookie: "s=abc" } }),
      "/alerts",
      ctx,
    );
    assert(res);
    assertEquals(res.status, 200);
    assertEquals(f.calls.length, 1);
    assertEquals(f.calls[0].url, "http://user-service.example/users/u-1/alerts");
    assertEquals(f.calls[0].method, "GET");
    assertEquals(f.calls[0].cookie, "s=abc");
  } finally {
    f.restore();
  }
});

Deno.test("[alerts-route] GET /alerts returns 401 when auth fails", async () => {
  const ctx = unauthContext();
  const f = captureFetch(() => new Response("never", { status: 200 }));
  try {
    const res = await handleAlertsRoute(
      new Request("http://gw/alerts", { method: "GET" }),
      "/alerts",
      ctx,
    );
    assert(res);
    assertEquals(res.status, 401);
    assertEquals(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

Deno.test("[alerts-route] POST /alerts forwards body + invokes downstream notifiers", async () => {
  const prevWebhook = Deno.env.get("DISCORD_WEBHOOK_URL");
  const prevToken = Deno.env.get("GITHUB_TICKETING_TOKEN");
  const prevRepo = Deno.env.get("GITHUB_TICKETING_REPO");
  Deno.env.delete("DISCORD_WEBHOOK_URL");
  Deno.env.delete("GITHUB_TICKETING_TOKEN");
  Deno.env.delete("GITHUB_TICKETING_REPO");

  const ctx = makeContext();
  const body = JSON.stringify({
    severity: "WARNING",
    source: "kill-switch",
    message: "armed",
    detail: "all-traders",
  });
  const f = captureFetch(() => new Response(JSON.stringify({ ok: true }), { status: 201 }));
  try {
    const res = await handleAlertsRoute(
      new Request("http://gw/alerts", {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
      }),
      "/alerts",
      ctx,
    );
    assert(res);
    assertEquals(res.status, 201);
    // Should have hit the user-service /alerts endpoint
    const forwardCall = f.calls.find((c) => c.url.endsWith("/users/u-1/alerts"));
    assertEquals(forwardCall?.method, "POST");
    const sent = forwardCall?.body instanceof ArrayBuffer
      ? new TextDecoder().decode(forwardCall.body)
      : (forwardCall?.body ?? "");
    assertEquals(sent, body);
  } finally {
    f.restore();
    if (prevWebhook !== undefined) Deno.env.set("DISCORD_WEBHOOK_URL", prevWebhook);
    if (prevToken !== undefined) Deno.env.set("GITHUB_TICKETING_TOKEN", prevToken);
    if (prevRepo !== undefined) Deno.env.set("GITHUB_TICKETING_REPO", prevRepo);
  }
});

Deno.test("[alerts-route] POST /alerts with invalid JSON body still forwards and returns response", async () => {
  const ctx = makeContext();
  const f = captureFetch(() => new Response("ok", { status: 201 }));
  try {
    const res = await handleAlertsRoute(
      new Request("http://gw/alerts", {
        method: "POST",
        body: "not-json",
      }),
      "/alerts",
      ctx,
    );
    assert(res);
    assertEquals(res.status, 201);
    assert(f.calls.length >= 1);
  } finally {
    f.restore();
  }
});

Deno.test("[alerts-route] POST /alerts with non-object body still forwards", async () => {
  const ctx = makeContext();
  const f = captureFetch(() => new Response("ok", { status: 201 }));
  try {
    const res = await handleAlertsRoute(
      new Request("http://gw/alerts", { method: "POST", body: JSON.stringify(42) }),
      "/alerts",
      ctx,
    );
    assert(res);
    assertEquals(res.status, 201);
  } finally {
    f.restore();
  }
});

Deno.test("[alerts-route] POST /alerts returns 401 when auth fails (no downstream call)", async () => {
  const ctx = unauthContext();
  const f = captureFetch(() => new Response("never", { status: 200 }));
  try {
    const res = await handleAlertsRoute(
      new Request("http://gw/alerts", { method: "POST", body: "{}" }),
      "/alerts",
      ctx,
    );
    assert(res);
    assertEquals(res.status, 401);
    assertEquals(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

Deno.test("[alerts-route] PUT /alerts/dismiss-all proxies to user-service", async () => {
  const ctx = makeContext();
  const f = captureFetch(() => new Response("{}", { status: 200 }));
  try {
    const res = await handleAlertsRoute(
      new Request("http://gw/alerts/dismiss-all", { method: "PUT" }),
      "/alerts/dismiss-all",
      ctx,
    );
    assert(res);
    assertEquals(res.status, 200);
    assertEquals(f.calls[0].method, "PUT");
    assertEquals(f.calls[0].url, "http://user-service.example/users/u-1/alerts/dismiss-all");
  } finally {
    f.restore();
  }
});

Deno.test("[alerts-route] PUT /alerts/dismiss-all returns 401 when auth fails", async () => {
  const ctx = unauthContext();
  const res = await handleAlertsRoute(
    new Request("http://gw/alerts/dismiss-all", { method: "PUT" }),
    "/alerts/dismiss-all",
    ctx,
  );
  assert(res);
  assertEquals(res.status, 401);
});

Deno.test("[alerts-route] PUT /alerts/:id/dismiss proxies to user-service with the alert id", async () => {
  const ctx = makeContext();
  const f = captureFetch(() => new Response("{}", { status: 200 }));
  try {
    const res = await handleAlertsRoute(
      new Request("http://gw/alerts/abc-123/dismiss", { method: "PUT" }),
      "/alerts/abc-123/dismiss",
      ctx,
    );
    assert(res);
    assertEquals(res.status, 200);
    assertEquals(f.calls[0].url, "http://user-service.example/users/u-1/alerts/abc-123/dismiss");
    assertEquals(f.calls[0].method, "PUT");
  } finally {
    f.restore();
  }
});

Deno.test("[alerts-route] PUT /alerts/:id/dismiss returns 401 when auth fails", async () => {
  const ctx = unauthContext();
  const res = await handleAlertsRoute(
    new Request("http://gw/alerts/abc/dismiss", { method: "PUT" }),
    "/alerts/abc/dismiss",
    ctx,
  );
  assert(res);
  assertEquals(res.status, 401);
});

Deno.test("[alerts-route] PUT /alerts/:id/dismiss returns null for non-PUT method", async () => {
  const ctx = makeContext();
  const res = await handleAlertsRoute(
    new Request("http://gw/alerts/abc/dismiss", { method: "GET" }),
    "/alerts/abc/dismiss",
    ctx,
  );
  assertEquals(res, null);
});

Deno.test("[alerts-route] forwards user-service 5xx status as-is", async () => {
  const ctx = makeContext();
  const f = captureFetch(() => new Response("downstream broke", { status: 502 }));
  try {
    const res = await handleAlertsRoute(
      new Request("http://gw/alerts", { method: "GET" }),
      "/alerts",
      ctx,
    );
    assert(res);
    assertEquals(res.status, 502);
  } finally {
    f.restore();
  }
});

Deno.test("[alerts-route] returns 502 with error body when fetch throws", async () => {
  const ctx = makeContext();
  globalThis.fetch = ((_url: string) => Promise.reject(new Error("connect ETIMEDOUT"))) as typeof fetch;
  try {
    const res = await handleAlertsRoute(
      new Request("http://gw/alerts", { method: "GET" }),
      "/alerts",
      ctx,
    );
    assert(res);
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(body.error.includes("ETIMEDOUT"), true);
  } finally {
    globalThis.fetch = realFetch;
  }
});
