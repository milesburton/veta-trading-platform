import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { FakeTime } from "jsr:@std/testing@0.217/time";
import type { GatewayContext } from "../gateway/context.ts";
import { LoadAgent } from "../gateway/load-agent.ts";
import { handleAdminRoute } from "../gateway/routes/admin.ts";

type SentOrder = Record<string, unknown>;

const realFetch = globalThis.fetch;
const ENV_KEYS = [
  "LOAD_TEST_USER_IDS",
  "LOAD_TEST_MAX_ORDERS",
  "LOAD_TEST_ORDERS_PER_SEC_PER_USER",
];
const realEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, Deno.env.get(k)]));

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
}

function restore() {
  globalThis.fetch = realFetch;
  setEnv(realEnv);
}

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = ((input: Request | URL | string) =>
    Promise.resolve(handler(input instanceof Request ? input.url : String(input)))) as typeof fetch;
}

function makeContext(role = "admin", options: { ready?: boolean } = {}) {
  const sent: SentOrder[] = [];
  const accessEvents: Record<string, unknown>[] = [];
  const producer = {
    send: (_topic: string, msg: unknown) => {
      sent.push(msg as SentOrder);
      return Promise.resolve();
    },
    isReady: () => options.ready ?? true,
  };
  const ctx = {
    requireAuth: () =>
      Promise.resolve({ user: { id: "admin-1", name: "Admin", role, avatar_emoji: "A" } }),
    producer,
    publishAccessEvent: (event: Record<string, unknown>) => accessEvents.push(event),
    urls: { marketSim: "http://market-sim.example" },
    loadAgent: new LoadAgent({
      producer: producer as unknown as GatewayContext["producer"],
      refPriceFor: () => 100,
      publishAccessEvent: () => {},
    }),
  } as unknown as GatewayContext;
  return { ctx, sent, accessEvents };
}

function unauthenticated(): GatewayContext {
  return {
    requireAuth: () =>
      Promise.resolve(new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })),
  } as unknown as GatewayContext;
}

function post(path: string, body?: unknown, raw?: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}

async function call(req: Request, path: string, ctx: GatewayContext): Promise<Response> {
  const response = await handleAdminRoute(req, path, ctx);
  assert(response, `expected ${path} to be handled`);
  return response;
}

async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

Deno.test("/load-test rejects unauthenticated, non-admin and bus-down requests", async () => {
  try {
    assertEquals((await call(post("/load-test", {}), "/load-test", unauthenticated())).status, 401);
    assertEquals(
      (await call(post("/load-test", {}), "/load-test", makeContext("trader").ctx)).status,
      403
    );
    assertEquals(
      (await call(post("/load-test", {}), "/load-test", makeContext("oncall").ctx)).status,
      403
    );
    const down = await call(
      post("/load-test", {}),
      "/load-test",
      makeContext("admin", { ready: false }).ctx
    );
    assertEquals(down.status, 503);
    assertEquals((await down.json()).error, "Bus unavailable");
  } finally {
    restore();
  }
});

Deno.test("/load-test rejects an invalid JSON body and bad quantity ranges", async () => {
  try {
    const { ctx } = makeContext();
    assertEquals(
      (await call(post("/load-test", undefined, "{not json"), "/load-test", ctx)).status,
      400
    );

    const invalidRanges: unknown[] = [
      [10, 10],
      [-1, 5],
      [10, 5],
      [1.5, 9],
      [1, 1_000_001],
    ];
    for (const quantityRange of invalidRanges) {
      const res = await call(post("/load-test", { quantityRange }), "/load-test", ctx);
      assertEquals(res.status, 400, JSON.stringify(quantityRange));
      assert((await res.json()).error.includes("quantityRange"));
    }
  } finally {
    restore();
  }
});

Deno.test("/load-test returns 500 when LOAD_TEST_USER_IDS is not configured", async () => {
  setEnv({ LOAD_TEST_USER_IDS: undefined });
  try {
    const res = await call(post("/load-test", {}), "/load-test", makeContext().ctx);
    assertEquals(res.status, 500);
    assert((await res.json()).error.includes("LOAD_TEST_USER_IDS"));
  } finally {
    restore();
  }
});

