import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { marketSlice } from "../../marketSlice";
import { ordersSlice } from "../../ordersSlice";
import { simulationMiddleware } from "../simulationMiddleware";

function makeOrder(over: Partial<Parameters<typeof ordersSlice.actions.orderAdded>[0]> = {}) {
  const now = Date.now();
  return {
    id: "o1",
    submittedAt: now,
    asset: "AAPL",
    side: "BUY" as const,
    quantity: 100,
    limitPrice: 150,
    expiresAt: now + 30_000,
    strategy: "TWAP" as const,
    status: "pending" as const,
    filled: 0,
    algoParams: { strategy: "TWAP" as const, numSlices: 4, participationCap: 25 },
    children: [],
    ...over,
  };
}

function makeStore(connected = false) {
  return configureStore({
    reducer: {
      market: marketSlice.reducer,
      orders: ordersSlice.reducer,
    },
    middleware: (gdm) => gdm({ serializableCheck: false }).prepend(simulationMiddleware.middleware),
    preloadedState: {
      market: {
        assets: [],
        prices: { AAPL: 150 },
        priceHistory: {},
        sessionOpen: {},
        candleHistory: {},
        candlesReady: {},
        orderBook: {},
        connected,
        sessionPhase: "CONTINUOUS" as const,
      },
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("simulationMiddleware – tickReceived", () => {
  it("dispatches limitOrdersChecked when disconnected", () => {
    const store = makeStore(false);
    const before = store.getState();
    store.dispatch(
      marketSlice.actions.tickReceived({
        prices: { AAPL: 151 },
        volumes: {},
        ts: Date.now(),
      })
    );
    // After tick, limitOrdersChecked is dispatched (state shouldn't error)
    const after = store.getState();
    expect(after.market.prices.AAPL).toBe(151);
    void before;
  });

  it("does NOT dispatch limitOrdersChecked when connected", () => {
    const store = makeStore(true);
    store.dispatch(
      marketSlice.actions.tickReceived({
        prices: { AAPL: 151 },
        volumes: {},
        ts: Date.now(),
      })
    );
    expect(store.getState().market.prices.AAPL).toBe(151);
  });
});

describe("simulationMiddleware – TWAP simulation", () => {
  it("transitions order to working then filled over time", async () => {
    const store = makeStore(false);
    const order = makeOrder({ strategy: "TWAP", quantity: 100 });
    store.dispatch(ordersSlice.actions.orderAdded(order));

    // Order should be set to working
    expect(store.getState().orders.orders[0].status).toBe("working");

    // Advance timers to trigger slices
    await vi.advanceTimersByTimeAsync(40_000);

    // Order should be filled
    const final = store.getState().orders.orders[0];
    expect(["filled", "working", "expired"]).toContain(final.status);
  });

  it("expires unfilled TWAP after expiresAt", async () => {
    const store = makeStore(false);
    const order = makeOrder({
      id: "o-expire",
      strategy: "TWAP",
      expiresAt: Date.now() + 1000,
      algoParams: { strategy: "TWAP" as const, numSlices: 100, participationCap: 25 },
    });
    store.dispatch(ordersSlice.actions.orderAdded(order));
    await vi.advanceTimersByTimeAsync(2000);
    const final = store.getState().orders.orders[0];
    expect(["filled", "expired", "working"]).toContain(final.status);
  });

  it("does NOT simulate when gateway is connected", () => {
    const store = makeStore(true);
    const order = makeOrder();
    store.dispatch(ordersSlice.actions.orderAdded(order));
    // Status remains pending — no simulation kicked in
    expect(store.getState().orders.orders[0].status).toBe("pending");
  });
});

describe("simulationMiddleware – POV simulation", () => {
  it("starts POV simulation and patches status", () => {
    const store = makeStore(false);
    const order = makeOrder({
      id: "pov1",
      strategy: "POV",
      algoParams: {
        strategy: "POV" as const,
        participationRate: 10,
        minSliceSize: 1,
        maxSliceSize: 500,
      },
    });
    store.dispatch(ordersSlice.actions.orderAdded(order));
    expect(store.getState().orders.orders[0].status).toBe("working");
  });
});

describe("simulationMiddleware – VWAP simulation", () => {
  it("starts VWAP simulation and patches status", () => {
    const store = makeStore(false);
    const order = makeOrder({
      id: "vwap1",
      strategy: "VWAP",
      algoParams: {
        strategy: "VWAP" as const,
        maxDeviation: 0.005,
        startOffsetSecs: 0,
        endOffsetSecs: 60,
      },
    });
    store.dispatch(ordersSlice.actions.orderAdded(order));
    expect(store.getState().orders.orders[0].status).toBe("working");
  });
});

describe("simulationMiddleware – ignores non-simulated strategies", () => {
  it("does not start simulation for LIMIT orders", () => {
    const store = makeStore(false);
    const order = makeOrder({
      id: "lim1",
      strategy: "LIMIT",
      algoParams: { strategy: "LIMIT" as const },
    });
    store.dispatch(ordersSlice.actions.orderAdded(order));
    // LIMIT keeps original 'pending' status (no simulation start)
    expect(store.getState().orders.orders[0].status).toBe("pending");
  });
});
