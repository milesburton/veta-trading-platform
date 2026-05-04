import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setUser } from "../../authSlice";
import { marketSlice } from "../../marketSlice";
import { setSelectedAsset } from "../../uiSlice";
import { gatewayMiddleware } from "../gatewayMiddleware";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  closeCalled = 0;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  close() {
    this.closeCalled++;
    this.onclose?.();
  }
  receive(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

function makeStore() {
  // Use a small barebones reducer so we can observe dispatched actions.
  // The middleware reads state via storeAPI.getState() so we keep the slices used.
  const dispatched: { type: string; payload?: unknown }[] = [];
  const store = configureStore({
    reducer: {
      market: (s = { connected: false, assets: [] }, _action) => s,
      ui: (s = { selectedAsset: null as string | null }, _action) => s,
      breakers: (s = { active: [] as Array<{ key: string; expiresAt: number }> }, _action) => s,
    },
    middleware: (gdm) =>
      gdm({ serializableCheck: false, immutableCheck: false }).concat([
        () => (next: (action: unknown) => unknown) => (action: unknown) => {
          dispatched.push(action as { type: string; payload?: unknown });
          return next(action);
        },
        gatewayMiddleware,
      ]),
  });
  return { store, dispatched };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue([]) })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("gatewayMiddleware – startup", () => {
  it("opens a WebSocket on setUser", async () => {
    const { store } = makeStore();
    store.dispatch(setUser({ id: "alice", name: "Alice", role: "trader", avatar_emoji: "👩" }));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("does not start twice on a second setUser", () => {
    const { store } = makeStore();
    store.dispatch(setUser({ id: "alice", name: "A", role: "trader", avatar_emoji: "🙂" }));
    store.dispatch(setUser({ id: "alice", name: "A", role: "trader", avatar_emoji: "🙂" }));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("dispatches setConnected(true) when ws opens", () => {
    const { store, dispatched } = makeStore();
    store.dispatch(setUser({ id: "a", name: "A", role: "trader", avatar_emoji: "🙂" }));
    FakeWebSocket.instances[0].onopen?.();
    expect(dispatched.find((a) => a.type === marketSlice.actions.setConnected.type)).toBeTruthy();
  });

  it("dispatches setConnected(false) on disconnect", () => {
    const { store, dispatched } = makeStore();
    store.dispatch(setUser({ id: "a", name: "A", role: "trader", avatar_emoji: "🙂" }));
    FakeWebSocket.instances[0].onclose?.();
    const calls = dispatched.filter((a) => a.type === marketSlice.actions.setConnected.type);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("closes ws on marketFeed/stop", () => {
    const { store } = makeStore();
    store.dispatch(setUser({ id: "a", name: "A", role: "trader", avatar_emoji: "🙂" }));
    const ws = FakeWebSocket.instances[0];
    store.dispatch({ type: "marketFeed/stop" });
    expect(ws.closeCalled).toBeGreaterThan(0);
  });
});

describe("gatewayMiddleware – marketUpdate", () => {
  it("buffers prices and flushes on tick interval", async () => {
    vi.useFakeTimers();
    const { store, dispatched } = makeStore();
    store.dispatch(setUser({ id: "a", name: "A", role: "trader", avatar_emoji: "🙂" }));
    const ws = FakeWebSocket.instances[0];
    ws.receive({
      event: "marketUpdate",
      data: {
        prices: { AAPL: 150 },
        volumes: { AAPL: 100 },
        openPrices: { AAPL: 149 },
        sessionPhase: "CONTINUOUS",
      },
    });
    vi.advanceTimersByTime(300);
    const tickActions = dispatched.filter((a) => a.type === "market/tickReceived");
    expect(tickActions.length).toBeGreaterThan(0);
  });

  it("dispatches orderBookUpdated when book is included", async () => {
    vi.useFakeTimers();
    const { store, dispatched } = makeStore();
    store.dispatch(setUser({ id: "a", name: "A", role: "trader", avatar_emoji: "🙂" }));
    const ws = FakeWebSocket.instances[0];
    ws.receive({
      event: "marketUpdate",
      data: {
        prices: { AAPL: 150 },
        volumes: {},
        orderBook: {
          AAPL: { mid: 150, ts: Date.now(), bids: [], asks: [] },
        },
      },
    });
    vi.advanceTimersByTime(300);
    expect(dispatched.find((a) => a.type === "market/orderBookUpdated")).toBeTruthy();
  });

  it("ignores malformed JSON frames silently", () => {
    const { store } = makeStore();
    store.dispatch(setUser({ id: "a", name: "A", role: "trader", avatar_emoji: "🙂" }));
    const ws = FakeWebSocket.instances[0];
    expect(() => ws.onmessage?.({ data: "{not json" })).not.toThrow();
  });
});

describe("gatewayMiddleware – orderEvent dispatch", () => {
  function send(topic: string, data: Record<string, unknown>) {
    const { store, dispatched } = makeStore();
    store.dispatch(setUser({ id: "a", name: "A", role: "trader", avatar_emoji: "🙂" }));
    const ws = FakeWebSocket.instances[0];
    ws.receive({ event: "orderEvent", topic, data });
    return dispatched;
  }

  it("orders.submitted patches status to pending", () => {
    const d = send("orders.submitted", { orderId: "o1", clientOrderId: "c1" });
    const patch = d.find((a) => a.type === "orders/orderPatched");
    expect(patch).toBeTruthy();
  });

  it("orders.routed patches status to working", () => {
    const d = send("orders.routed", { orderId: "o1", clientOrderId: "c1" });
    expect(d.find((a) => a.type === "orders/orderPatched")).toBeTruthy();
  });

  it("orders.child dispatches childAdded", () => {
    const d = send("orders.child", {
      parentOrderId: "p1",
      childId: "ch1",
      asset: "AAPL",
      side: "BUY",
      quantity: 10,
      limitPrice: 100,
    });
    expect(d.find((a) => a.type === "orders/childAdded")).toBeTruthy();
  });

  it("orders.filled dispatches fillReceived", () => {
    const d = send("orders.filled", {
      parentOrderId: "p1",
      filledQty: 5,
      avgFillPrice: 99,
    });
    expect(d.find((a) => a.type === "orders/fillReceived")).toBeTruthy();
  });

  it("orders.filled with childId also dispatches childAdded", () => {
    const d = send("orders.filled", {
      parentOrderId: "p1",
      filledQty: 5,
      avgFillPrice: 99,
      childId: "ch2",
      side: "SELL",
      asset: "MSFT",
    });
    expect(d.filter((a) => a.type === "orders/childAdded").length).toBeGreaterThan(0);
  });

  it("orders.expired patches status", () => {
    const d = send("orders.expired", { orderId: "o1" });
    expect(d.find((a) => a.type === "orders/orderPatched")).toBeTruthy();
  });

  it("orders.rejected patches status when clientOrderId present", () => {
    const d = send("orders.rejected", { clientOrderId: "c1" });
    expect(d.find((a) => a.type === "orders/orderPatched")).toBeTruthy();
  });

  it("orders.cancelled dispatches orderCancelled", () => {
    const d = send("orders.cancelled", { clientOrderId: "c1" });
    expect(d.find((a) => a.type === "orders/orderCancelled")).toBeTruthy();
  });

  it("unknown topic still dispatches gridApi invalidation", () => {
    const d = send("orders.unknown", {});
    expect(d.find((a) => String(a.type).includes("invalidateTags"))).toBeTruthy();
  });
});

describe("gatewayMiddleware – non-order events", () => {
  function fireEvent(payload: unknown) {
    const { store, dispatched } = makeStore();
    store.dispatch(setUser({ id: "a", name: "A", role: "trader", avatar_emoji: "🙂" }));
    FakeWebSocket.instances[0].receive(payload);
    return dispatched;
  }

  it("handles orderAck", () => {
    const d = fireEvent({ event: "orderAck", data: {} });
    expect(d.find((a) => String(a.type).includes("invalidateTags"))).toBeTruthy();
  });

  it("handles orderRejected with clientOrderId", () => {
    const d = fireEvent({
      event: "orderRejected",
      data: { reason: "rate-limited", clientOrderId: "c1" },
    });
    expect(d.find((a) => a.type === "orders/orderPatched")).toBeTruthy();
  });

  it("handles orderRejected without clientOrderId", () => {
    const d = fireEvent({ event: "orderRejected", data: { reason: "?" } });
    // still invalidates the grid even without clientOrderId
    expect(d.find((a) => String(a.type).includes("invalidateTags"))).toBeTruthy();
  });

  it("handles authIdentity", () => {
    const d = fireEvent({
      event: "authIdentity",
      data: {
        user: { id: "x", name: "X", role: "trader", avatar_emoji: "🙂" },
        limits: {
          max_order_qty: 1,
          max_daily_notional: 1,
          allowed_strategies: [],
          allowed_desks: [],
          dark_pool_access: false,
        },
      },
    });
    expect(d.find((a) => a.type === "auth/setUserWithLimits")).toBeTruthy();
  });

  it("handles killAck with scopeValues", () => {
    const d = fireEvent({
      event: "killAck",
      data: { scope: "symbol", scopeValues: ["AAPL"], issuedBy: "admin" },
    });
    expect(d.find((a) => a.type === "killSwitch/blockAdded")).toBeTruthy();
  });

  it("handles killAck with single scopeValue", () => {
    const d = fireEvent({
      event: "killAck",
      data: { scope: "symbol", scopeValue: "AAPL", issuedBy: "admin" },
    });
    expect(d.find((a) => a.type === "killSwitch/blockAdded")).toBeTruthy();
  });

  it("handles resumeAck", () => {
    const d = fireEvent({ event: "resumeAck", data: {} });
    expect(d.find((a) => a.type === "killSwitch/allBlocksCleared")).toBeTruthy();
  });

  it("handles algoHeartbeat first time", () => {
    const d = fireEvent({
      event: "algoHeartbeat",
      data: { algo: "twap", ts: Date.now() },
    });
    expect(d.find((a) => a.type === "feed/feedReceived")).toBeTruthy();
  });

  it("handles newsUpdate", () => {
    const d = fireEvent({
      event: "newsUpdate",
      data: { id: "n1", headline: "Hi", symbol: "AAPL", ts: Date.now() },
    });
    expect(d.find((a) => a.type === "news/newsItemReceived")).toBeTruthy();
  });

  it("handles signalUpdate", () => {
    const d = fireEvent({ event: "signalUpdate", data: { id: "s1" } });
    expect(d.find((a) => a.type === "intelligence/signalReceived")).toBeTruthy();
  });

  it("handles featureUpdate", () => {
    const d = fireEvent({ event: "featureUpdate", data: { symbol: "AAPL" } });
    expect(d.find((a) => a.type === "intelligence/featureReceived")).toBeTruthy();
  });

  it("handles recommendationUpdate", () => {
    const d = fireEvent({
      event: "recommendationUpdate",
      data: { id: "r1" },
    });
    expect(d.find((a) => a.type === "intelligence/recommendationReceived")).toBeTruthy();
  });

  it("handles advisoryUpdate", () => {
    const d = fireEvent({
      event: "advisoryUpdate",
      data: {
        jobId: "j",
        symbol: "AAPL",
        noteId: "n",
        content: "x",
        provider: "p",
        modelId: "m",
        createdAt: 1,
      },
    });
    expect(d.find((a) => a.type === "advisory/advisoryNoteReceived")).toBeTruthy();
  });

  it("handles llmStateUpdate", () => {
    const d = fireEvent({
      event: "llmStateUpdate",
      data: { running: true, models: [] },
    });
    expect(d.find((a) => a.type === "llmSubsystem/llmStateReceived")).toBeTruthy();
  });

  it("handles riskBreaker for symbol scope", () => {
    const d = fireEvent({
      event: "riskBreaker",
      data: {
        type: "market-move",
        scope: "symbol",
        scopeValue: "AAPL",
        observedValue: 5,
        threshold: 2,
        ts: Date.now(),
      },
    });
    expect(d.find((a) => a.type === "killSwitch/blockAdded")).toBeTruthy();
    expect(d.find((a) => a.type === "breakers/breakerFired")).toBeTruthy();
  });

  it("handles riskBreaker for user scope", () => {
    const d = fireEvent({
      event: "riskBreaker",
      data: {
        type: "user-pnl",
        scope: "user",
        targetUserId: "alice",
        observedValue: -1000,
        threshold: -500,
        ts: Date.now(),
      },
    });
    expect(d.find((a) => a.type === "killSwitch/blockAdded")).toBeTruthy();
  });

  it("handles upgradeStatus", () => {
    const d = fireEvent({
      event: "upgradeStatus",
      data: { inProgress: true, message: "Upgrading…" },
    });
    expect(d.find((a) => a.type === "ui/setUpgradeStatus")).toBeTruthy();
  });

  it("handles error event silently", () => {
    expect(() => fireEvent({ event: "error", data: { message: "kaboom" } })).not.toThrow();
  });
});

describe("gatewayMiddleware – setSelectedAsset triggers news hydration", () => {
  it("triggers fetch when symbol is non-null", () => {
    const { store } = makeStore();
    store.dispatch(setUser({ id: "a", name: "A", role: "trader", avatar_emoji: "🙂" }));
    store.dispatch(setSelectedAsset("AAPL"));
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});