Deno.test("/load-test submits attributed orders, caps the count and uses live reference prices", async () => {
  setEnv({
    LOAD_TEST_USER_IDS: " u-1, u-2 ",
    LOAD_TEST_MAX_ORDERS: "4",
    LOAD_TEST_ORDERS_PER_SEC_PER_USER: "1000000",
  });
  stubFetch((url) => {
    assertEquals(url, "http://market-sim.example/prices");
    return new Response(JSON.stringify({ AAPL: 200 }), { status: 200 });
  });
  try {
    const { ctx, sent, accessEvents } = makeContext();
    const res = await call(
      post("/load-test", {
        symbols: ["AAPL"],
        orderCount: 50,
        strategy: "TWAP",
        quantityRange: [5, 9],
      }),
      "/load-test",
      ctx
    );
    assertEquals(res.status, 202);
    const summary = await res.json();
    assertEquals(summary.submitted, 4);
    assertEquals(summary.symbols, ["AAPL"]);
    assertEquals(summary.strategy, "TWAP");
    assertEquals(summary.paced, true);
    assert(String(summary.jobId).startsWith("load-"));

    await waitFor(() => sent.length === 4);

    for (const order of sent) {
      assertEquals(order.asset, "AAPL");
      assertEquals(order.strategy, "TWAP");
      assertEquals(order.userRole, "trader");
      assert(["u-1", "u-2"].includes(order.userId as string));
      assertEquals(order._loadTestJobId, summary.jobId);
      const quantity = order.quantity as number;
      assert(quantity >= 5 && quantity <= 9, `quantity ${quantity}`);
      const limitPrice = order.limitPrice as number;
      if (order.side === "BUY")
        assert(limitPrice >= 200 * 0.98 * 1.02 && limitPrice <= 200 * 1.02 * 1.02);
      else assert(limitPrice >= 200 * 0.98 * 0.98 && limitPrice <= 200 * 1.02 * 0.98);
    }
    assertEquals(new Set(sent.map((o) => o.clientOrderId)).size, 4);
    assertEquals(accessEvents, [
      { action: "http_request", userId: "admin-1", userRole: "admin", path: "/load-test" },
    ]);
  } finally {
    restore();
  }
});

Deno.test("/load-test falls back to default reference prices when market-sim is unreachable", async () => {
  setEnv({
    LOAD_TEST_USER_IDS: "u-1",
    LOAD_TEST_MAX_ORDERS: "2",
    LOAD_TEST_ORDERS_PER_SEC_PER_USER: "1000000",
  });
  globalThis.fetch = (() => Promise.reject(new TypeError("connection refused"))) as typeof fetch;
  try {
    const { ctx, sent } = makeContext();
    const res = await call(
      post("/load-test", { symbols: ["MSFT", "ZZZZ"], orderCount: 2 }),
      "/load-test",
      ctx
    );
    assertEquals(res.status, 202);
    await waitFor(() => sent.length === 2);
    for (const order of sent) {
      const reference = order.asset === "MSFT" ? 420 : 100;
      const limitPrice = order.limitPrice as number;
      assert(Math.abs(limitPrice - reference) / reference < 0.05, `${order.asset} ${limitPrice}`);
    }
  } finally {
    restore();
  }
});

Deno.test("/demo-day rejects unauthenticated, wrong-role and bus-down requests and a missing trader list", async () => {
  setEnv({ LOAD_TEST_USER_IDS: "u-1" });
  try {
    assertEquals((await call(post("/demo-day", {}), "/demo-day", unauthenticated())).status, 401);
    assertEquals(
      (await call(post("/demo-day", {}), "/demo-day", makeContext("trader").ctx)).status,
      403
    );
    assertEquals(
      (await call(post("/demo-day", {}), "/demo-day", makeContext("admin", { ready: false }).ctx))
        .status,
      503
    );

    setEnv({ LOAD_TEST_USER_IDS: undefined });
    const res = await call(post("/demo-day", {}), "/demo-day", makeContext().ctx);
    assertEquals(res.status, 500);
    assert((await res.json()).error.includes("LOAD_TEST_USER_IDS"));
  } finally {
    restore();
  }
});

const SCENARIOS: Array<{
  scenario: string | undefined;
  label: string;
  total: number;
  strategies?: string[];
}> = [
  { scenario: "market-open", label: "Market Open", total: 120 },
  { scenario: "volatile", label: "Volatile Session", total: 100 },
  {
    scenario: "institutional",
    label: "Institutional Flow",
    total: 50,
    strategies: ["TWAP", "VWAP", "ICEBERG", "ARRIVAL_PRICE"],
  },
  { scenario: "standard", label: "Standard Trading Day", total: 100 },
  { scenario: undefined, label: "Standard Trading Day", total: 100 },
  { scenario: "unknown-scenario", label: "Standard Trading Day", total: 100 },
];

