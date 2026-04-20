import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setUser } from "../authSlice";
import { gatewayMiddleware } from "../middleware/gatewayMiddleware";

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  closeCalled = false;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.closeCalled = true;
  }
}

function createHarness() {
  const dispatched: Array<{ type?: string; payload?: unknown }> = [];
  const storeAPI = {
    dispatch: (action: { type?: string; payload?: unknown }) => {
      dispatched.push(action);
      return action;
    },
    getState: () => ({
      ui: { selectedAsset: null },
      breakers: { active: [] },
    }),
  };
  const next = vi.fn((action) => action);
  const invoke = gatewayMiddleware(storeAPI as never)(next);
  return { dispatched, next, invoke };
}

describe("gatewayMiddleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("/ready")) {
          return { ok: true, json: async () => ({ upgradeInProgress: false }) };
        }
        return { ok: false, json: async () => null };
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts gateway websocket once on setUser", () => {
    const { invoke } = createHarness();
    const user = {
      id: "u1",
      name: "Trader",
      role: "trader",
      avatar_emoji: ":test:",
    } as const;

    invoke(setUser(user));
    invoke(setUser(user));

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain("/ws/gateway");
  });

  it("batches market updates and flushes a UI tick", () => {
    const { dispatched, invoke } = createHarness();
    const user = {
      id: "u1",
      name: "Trader",
      role: "trader",
      avatar_emoji: ":test:",
    } as const;

    invoke(setUser(user));
    const ws = MockWebSocket.instances[0];

    ws.onmessage?.({
      data: JSON.stringify({
        event: "marketUpdate",
        data: {
          prices: { AAPL: 101 },
          openPrices: { AAPL: 100 },
          volumes: { AAPL: 12 },
          sessionPhase: "HALTED",
        },
      }),
    } as MessageEvent);

    const immediateTypes = dispatched.map((a) => a.type);
    expect(immediateTypes).toContain("market/setSessionPhase");
    expect(immediateTypes).toContain("feed/feedReceived");
    expect(immediateTypes).not.toContain("market/tickReceived");

    vi.advanceTimersByTime(250);

    const tick = dispatched.find((a) => a.type === "market/tickReceived");
    expect(tick).toBeTruthy();
    expect(tick?.payload).toMatchObject({
      prices: { AAPL: 101 },
      openPrices: { AAPL: 100 },
      volumes: { AAPL: 12 },
    });
  });

  it("closes websocket on marketFeed/stop", () => {
    const { invoke } = createHarness();
    const user = {
      id: "u1",
      name: "Trader",
      role: "trader",
      avatar_emoji: ":test:",
    } as const;

    invoke(setUser(user));
    const ws = MockWebSocket.instances[0];

    invoke({ type: "marketFeed/stop" });

    expect(ws.closeCalled).toBe(true);
  });

  it("handles orderRejected by patching status and invalidating grid", () => {
    const { dispatched, invoke } = createHarness();
    const user = {
      id: "u1",
      name: "Trader",
      role: "trader",
      avatar_emoji: ":test:",
    } as const;

    invoke(setUser(user));
    const ws = MockWebSocket.instances[0];

    ws.onmessage?.({
      data: JSON.stringify({
        event: "orderRejected",
        data: { reason: "blocked", clientOrderId: "coid-1" },
      }),
    } as MessageEvent);

    expect(
      dispatched.some(
        (a) =>
          a.type === "orders/orderPatched" &&
          (a.payload as { id?: string; patch?: { status?: string } }).id === "coid-1" &&
          (a.payload as { patch?: { status?: string } }).patch?.status === "rejected"
      )
    ).toBe(true);
    expect(dispatched.some((a) => a.type === "gridApi/invalidateTags")).toBe(true);
  });

  it("maps killAck and resumeAck to kill-switch actions", () => {
    const { dispatched, invoke } = createHarness();
    const user = {
      id: "u1",
      name: "Trader",
      role: "trader",
      avatar_emoji: ":test:",
    } as const;

    invoke(setUser(user));
    const ws = MockWebSocket.instances[0];

    ws.onmessage?.({
      data: JSON.stringify({
        event: "killAck",
        data: {
          scope: "symbol",
          scopeValue: "AAPL",
          issuedBy: "admin",
        },
      }),
    } as MessageEvent);

    ws.onmessage?.({
      data: JSON.stringify({ event: "resumeAck", data: {} }),
    } as MessageEvent);

    expect(dispatched.some((a) => a.type === "killSwitch/blockAdded")).toBe(true);
    expect(dispatched.some((a) => a.type === "killSwitch/allBlocksCleared")).toBe(true);
  });

  it("handles riskBreaker and emits breaker event only with a valid target", () => {
    const { dispatched, invoke } = createHarness();
    const user = {
      id: "u1",
      name: "Trader",
      role: "trader",
      avatar_emoji: ":test:",
    } as const;

    invoke(setUser(user));
    const ws = MockWebSocket.instances[0];

    ws.onmessage?.({
      data: JSON.stringify({
        event: "riskBreaker",
        data: {
          type: "market-move",
          scope: "symbol",
          scopeValue: "AAPL",
          observedValue: 7,
          threshold: 5,
          ts: 123,
        },
      }),
    } as MessageEvent);

    ws.onmessage?.({
      data: JSON.stringify({
        event: "riskBreaker",
        data: {
          type: "user-pnl",
          scope: "user",
          observedValue: -1200,
          threshold: -1000,
          ts: 124,
        },
      }),
    } as MessageEvent);

    const breakerFiredCount = dispatched.filter((a) => a.type === "breakers/breakerFired").length;
    expect(breakerFiredCount).toBe(1);
    expect(dispatched.some((a) => a.type === "killSwitch/blockAdded")).toBe(true);
  });

  describe("orderEvent message routing", () => {
    function connectWs(invoke: (action: unknown) => void) {
      invoke(
        setUser({
          id: "u1",
          name: "Trader",
          role: "trader",
          avatar_emoji: ":t:",
        })
      );
      return MockWebSocket.instances[0];
    }

    function send(ws: MockWebSocket, event: string, topic: string, data: unknown) {
      ws.onmessage?.({
        data: JSON.stringify({ event, topic, data }),
      } as MessageEvent);
    }

    it("orders.submitted patches order to pending", () => {
      const { dispatched, invoke } = createHarness();
      const ws = connectWs(invoke);
      send(ws, "orderEvent", "orders.submitted", {
        orderId: "o1",
        clientOrderId: "c1",
      });
      expect(
        dispatched.some(
          (a) =>
            a.type === "orders/orderPatched" &&
            (a.payload as { patch: { status: string } }).patch.status === "pending"
        )
      ).toBe(true);
    });

    it("orders.routed patches order to working", () => {
      const { dispatched, invoke } = createHarness();
      const ws = connectWs(invoke);
      send(ws, "orderEvent", "orders.routed", {
        orderId: "o1",
        clientOrderId: "c1",
      });
      expect(
        dispatched.some(
          (a) =>
            a.type === "orders/orderPatched" &&
            (a.payload as { patch: { status: string } }).patch.status === "working"
        )
      ).toBe(true);
    });

    it("orders.child dispatches childAdded", () => {
      const { dispatched, invoke } = createHarness();
      const ws = connectWs(invoke);
      send(ws, "orderEvent", "orders.child", {
        parentOrderId: "p1",
        clientOrderId: "c1",
        childId: "ch1",
        asset: "AAPL",
        side: "BUY",
        quantity: 50,
      });
      expect(dispatched.some((a) => a.type === "orders/childAdded")).toBe(true);
    });

    it("orders.filled dispatches fillReceived", () => {
      const { dispatched, invoke } = createHarness();
      const ws = connectWs(invoke);
      send(ws, "orderEvent", "orders.filled", {
        parentOrderId: "p1",
        clientOrderId: "c1",
        filledQty: 25,
        avgFillPrice: 150,
        remainingQty: 75,
      });
      expect(dispatched.some((a) => a.type === "orders/fillReceived")).toBe(true);
    });

    it("orders.expired patches order to expired", () => {
      const { dispatched, invoke } = createHarness();
      const ws = connectWs(invoke);
      send(ws, "orderEvent", "orders.expired", {
        orderId: "o1",
        clientOrderId: "c1",
      });
      expect(
        dispatched.some(
          (a) =>
            a.type === "orders/orderPatched" &&
            (a.payload as { patch: { status: string } }).patch.status === "expired"
        )
      ).toBe(true);
    });

    it("orders.cancelled dispatches orderCancelled", () => {
      const { dispatched, invoke } = createHarness();
      const ws = connectWs(invoke);
      send(ws, "orderEvent", "orders.cancelled", { clientOrderId: "c1" });
      expect(dispatched.some((a) => a.type === "orders/orderCancelled")).toBe(true);
    });
  });

  describe("other WebSocket message types", () => {
    function connectWs(invoke: (action: unknown) => void) {
      invoke(
        setUser({
          id: "u1",
          name: "Trader",
          role: "trader",
          avatar_emoji: ":t:",
        })
      );
      return MockWebSocket.instances[0];
    }

    it("orderAck invalidates Grid tags", () => {
      const { dispatched, invoke } = createHarness();
      const ws = connectWs(invoke);
      ws.onmessage?.({
        data: JSON.stringify({ event: "orderAck", data: {} }),
      } as MessageEvent);
      expect(dispatched.some((a) => a.type === "gridApi/invalidateTags")).toBe(true);
    });

    it("authIdentity dispatches setUserWithLimits and loads prefs", () => {
      const { dispatched, invoke } = createHarness();
      const ws = connectWs(invoke);
      ws.onmessage?.({
        data: JSON.stringify({
          event: "authIdentity",
          data: {
            user: {
              id: "u1",
              name: "Trader",
              role: "trader",
              avatar_emoji: ":t:",
            },
            limits: { maxOrderSize: 10000 },
          },
        }),
      } as MessageEvent);
      expect(dispatched.some((a) => a.type === "auth/setUserWithLimits")).toBe(true);
    });

    it("newsUpdate dispatches newsItemReceived", () => {
      const { dispatched, invoke } = createHarness();
      const ws = connectWs(invoke);
      ws.onmessage?.({
        data: JSON.stringify({
          event: "newsUpdate",
          data: {
            id: "n1",
            headline: "Test news",
            symbols: ["AAPL"],
            publishedAt: 1000,
          },
        }),
      } as MessageEvent);
      expect(dispatched.some((a) => a.type === "news/newsItemReceived")).toBe(true);
    });

    it("signalUpdate dispatches signalReceived", () => {
      const { dispatched, invoke } = createHarness();
      const ws = connectWs(invoke);
      ws.onmessage?.({
        data: JSON.stringify({
          event: "signalUpdate",
          data: { symbol: "AAPL", value: 0.8 },
        }),
      } as MessageEvent);
      expect(dispatched.some((a) => a.type === "intelligence/signalReceived")).toBe(true);
    });

    it("featureUpdate dispatches featureReceived", () => {
      const { dispatched, invoke } = createHarness();
      const ws = connectWs(invoke);
      ws.onmessage?.({
        data: JSON.stringify({
          event: "featureUpdate",
          data: { symbol: "AAPL", features: {} },
        }),
      } as MessageEvent);
      expect(dispatched.some((a) => a.type === "intelligence/featureReceived")).toBe(true);
    });

    it("recommendationUpdate dispatches recommendationReceived", () => {
      const { dispatched, invoke } = createHarness();
      const ws = connectWs(invoke);
      ws.onmessage?.({
        data: JSON.stringify({
          event: "recommendationUpdate",
          data: { symbol: "AAPL", action: "BUY", confidence: 0.9 },
        }),
      } as MessageEvent);
      expect(dispatched.some((a) => a.type === "intelligence/recommendationReceived")).toBe(true);
    });

    it("llmStateUpdate dispatches llmStateReceived", () => {
      const { dispatched, invoke } = createHarness();
      const ws = connectWs(invoke);
      ws.onmessage?.({
        data: JSON.stringify({
          event: "llmStateUpdate",
          data: {
            state: "active",
            pendingJobs: 1,
            trackedSymbols: 2,
            ts: 1000,
          },
        }),
      } as MessageEvent);
      expect(dispatched.some((a) => a.type === "llmSubsystem/llmStateReceived")).toBe(true);
    });

    it("upgradeStatus dispatches setUpgradeStatus", () => {
      const { dispatched, invoke } = createHarness();
      const ws = connectWs(invoke);
      ws.onmessage?.({
        data: JSON.stringify({
          event: "upgradeStatus",
          data: { inProgress: true, message: "Deploying v2" },
        }),
      } as MessageEvent);
      expect(dispatched.some((a) => a.type === "ui/setUpgradeStatus")).toBe(true);
    });

    it("ws.onclose marks feed as disconnected and schedules reconnect", () => {
      vi.useFakeTimers();
      const { dispatched, invoke } = createHarness();
      const ws = connectWs(invoke);
      ws.onclose?.({} as CloseEvent);
      expect(
        dispatched.some((a) => a.type === "market/setConnected" || a.type === "feed/setConnected")
      ).toBe(true);
      vi.useRealTimers();
    });

    it("ignores unparseable WebSocket frames without throwing", () => {
      const { invoke } = createHarness();
      const ws = connectWs(invoke);
      expect(() => {
        ws.onmessage?.({ data: "not-valid-json{{" } as MessageEvent);
      }).not.toThrow();
    });
  });
});
