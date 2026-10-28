import { afterAll, beforeAll, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

type Handler = (req: Request) => Response | Promise<Response>;

const captured = vi.hoisted(() => ({
  handler: undefined as undefined | Handler,
  sent: [] as Array<{ topic: string; payload: Record<string, unknown> }>,
  writes: [] as string[],
  fetched: [] as string[],
  assetsOk: { value: true },
  feeds: {} as Record<string, unknown>,
}));

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("node:fs", () => ({
  readFileSync: () => {
    throw new Error("ENOENT");
  },
  writeFileSync: (_path: string, data: string) => {
    captured.writes.push(data);
  },
}));
vi.mock("#veta/wait-for", () => ({ waitForUrl: () => Promise.resolve(true) }));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveFetch: (_options: unknown, handler: Handler) => {
    captured.handler = handler;
  },
}));
vi.mock("#veta/messaging", () => ({
  createProducer: () =>
    Promise.resolve({
      send: (topic: string, payload: Record<string, unknown>) => {
        captured.sent.push({ topic, payload });
        return Promise.resolve();
      },
    }),
}));

function feedFor(url: URL): unknown {
  const rss = decodeURIComponent(url.searchParams.get("rss_url") ?? "");
  if (rss.includes("yahoo") && rss.includes("s=AAPL")) {
    return {
      status: "ok",
      items: [
        {
          title: "Apple shares surge as profit beats forecasts",
          link: "https://y/1",
          guid: "y-1",
          pubDate: "2026-10-16T10:00:00Z",
        },
        { title: "", link: "https://y/empty" },
      ],
    };
  }
  if (rss.includes("marketwatch")) {
    return {
      status: "ok",
      items: [
        {
          title: "MSFT cloud growth beats estimates",
          description: "analysts upbeat",
          link: "https://m/1",
        },
        { title: "Nothing about our symbols here", link: "https://m/2" },
      ],
    };
  }
  if (rss.includes("investing")) return { status: "error" };
  return captured.feeds[rss];
}

