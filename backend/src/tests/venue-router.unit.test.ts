import { assertEquals } from "jsr:@std/assert@0.217";
import { ALL_VENUES, type RouteRequest, routeToBestVenue } from "../ems/venue-router.ts";
import type { OrderBookSnapshot } from "../lib/market-sim-client.ts";

function book(
  asks: { price: number; size: number }[],
  bids: { price: number; size: number }[] = [],
): OrderBookSnapshot {
  return { bids, asks, mid: 100, ts: 0 };
}

function request(overrides: Partial<RouteRequest> = {}): RouteRequest {
  return {
    childId: "c1",
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 101,
    venueBooks: {},
    candidates: ALL_VENUES,
    now: 0,
    ...overrides,
  };
}

Deno.test("[venue-router] returns null when no candidate venue has a book", () => {
  assertEquals(routeToBestVenue(request()), null);
  assertEquals(routeToBestVenue(request({ venueBooks: undefined })), null);
  assertEquals(
    routeToBestVenue(request({ venueBooks: { XNAS: { AAPL: book([]) } } })),
    null,
  );
});

Deno.test("[venue-router] routes a buy to the venue that fills the most quantity", () => {
  const route = routeToBestVenue(request({
    venueBooks: {
      XNAS: { AAPL: book([{ price: 100.1, size: 40 }]) },
      XNYS: { AAPL: book([{ price: 100.3, size: 100 }]) },
    },
  }));
  assertEquals(route?.venue, "XNYS");
  assertEquals(route?.match.filledQty, 100);
});

Deno.test("[venue-router] breaks a quantity tie on the cheaper buy price", () => {
  const route = routeToBestVenue(request({
    venueBooks: {
      XNAS: { AAPL: book([{ price: 100.2, size: 100 }]) },
      BATS: { AAPL: book([{ price: 100.1, size: 100 }]) },
    },
  }));
  assertEquals(route?.venue, "BATS");
  assertEquals(route?.match.avgFillPrice, 100.1);
});

Deno.test("[venue-router] breaks a quantity tie on the higher sell price", () => {
  const route = routeToBestVenue(request({
    side: "SELL",
    limitPrice: 99,
    venueBooks: {
      XNAS: { AAPL: book([], [{ price: 99.9, size: 100 }]) },
      IEX: { AAPL: book([], [{ price: 99.95, size: 100 }]) },
    },
  }));
  assertEquals(route?.venue, "IEX");
});

Deno.test("[venue-router] keeps venue-table order when fill and price are equal", () => {
  const same = book([{ price: 100.1, size: 100 }]);
  const route = routeToBestVenue(request({
    venueBooks: { MEMX: { AAPL: same }, XNYS: { AAPL: same }, BATS: { AAPL: same } },
  }));
  assertEquals(route?.venue, "XNYS");
});

Deno.test("[venue-router] honours the limit price when choosing a venue", () => {
  const route = routeToBestVenue(request({
    limitPrice: 100.15,
    venueBooks: {
      XNAS: { AAPL: book([{ price: 100.1, size: 30 }]) },
      XNYS: { AAPL: book([{ price: 100.2, size: 500 }]) },
    },
  }));
  assertEquals(route?.venue, "XNAS");
  assertEquals(route?.match.filledQty, 30);
});

Deno.test("[venue-router] still returns a venue when no book crosses, so the child is reported unfilled there", () => {
  const route = routeToBestVenue(request({
    limitPrice: 99,
    venueBooks: { ARCX: { AAPL: book([{ price: 100.1, size: 100 }]) } },
  }));
  assertEquals(route?.venue, "ARCX");
  assertEquals(route?.match.filledQty, 0);
});

Deno.test("[venue-router] only considers the given candidates for a directed child", () => {
  const route = routeToBestVenue(request({
    candidates: ["EDGX"],
    venueBooks: {
      XNAS: { AAPL: book([{ price: 100.0, size: 1_000 }]) },
      EDGX: { AAPL: book([{ price: 100.2, size: 10 }]) },
    },
  }));
  assertEquals(route?.venue, "EDGX");
  assertEquals(route?.match.filledQty, 10);
});
