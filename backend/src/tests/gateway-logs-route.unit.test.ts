import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import type { GatewayContext } from "../gateway/context.ts";

type LogsModule = typeof import("../gateway/routes/logs.ts");

async function loadRoute(lokiUrl: string): Promise<LogsModule> {
  vi.resetModules();
  vi.stubEnv("LOKI_URL", lokiUrl);
  return await import("../gateway/routes/logs.ts");
}

function context(role: string | null): GatewayContext {
  return {
    requireAuth: () =>
      Promise.resolve(
        role === null
          ? new Response("{}", { status: 401 })
          : {
              user: { id: "u-1", name: "T", role, avatar_emoji: "x" },
              limits: { max_order_qty: 1, max_daily_notional: 1, allowed_strategies: [] },
            }
      ),
  } as unknown as GatewayContext;
}

function query(route: LogsModule, role: string | null, search = "") {
  const path = "/logs/query";
  return route.handleLogsRoute(new Request(`http://gw${path}${search}`), path, context(role));
}

let fetched: string[];

beforeEach(() => {
  fetched = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("[logs] ignores other paths, rejects anonymous callers and forbids viewers", async () => {
  const route = await loadRoute("");
  const other = await route.handleLogsRoute(
    new Request("http://gw/other"),
    "/other",
    context("admin")
  );
  assertEquals(other, null);
  assertEquals((await query(route, null))?.status, 401);
  assertEquals((await query(route, "viewer"))?.status, 403);
  assertEquals((await query(route, "external-client"))?.status, 403);
});

test("[logs] serves from the ring buffer newest first when Loki is not configured", async () => {
  const route = await loadRoute("");
  const now = Date.now();
  route.recordLogLine({ service: "oms", level: "info", message: "a" }, '{"msg":"a"}', now - 3000);
  route.recordLogLine({ service: "oms", level: "error", message: "b" }, '{"msg":"b"}', now - 2000);
  route.recordLogLine({ service: "gw", level: "info", message: "c" }, '{"msg":"c"}', now - 1000);

  const body = await (await query(route, "trader"))?.json();
  assertEquals(body.source, "ring-buffer");
  assertEquals(body.lokiConfigured, false);
  assertEquals(body.ringSize, 2000);
  assertEquals(
    body.lines.map((l: { message: string }) => l.message),
    ["c", "b", "a"]
  );
});

test("[logs] filters the ring buffer by service, level, text, age and limit", async () => {
  const route = await loadRoute("");
  const now = Date.now();
  route.recordLogLine({ service: "oms", level: "info", message: "x" }, "alpha order", now - 1000);
  route.recordLogLine({ service: "oms", level: "ERROR", message: "y" }, "beta fail", now - 900);
  route.recordLogLine({ service: "gw", level: "info", message: "z" }, "alpha gate", now - 800);
  route.recordLogLine({ service: "gw", level: "info", message: "old" }, "alpha old", now - 600_000);

  const messages = async (search: string) => {
    const res = await query(route, "trader", search);
    assert(res);
    const body = await res.json();
    return body.lines.map((l: { message: string }) => l.message);
  };

  assertEquals(await messages("?service=oms"), ["y", "x"]);
  assertEquals(await messages("?level=error"), ["y"]);
  assertEquals(await messages("?q=ALPHA"), ["z", "x"]);
  assertEquals(await messages("?since=15m&q=alpha"), ["old", "z", "x"]);
  assertEquals(await messages("?since=2h&service=gw"), ["old", "z"]);
  assertEquals(await messages("?since=30s&q=alpha&limit=1"), ["z"]);
  assertEquals(await messages("?since=bogus&service=gw"), ["z"]);
  assertEquals(await messages("?limit=abc&service=oms"), ["y", "x"]);
});

test("[logs] queries Loki with a LogQL filter and maps the streams", async () => {
  const route = await loadRoute("http://loki");
  vi.stubGlobal("fetch", (input: string) => {
    fetched.push(input);
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: {
            result: [
              {
                stream: { service_name: "oms", level: "warn" },
                values: [
                  ["1000000000", JSON.stringify({ msg: "older", level: "error", trace_id: "t1" })],
                  ["2000000000", "plain text line"],
                ],
              },
              { values: [["3000000000", "{}"]] },
            ],
          },
        })
      )
    );
  });

  const body = await (
    await query(route, "admin", '?service=oms&level=error&q=a"b\\c&limit=2&since=1m')
  )?.json();

  const url = new URL(fetched[0]);
  assertEquals(url.origin + url.pathname, "http://loki/loki/api/v1/query_range");
  assertEquals(url.searchParams.get("limit"), "2");
  assertEquals(url.searchParams.get("direction"), "backward");
  const logQL = url.searchParams.get("query") ?? "";
  assert(logQL.startsWith('{service_name="oms"}'));
  assert(logQL.includes('(?i)\\"level\\":\\"error'));
  assert(logQL.includes('a\\"b\\\\c'));

  assertEquals(body.source, "loki");
  assertEquals(body.lokiConfigured, true);
  assertEquals(
    body.lines.map((l: { ts: number; service: string; level: string; message: string }) => [
      l.ts,
      l.service,
      l.level,
      l.message,
    ]),
    [
      [3000, "unknown", "info", "{}"],
      [2000, "oms", "warn", "plain text line"],
    ]
  );
});

test("[logs] queries all services when none is requested and keeps trace ids", async () => {
  const route = await loadRoute("http://loki");
  vi.stubGlobal("fetch", (input: string) => {
    fetched.push(input);
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: {
            result: [
              {
                stream: { service_name: "gw" },
                values: [["5000000", JSON.stringify({ msg: "m", trace_id: "t9" })]],
              },
            ],
          },
        })
      )
    );
  });

  const body = await (await query(route, "trader"))?.json();
  assertEquals(new URL(fetched[0]).searchParams.get("query"), '{service_name=~".+"}');
  assertEquals(body.lines[0].trace_id, "t9");
});

test("[logs] falls back to the ring buffer when Loki fails or returns nothing", async () => {
  const route = await loadRoute("http://loki");
  route.recordLogLine({ service: "oms", level: "info", message: "kept" }, "kept", Date.now());

  for (const behaviour of [
    () => Promise.resolve(new Response("{}", { status: 500 })),
    () => Promise.reject(new Error("timeout")),
    () => Promise.resolve(new Response(JSON.stringify({}))),
  ]) {
    vi.stubGlobal("fetch", behaviour);
    const body = await (await query(route, "trader"))?.json();
    assertEquals(body.source, "ring-buffer");
    assertEquals(body.lokiConfigured, true);
    assertEquals(body.lines[0].message, "kept");
  }
});

test("[logs] the ring buffer drops the oldest line beyond its capacity", async () => {
  const route = await loadRoute("");
  const now = Date.now();
  for (let i = 0; i < 2005; i++) {
    route.recordLogLine({ service: "s", level: "info", message: String(i) }, String(i), now);
  }
  const body = await (await query(route, "trader", "?limit=500"))?.json();
  assertEquals(body.lines.length, 500);
  assertEquals(body.lines[0].message, "2004");
  assertEquals(body.lines[499].message, "1505");
});