async function call(method: string, path: string, body?: unknown) {
  assert(captured.handler);
  return captured.handler(
    new Request(`http://news${path}`, {
      method,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

beforeAll(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", (input: string | URL) => {
    const url = new URL(String(input));
    captured.fetched.push(url.href);
    if (url.pathname === "/assets") {
      return Promise.resolve(
        captured.assetsOk.value
          ? new Response(JSON.stringify([{ symbol: "AAPL" }, { symbol: "MSFT" }]))
          : new Response("{}", { status: 500 })
      );
    }
    return Promise.resolve(new Response(JSON.stringify(feedFor(url) ?? { status: "error" })));
  });
  await import("../news/news-aggregator.ts");
  await vi.advanceTimersByTimeAsync(0);
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("[news] loads symbols and ingests general and symbol specific feeds", async () => {
  const health = await (await call("GET", "/health")).json();
  assertEquals(health.symbolCount, 2);
  assertEquals(health.itemCount, 2);
  assertEquals(
    health.sources.map((s: { id: string; enabled: boolean }) => [s.id, s.enabled]),
    [
      ["yahoo-finance", true],
      ["marketwatch", true],
      ["investing-com", true],
    ]
  );
});

test("[news] serves stored items per symbol, scored and attributed", async () => {
  const apple = await (await call("GET", "/news?symbol=AAPL")).json();
  assertEquals(apple.length, 1);
  assertEquals(apple[0].source, "Yahoo Finance");
  assertEquals(apple[0].sentiment, "positive");
  assertEquals(apple[0].publishedAt, Date.parse("2026-10-16T10:00:00Z"));

  const msft = await (await call("GET", "/news?symbol=MSFT&limit=1")).json();
  assertEquals(msft.length, 1);
  assertEquals(msft[0].source, "MarketWatch");
  assertEquals(msft[0].url, "https://m/1");

  assertEquals(await (await call("GET", "/news?symbol=ZZZ")).json(), []);
  assertEquals((await call("GET", "/news")).status, 400);
});

test("[news] publishes the feed, signal and normalised events for each new item", () => {
  const forApple = captured.sent.filter((s) => s.payload.symbol === "AAPL" || s.payload.tickers);
  assert(forApple.length > 0);
  const topics = new Set(captured.sent.map((s) => s.topic));
  assertEquals(topics, new Set(["news.feed", "news.signal", "news.events.normalised"]));

  const normalised = captured.sent.find(
    (s) => s.topic === "news.events.normalised" && String(s.payload.headline).includes("MSFT")
  );
  assertEquals(normalised?.payload.tickers, ["MSFT"]);
  assertEquals(normalised?.payload.relevanceScore, 0.8);
});

test("[news] does not ingest the same item twice across polls", async () => {
  const before = captured.sent.length;
  await vi.advanceTimersByTimeAsync(120_000);
  assertEquals(captured.sent.length, before);
  assertEquals((await (await call("GET", "/news?symbol=AAPL")).json()).length, 1);
});

test("[news] keeps polling when symbols cannot be refreshed", async () => {
  captured.assetsOk.value = false;
  await vi.advanceTimersByTimeAsync(120_000);
  captured.assetsOk.value = true;
  assertEquals((await (await call("GET", "/health")).json()).symbolCount, 2);
});

test("[news] lists sources and toggles them, persisting each change", async () => {
  const listed = await (await call("GET", "/sources")).json();
  assertEquals(listed.length, 3);
  assertEquals(Object.keys(listed[0]).sort(), ["enabled", "id", "label", "symbolSpecific"]);

  captured.writes.length = 0;
  const disabled = await (await call("POST", "/sources/marketwatch/disable")).json();
  assertEquals(disabled.enabled, false);
  assertEquals((await (await call("POST", "/sources/marketwatch/toggle")).json()).enabled, true);
  assertEquals((await (await call("POST", "/sources/marketwatch/disable")).json()).enabled, false);
  assertEquals((await (await call("POST", "/sources/marketwatch/enable")).json()).enabled, true);
  assertEquals(captured.writes.length, 4);
  assertEquals((await call("POST", "/sources/missing/enable")).status, 404);
});

test("[news] creates sources with validation and rejects duplicates", async () => {
  assertEquals((await call("POST", "/sources", "{bad")).status, 400);
  assertEquals((await call("POST", "/sources", { label: "No template" })).status, 400);

  const created = await call("POST", "/sources", {
    label: "Reuters Wire",
    rssTemplate: "https://r.example.com/feed",
  });
  assertEquals(created.status, 201);
  assertEquals(await created.json(), {
    id: "reuters-wire",
    label: "Reuters Wire",
    rssTemplate: "https://r.example.com/feed",
    enabled: true,
    symbolSpecific: false,
  });
  assertEquals(
    (
      await call("POST", "/sources", {
        label: "Reuters Wire",
        rssTemplate: "https://r.example.com/feed",
      })
    ).status,
    409
  );

  const symbolOnly = await call("POST", "/sources", {
    label: "!!!",
    rssTemplate: "https://s.example.com",
  });
  assertEquals(symbolOnly.status, 201);
  assert((await symbolOnly.json()).id.startsWith("source-"));
});

test("[news] rejects feed templates that are not public https URLs", async () => {
  for (const rssTemplate of [
    "http://r.example.com/feed",
    "https://localhost/feed",
    "https://10.0.0.5/feed",
    "https://user:pw@r.example.com/feed",
    "https://printer.local/feed",
    "not a url",
  ]) {
    assertEquals((await call("POST", "/sources", { label: "Bad", rssTemplate })).status, 400);
    assertEquals((await call("PUT", "/sources/reuters-wire", { rssTemplate })).status, 400);
  }
});

test("[news] updates and deletes sources", async () => {
  assertEquals((await call("PUT", "/sources/missing", {})).status, 404);
  assertEquals((await call("PUT", "/sources/reuters-wire", "{bad")).status, 400);

  const updated = await (
    await call("PUT", "/sources/reuters-wire", {
      label: "Reuters",
      rssTemplate: "https://r.example.com/new",
      symbolSpecific: true,
      enabled: false,
    })
  ).json();
  assertEquals(updated.label, "Reuters");
  assertEquals(updated.rssTemplate, "https://r.example.com/new");
  assertEquals(updated.symbolSpecific, true);
  assertEquals(updated.enabled, false);

  const untouched = await (await call("PUT", "/sources/reuters-wire", {})).json();
  assertEquals(untouched.label, "Reuters");

  assertEquals((await call("DELETE", "/sources/missing")).status, 404);
  assertEquals((await call("DELETE", "/sources/reuters-wire")).status, 204);
  assertEquals((await (await call("GET", "/sources")).json()).length, 4);
});

test("[news] answers preflight and unknown routes", async () => {
  assertEquals((await call("OPTIONS", "/news")).status, 204);
  assertEquals((await call("GET", "/nothing")).status, 404);
});
