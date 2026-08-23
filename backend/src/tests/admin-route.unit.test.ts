import { assertEquals } from "jsr:@std/assert@0.217";
import type { GatewayContext } from "../gateway/context.ts";
import { LoadAgent } from "../gateway/load-agent.ts";
import { handleAdminRoute, testTraderIds } from "../gateway/routes/admin.ts";

const realFetch = globalThis.fetch;
const realLoadTestUserIds = Deno.env.get("LOAD_TEST_USER_IDS");

function restoreEnv() {
  if (realLoadTestUserIds === undefined) Deno.env.delete("LOAD_TEST_USER_IDS");
  else Deno.env.set("LOAD_TEST_USER_IDS", realLoadTestUserIds);
}

function makeFakeProducer() {
  return {
    send: () => Promise.resolve(),
    isReady: () => true,
  } as unknown as GatewayContext["producer"];
}

function makeContext(
  role = "trader",
  overrides: Partial<GatewayContext> = {}
): GatewayContext {
  const ctx: Record<string, unknown> = {
    requireAuth: (_req: Request) =>
      Promise.resolve({ user: { id: "u-1", name: "Test User", role, avatar_emoji: "🧪" } }),
    producer: makeFakeProducer(),
    publishAccessEvent: () => {},
    urls: { marketSim: "http://market-sim.example" },
    loadAgent: new LoadAgent({
      producer: makeFakeProducer(),
      refPriceFor: () => 100,
      publishAccessEvent: () => {},
    }),
    ...overrides,
  };
  return ctx as unknown as GatewayContext;
}

function unauthContext(): GatewayContext {
  const ctx: Record<string, unknown> = {
    requireAuth: (_req: Request) =>
      Promise.resolve(new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })),
  };
  return ctx as unknown as GatewayContext;
}

Deno.test("testTraderIds parses a comma-separated env var, trimming whitespace", () => {
  Deno.env.set("LOAD_TEST_USER_IDS", " u-1, u-2 ,u-3");
  try {
    assertEquals(testTraderIds(), ["u-1", "u-2", "u-3"]);
  } finally {
    restoreEnv();
  }
});

Deno.test("testTraderIds returns an empty array when unset", () => {
  Deno.env.delete("LOAD_TEST_USER_IDS");
  try {
    assertEquals(testTraderIds(), []);
  } finally {
    restoreEnv();
  }
});

Deno.test("handleAdminRoute returns null for unrecognised paths", () => {
  const result = handleAdminRoute(new Request("http://localhost/nope"), "/nope", makeContext());
  assertEquals(result, null);
});

Deno.test("handleAdminRoute returns null for a recognised path with the wrong method", () => {
  const result = handleAdminRoute(
    new Request("http://localhost/load-test", { method: "GET" }),
    "/load-test",
    makeContext()
  );
  assertEquals(result, null);
});

Deno.test("handleAdminRoute dispatches GET /admin/market-hours", async () => {
  const fetchSpy = () =>
    Promise.resolve(new Response(JSON.stringify({ assetClasses: {} }), { status: 200 }));
  globalThis.fetch = fetchSpy as typeof fetch;
  try {
    const result = handleAdminRoute(
      new Request("http://localhost/admin/market-hours"),
      "/admin/market-hours",
      makeContext("admin")
    );
    const res = await result;
    if (!res) throw new Error("expected a response");
    assertEquals(res.status, 200);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("handleAdminRoute dispatches POST /load-gen/start, /status, /stop", async () => {
  const ctx = makeContext("oncall");

  const startResult = handleAdminRoute(
    new Request("http://localhost/load-gen/start", { method: "POST" }),
    "/load-gen/start",
    ctx
  );
  const startRes = await startResult;
  if (!startRes) throw new Error("expected a start response");
  assertEquals(startRes.status, 200);

  const statusResult = handleAdminRoute(
    new Request("http://localhost/load-gen/status"),
    "/load-gen/status",
    ctx
  );
  const statusRes = await statusResult;
  if (!statusRes) throw new Error("expected a status response");
  assertEquals(statusRes.status, 200);

  const stopResult = handleAdminRoute(
    new Request("http://localhost/load-gen/stop", { method: "POST" }),
    "/load-gen/stop",
    ctx
  );
  const stopRes = await stopResult;
  if (!stopRes) throw new Error("expected a stop response");
  assertEquals(stopRes.status, 200);
});

Deno.test("/load-gen/start returns 409 on a double-start", async () => {
  const ctx = makeContext("oncall");
  const first = await handleAdminRoute(
    new Request("http://localhost/load-gen/start", { method: "POST" }),
    "/load-gen/start",
    ctx
  );
  if (!first) throw new Error("expected a first response");
  assertEquals(first.status, 200);

  const second = await handleAdminRoute(
    new Request("http://localhost/load-gen/start", { method: "POST" }),
    "/load-gen/start",
    ctx
  );
  if (!second) throw new Error("expected a second response");
  assertEquals(second.status, 409);
  ctx.loadAgent.stop({ userId: "u-1", role: "oncall" });
});

Deno.test("/admin/market-hours rejects non-admin roles", async () => {
  const result = handleAdminRoute(
    new Request("http://localhost/admin/market-hours"),
    "/admin/market-hours",
    makeContext("trader")
  );
  const res = await result;
  if (!res) throw new Error("expected a response");
  assertEquals(res.status, 403);
});

Deno.test("/load-gen/start rejects roles below admin/oncall", async () => {
  const result = handleAdminRoute(
    new Request("http://localhost/load-gen/start", { method: "POST" }),
    "/load-gen/start",
    makeContext("trader")
  );
  const res = await result;
  if (!res) throw new Error("expected a response");
  assertEquals(res.status, 403);
});

Deno.test("/load-gen/status rejects an unauthenticated request", async () => {
  const result = handleAdminRoute(
    new Request("http://localhost/load-gen/status"),
    "/load-gen/status",
    unauthContext()
  );
  const res = await result;
  if (!res) throw new Error("expected a response");
  assertEquals(res.status, 401);
});

Deno.test("/admin/market-hours returns 502 when market-sim is unreachable", async () => {
  globalThis.fetch = (() => Promise.reject(new Error("connection refused"))) as typeof fetch;
  try {
    const result = handleAdminRoute(
      new Request("http://localhost/admin/market-hours", { method: "PUT", body: "{}" }),
      "/admin/market-hours",
      makeContext("admin")
    );
    const res = await result;
    if (!res) throw new Error("expected a response");
    assertEquals(res.status, 502);
  } finally {
    globalThis.fetch = realFetch;
  }
});
