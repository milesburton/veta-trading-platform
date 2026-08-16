import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { mergeTick, type MarketTick, type RawTickMessage } from "../lib/marketSimClient.ts";

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
