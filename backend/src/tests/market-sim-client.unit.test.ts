import { assert, assertEquals } from "jsr:@std/assert@0.217";
import {
  createMarketSimClient,
  mergeTick,
  parseTickFrame,
  type MarketTick,
  type RawTickMessage,
} from "../lib/market-sim-client.ts";

function emptyTick(): MarketTick {
  return { prices: {}, volumes: {}, marketMinute: 0 };
}

Deno.test("full message replaces the running tick wholesale", () => {
  const latest: MarketTick = {
    prices: { AAPL: 190 },
    volumes: { AAPL: 1_000 },
    marketMinute: 50,
    venueBooks: { XNAS: { AAPL: { bids: [], asks: [], mid: 190, ts: 1 } } },
  };
  const full: RawTickMessage = {
    full: true,
    prices: { MSFT: 400 },
    volumes: { MSFT: 2_000 },
    marketMinute: 60,
    venueBooks: { XNYS: { MSFT: { bids: [], asks: [], mid: 400, ts: 2 } } },
  };

  const next = mergeTick(latest, full);

  assertEquals(next.prices, { MSFT: 400 });
  assertEquals(next.volumes, { MSFT: 2_000 });
  assertEquals(next.marketMinute, 60);
  assert(next.venueBooks?.XNAS === undefined, "stale venue from before the full snapshot must not survive");
  assert(next.venueBooks?.XNYS?.MSFT !== undefined);
});

Deno.test("incremental diff merges prices without dropping untouched symbols", () => {
  const latest: MarketTick = {
    prices: { AAPL: 190, MSFT: 400 },
    volumes: { AAPL: 1_000, MSFT: 2_000 },
    marketMinute: 50,
  };
  const diff: RawTickMessage = { prices: { AAPL: 191 } };

  const next = mergeTick(latest, diff);

  assertEquals(next.prices, { AAPL: 191, MSFT: 400 });
  assertEquals(next.volumes, { AAPL: 1_000, MSFT: 2_000 });
  assertEquals(next.marketMinute, 50);
});

Deno.test("a diff with no prices field leaves prices untouched (no flicker to empty)", () => {
  const latest: MarketTick = {
    prices: { AAPL: 190 },
    volumes: {},
    marketMinute: 50,
  };
  const diff: RawTickMessage = { marketMinute: 51 };

  const next = mergeTick(latest, diff);

  assertEquals(next.prices, { AAPL: 190 });
  assertEquals(next.marketMinute, 51);
});

Deno.test("venueBooks merge per-venue and per-symbol without clobbering other venues", () => {
  const latest: MarketTick = {
    ...emptyTick(),
    venueBooks: {
      XNAS: {
        AAPL: { bids: [], asks: [], mid: 190, ts: 1 },
        MSFT: { bids: [], asks: [], mid: 400, ts: 1 },
      },
      XNYS: {
        AAPL: { bids: [], asks: [], mid: 190.5, ts: 1 },
      },
    },
  };
  const diff: RawTickMessage = {
    venueBooks: {
      XNAS: { AAPL: { bids: [], asks: [], mid: 191, ts: 2 } },
    },
  };

  const next = mergeTick(latest, diff);

  assertEquals(next.venueBooks?.XNAS?.AAPL?.mid, 191);
  assertEquals(next.venueBooks?.XNAS?.MSFT?.mid, 400, "untouched symbol in the same venue must survive");
  assertEquals(next.venueBooks?.XNYS?.AAPL?.mid, 190.5, "untouched venue must survive");
});

Deno.test("a diff with no venueBooks field leaves existing venueBooks untouched", () => {
  const latest: MarketTick = {
    ...emptyTick(),
    venueBooks: { XNAS: { AAPL: { bids: [], asks: [], mid: 190, ts: 1 } } },
  };
  const diff: RawTickMessage = { prices: { AAPL: 191 } };

  const next = mergeTick(latest, diff);

  assertEquals(next.venueBooks?.XNAS?.AAPL?.mid, 190);
});

Deno.test("sessionPhase carries through a full message", () => {
  const latest: MarketTick = { ...emptyTick(), sessionPhase: "CONTINUOUS" };
  const full: RawTickMessage = { full: true, sessionPhase: "CLOSING_AUCTION" };

  const next = mergeTick(latest, full);

  assertEquals(next.sessionPhase, "CLOSING_AUCTION");
});

