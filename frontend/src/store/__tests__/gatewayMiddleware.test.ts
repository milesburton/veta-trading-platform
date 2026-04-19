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
      }),
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
          (a.payload as { id?: string; patch?: { status?: string } }).id ===
            "coid-1" &&
          (a.payload as { patch?: { status?: string } }).patch?.status ===
            "rejected",
      ),
    ).toBe(true);
    expect(dispatched.some((a) => a.type === "gridApi/invalidateTags")).toBe(
      true,
    );
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

    expect(dispatched.some((a) => a.type === "killSwitch/blockAdded")).toBe(
      true,
    );
    expect(
      dispatched.some((a) => a.type === "killSwitch/allBlocksCleared"),
    ).toBe(true);
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

    const breakerFiredCount = dispatched.filter(
      (a) => a.type === "breakers/breakerFired",
    ).length;
    expect(breakerFiredCount).toBe(1);
    expect(dispatched.some((a) => a.type === "killSwitch/blockAdded")).toBe(
      true,
    );
  });
});