for (const { scenario, label, total, strategies } of SCENARIOS) {
  Deno.test(`/demo-day scenario ${scenario ?? "(default)"} schedules ${total} attributed orders`, async () => {
    setEnv({ LOAD_TEST_USER_IDS: "u-1,u-2" });
    stubFetch(
      () => new Response(JSON.stringify([{ symbol: "AAPL", price: 1_000 }]), { status: 200 })
    );
    const time = new FakeTime();
    try {
      const { ctx, sent, accessEvents } = makeContext("oncall");
      const body = scenario === undefined ? {} : { scenario };
      const res = await call(post("/demo-day", body), "/demo-day", ctx);
      assertEquals(res.status, 202);
      const summary = await res.json();
      assertEquals(summary.submitted, total);
      assertEquals(summary.scenario, label);

      await time.tickAsync(60_000);
      await time.runMicrotasks();

      assertEquals(sent.length, total);
      assertEquals(new Set(sent.map((o) => o.clientOrderId)).size, total);
      for (const order of sent) {
        assert(["u-1", "u-2"].includes(order.userId as string));
        assertEquals(order.userRole, "trader");
        assertEquals(order._demoDayJobId, summary.jobId);
        assert((order.quantity as number) > 0);
        assertEquals(order.limitPrice, Math.round((order.limitPrice as number) * 100) / 100);
        if (strategies)
          assert(strategies.includes(order.strategy as string), String(order.strategy));
      }
      const aapl = sent.filter((o) => o.asset === "AAPL").map((o) => o.limitPrice as number);
      assert(
        aapl.every((p) => p > 900 && p < 1_100),
        "AAPL orders should be priced from the live asset feed"
      );
      assertEquals(accessEvents, [
        { action: "http_request", userId: "admin-1", userRole: "oncall", path: "/demo-day" },
      ]);
    } finally {
      time.restore();
      restore();
    }
  });
}

Deno.test("/demo-day falls back to default prices when the asset feed fails or returns an error", async () => {
  setEnv({ LOAD_TEST_USER_IDS: "u-1" });
  const time = new FakeTime();
  try {
    for (const failure of ["reject", "500"] as const) {
      if (failure === "reject") {
        globalThis.fetch = (() => Promise.reject(new TypeError("down"))) as typeof fetch;
      } else {
        stubFetch(() => new Response("oops", { status: 500 }));
      }
      const { ctx, sent } = makeContext();
      const res = await call(post("/demo-day", { scenario: "institutional" }), "/demo-day", ctx);
      assertEquals(res.status, 202);
      await time.tickAsync(60_000);
      await time.runMicrotasks();
      const msft = sent.filter((o) => o.asset === "MSFT").map((o) => o.limitPrice as number);
      assert(msft.length > 0);
      assert(
        msft.every((p) => p > 421 * 0.95 && p < 421 * 1.05),
        `${failure}: ${msft}`
      );
    }
  } finally {
    time.restore();
    restore();
  }
});

Deno.test("/demo-day treats an invalid JSON body as the standard scenario", async () => {
  setEnv({ LOAD_TEST_USER_IDS: "u-1" });
  stubFetch(() => new Response("[]", { status: 200 }));
  const time = new FakeTime();
  try {
    const { ctx } = makeContext();
    const res = await call(post("/demo-day", undefined, "{broken"), "/demo-day", ctx);
    assertEquals(res.status, 202);
    assertEquals((await res.json()).scenario, "Standard Trading Day");
    await time.tickAsync(60_000);
    await time.runMicrotasks();
  } finally {
    time.restore();
    restore();
  }
});

Deno.test("/load-gen endpoints reject a bus outage and unauthorised roles", async () => {
  try {
    assertEquals(
      (
        await call(
          post("/load-gen/start", {}),
          "/load-gen/start",
          makeContext("admin", { ready: false }).ctx
        )
      ).status,
      503
    );
    assertEquals(
      (await call(post("/load-gen/start", {}), "/load-gen/start", unauthenticated())).status,
      401
    );
    assertEquals(
      (await call(post("/load-gen/stop"), "/load-gen/stop", makeContext("trader").ctx)).status,
      403
    );
    assertEquals(
      (await call(post("/load-gen/stop"), "/load-gen/stop", unauthenticated())).status,
      401
    );
    const status = await call(
      new Request("http://localhost/load-gen/status"),
      "/load-gen/status",
      makeContext("viewer").ctx
    );
    assertEquals(status.status, 403);
  } finally {
    restore();
  }
});

Deno.test("/load-gen/start tolerates an empty body and /load-gen/stop reports the stopped state", async () => {
  try {
    const { ctx } = makeContext("oncall");
    const started = await call(
      post("/load-gen/start", undefined, "not json"),
      "/load-gen/start",
      ctx
    );
    assert(started.status === 200 || started.status === 409);
    await started.body?.cancel();

    const stopped = await call(post("/load-gen/stop"), "/load-gen/stop", ctx);
    assertEquals(stopped.status, 200);
    assertEquals((await stopped.json()).running, false);
  } finally {
    restore();
  }
});

Deno.test("/admin/market-hours PUT forwards the upstream status and body", async () => {
  stubFetch(() => new Response(JSON.stringify({ equity: true }), { status: 200 }));
  try {
    const req = new Request("http://localhost/admin/market-hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equity: true }),
    });
    const res = await call(req, "/admin/market-hours", makeContext().ctx);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { equity: true });
  } finally {
    restore();
  }
});