Deno.test("sessionPhase updates on a diff and persists when a later diff omits it", () => {
  const latest: MarketTick = { ...emptyTick(), sessionPhase: "PRE_OPEN" };

  const withPhase = mergeTick(latest, { sessionPhase: "OPENING_AUCTION" });
  assertEquals(withPhase.sessionPhase, "OPENING_AUCTION");

  const withoutPhase = mergeTick(withPhase, { prices: { AAPL: 191 } });
  assertEquals(
    withoutPhase.sessionPhase,
    "OPENING_AUCTION",
    "sessionPhase must not reset when a later diff doesn't include it"
  );
});

Deno.test("parseTickFrame accepts a marketData event with tick-shaped data", () => {
  const frame = JSON.stringify({ event: "marketData", data: { prices: { AAPL: 190 } } });
  assertEquals(parseTickFrame(frame), { prices: { AAPL: 190 } });
});

Deno.test("parseTickFrame accepts a marketUpdate event with tick-shaped data", () => {
  const frame = JSON.stringify({ event: "marketUpdate", data: { marketMinute: 12 } });
  assertEquals(parseTickFrame(frame), { marketMinute: 12 });
});

Deno.test("parseTickFrame rejects an unrecognised event type", () => {
  const frame = JSON.stringify({ event: "somethingElse", data: { prices: {} } });
  assertEquals(parseTickFrame(frame), null);
});

Deno.test("parseTickFrame rejects a data field that isn't an object", () => {
  const frame = JSON.stringify({ event: "marketData", data: "not an object" });
  assertEquals(parseTickFrame(frame), null);
});

Deno.test("parseTickFrame rejects malformed JSON without throwing", () => {
  assertEquals(parseTickFrame("not json{{{"), null);
});

Deno.test("parseTickFrame rejects a JSON value that isn't an object", () => {
  assertEquals(parseTickFrame("42"), null);
  assertEquals(parseTickFrame("null"), null);
});

Deno.test("createMarketSimClient connects, merges an incoming tick, and notifies onTick callbacks", async () => {
  const controller = new AbortController();
  const server = Deno.serve(
    { port: 0, signal: controller.signal, onListen: () => {} },
    (req) => {
      const { socket, response } = Deno.upgradeWebSocket(req);
      socket.onopen = () => {
        socket.send(JSON.stringify({ event: "marketData", data: { prices: { AAPL: 199 } } }));
      };
      return response;
    }
  );
  const addr = server.addr as Deno.NetAddr;
  const client = createMarketSimClient("127.0.0.1", addr.port);

  const received: MarketTick[] = [];
  client.onTick((tick) => received.push(tick));

  try {
    client.start();
    const deadline = Date.now() + 5_000;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assertEquals(received.length > 0, true);
    assertEquals(client.getLatest().prices.AAPL, 199);
  } finally {
    client.stop();
    controller.abort();
    await server.finished;
  }
});

Deno.test("createMarketSimClient ignores malformed frames without crashing the connection", async () => {
  const controller = new AbortController();
  const server = Deno.serve(
    { port: 0, signal: controller.signal, onListen: () => {} },
    (req) => {
      const { socket, response } = Deno.upgradeWebSocket(req);
      socket.onopen = () => {
        socket.send("not json{{{");
        socket.send(JSON.stringify({ event: "marketData", data: { prices: { MSFT: 400 } } }));
      };
      return response;
    }
  );
  const addr = server.addr as Deno.NetAddr;
  const client = createMarketSimClient("127.0.0.1", addr.port);

  try {
    client.start();
    const deadline = Date.now() + 5_000;
    while (client.getLatest().prices.MSFT === undefined && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assertEquals(client.getLatest().prices.MSFT, 400);
  } finally {
    client.stop();
    controller.abort();
    await server.finished;
  }
});

Deno.test("createMarketSimClient.start() is a no-op while already connected", async () => {
  const controller = new AbortController();
  let openCount = 0;
  const server = Deno.serve(
    { port: 0, signal: controller.signal, onListen: () => {} },
    (req) => {
      const { socket, response } = Deno.upgradeWebSocket(req);
      socket.onopen = () => {
        openCount++;
      };
      return response;
    }
  );
  const addr = server.addr as Deno.NetAddr;
  const client = createMarketSimClient("127.0.0.1", addr.port);

  try {
    client.start();
    const deadline = Date.now() + 5_000;
    while (openCount === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assertEquals(openCount, 1);
    client.start();
    await new Promise((r) => setTimeout(r, 100));
    assertEquals(openCount, 1, "a second start() while open must not open a second connection");
  } finally {
    client.stop();
    controller.abort();
    await server.finished;
  }
});

Deno.test("createMarketSimClient.getLatest() starts empty before any tick arrives", () => {
  const client = createMarketSimClient("127.0.0.1", 1);
  assertEquals(client.getLatest(), { prices: {}, volumes: {}, marketMinute: 0 });
});
