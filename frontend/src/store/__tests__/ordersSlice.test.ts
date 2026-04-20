import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildOrder, OrderRecord } from "../../types";
import {
  cancelOrdersThunk,
  childAdded,
  fillReceived,
  killOrdersThunk,
  limitOrdersChecked,
  orderAdded,
  orderCancelled,
  orderPatched,
  ordersSlice,
  setGatewayWs,
  submitOrderThunk,
} from "../ordersSlice";

const { reducer } = ordersSlice;
const initial = { orders: [], lastSubmittedOrderId: null };

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order-1",
    submittedAt: 1000,
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 150,
    expiresAt: Date.now() + 300_000,
    strategy: "LIMIT",
    status: "pending",
    filled: 0,
    algoParams: { strategy: "LIMIT" },
    children: [],
    ...overrides,
  };
}

describe("ordersSlice – orderAdded", () => {
  it("adds order to empty state", () => {
    const order = makeOrder();
    const state = reducer(initial, orderAdded(order));
    expect(state.orders).toHaveLength(1);
    expect(state.orders[0].id).toBe("order-1");
  });

  it("prepends new orders (newest first)", () => {
    const first = makeOrder({ id: "a" });
    const second = makeOrder({ id: "b" });
    let state = reducer(initial, orderAdded(first));
    state = reducer(state, orderAdded(second));
    expect(state.orders[0].id).toBe("b");
    expect(state.orders[1].id).toBe("a");
  });
});

describe("ordersSlice – orderPatched", () => {
  it("patches a matching order", () => {
    const order = makeOrder({ status: "pending" });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, orderPatched({ id: "order-1", patch: { status: "working" } }));
    expect(state.orders[0].status).toBe("working");
  });

  it("ignores patch for unknown id", () => {
    const order = makeOrder();
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, orderPatched({ id: "unknown-id", patch: { status: "filled" } }));
    expect(state.orders[0].status).toBe("pending");
  });

  it("patches filled quantity", () => {
    const order = makeOrder({ filled: 0, quantity: 100 });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, orderPatched({ id: "order-1", patch: { filled: 50 } }));
    expect(state.orders[0].filled).toBe(50);
  });
});

describe("ordersSlice – childAdded", () => {
  const child: ChildOrder = {
    id: "child-1",
    parentId: "order-1",
    asset: "AAPL",
    side: "BUY",
    quantity: 25,
    limitPrice: 150,
    status: "filled",
    filled: 25,
    submittedAt: Date.now(),
  };

  it("adds child to parent order", () => {
    const order = makeOrder();
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, childAdded({ parentId: "order-1", child }));
    expect(state.orders[0].children).toHaveLength(1);
    expect(state.orders[0].children[0].id).toBe("child-1");
  });

  it("does nothing for unknown parent", () => {
    const order = makeOrder();
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, childAdded({ parentId: "no-such-order", child }));
    expect(state.orders[0].children).toHaveLength(0);
  });

  it("can add multiple children", () => {
    const order = makeOrder();
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, childAdded({ parentId: "order-1", child: { ...child, id: "c1" } }));
    state = reducer(state, childAdded({ parentId: "order-1", child: { ...child, id: "c2" } }));
    expect(state.orders[0].children).toHaveLength(2);
  });
});

describe("ordersSlice – limitOrdersChecked", () => {
  it("fills a BUY order when market price ≤ limit price", () => {
    const order = makeOrder({
      side: "BUY",
      limitPrice: 155,
      status: "pending",
    });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, limitOrdersChecked({ AAPL: 154 }));
    expect(state.orders[0].status).toBe("filled");
    expect(state.orders[0].filled).toBe(100);
  });

  it("fills a SELL order when market price ≥ limit price", () => {
    const order = makeOrder({
      side: "SELL",
      limitPrice: 150,
      status: "pending",
    });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, limitOrdersChecked({ AAPL: 151 }));
    expect(state.orders[0].status).toBe("filled");
  });

  it("does NOT fill a BUY when market price > limit price", () => {
    const order = makeOrder({
      side: "BUY",
      limitPrice: 150,
      status: "pending",
    });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, limitOrdersChecked({ AAPL: 160 }));
    // queued → executing on first check
    expect(state.orders[0].status).toBe("working");
  });

  it("transitions queued → executing when not triggered", () => {
    const order = makeOrder({
      status: "pending",
      limitPrice: 100,
      side: "BUY",
    });
    let state = reducer(initial, orderAdded(order));
    // price above limit — no fill
    state = reducer(state, limitOrdersChecked({ AAPL: 200 }));
    expect(state.orders[0].status).toBe("working");
  });

  it("expires order when past expiresAt", () => {
    const expired = makeOrder({ expiresAt: Date.now() - 1000 });
    let state = reducer(initial, orderAdded(expired));
    state = reducer(state, limitOrdersChecked({ AAPL: 999 }));
    expect(state.orders[0].status).toBe("expired");
  });

  it("does not re-check already filled orders", () => {
    const order = makeOrder({ status: "filled", filled: 100 });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, limitOrdersChecked({ AAPL: 100 }));
    expect(state.orders[0].status).toBe("filled");
  });

  it("does not re-check already expired orders", () => {
    const order = makeOrder({ status: "expired" });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, limitOrdersChecked({ AAPL: 100 }));
    expect(state.orders[0].status).toBe("expired");
  });

  it("skips non-LIMIT strategy orders", () => {
    const order = makeOrder({ strategy: "TWAP", status: "working" });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, limitOrdersChecked({ AAPL: 1 }));
    // Status unchanged — only LIMIT orders are evaluated
    expect(state.orders[0].status).toBe("working");
  });

  it("skips order when no price for asset", () => {
    const order = makeOrder({ asset: "XYZ", status: "pending" });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, limitOrdersChecked({ AAPL: 100 })); // no XYZ price
    expect(state.orders[0].status).toBe("pending");
  });
});

describe("ordersSlice – fillReceived", () => {
  it("accumulates fill quantity and marks order as working for partial fill", () => {
    const order = makeOrder({ quantity: 100, filled: 0, status: "pending" });
    let state = reducer(initial, orderAdded(order));
    state = reducer(
      state,
      fillReceived({
        clOrdId: "order-1",
        filledQty: 40,
        avgFillPrice: 150,
        leavesQty: 60,
      })
    );
    expect(state.orders[0].filled).toBe(40);
    expect(state.orders[0].status).toBe("working");
  });

  it("marks order as filled when cumulative fill reaches quantity", () => {
    const order = makeOrder({ quantity: 100, filled: 60, status: "working" });
    let state = reducer(initial, orderAdded(order));
    state = reducer(
      state,
      fillReceived({
        clOrdId: "order-1",
        filledQty: 40,
        avgFillPrice: 150,
        leavesQty: 0,
      })
    );
    expect(state.orders[0].filled).toBe(100);
    expect(state.orders[0].status).toBe("filled");
  });

  it("does nothing for unknown order id", () => {
    const order = makeOrder({ status: "working" });
    let state = reducer(initial, orderAdded(order));
    state = reducer(
      state,
      fillReceived({
        clOrdId: "no-such-id",
        filledQty: 10,
        avgFillPrice: 150,
        leavesQty: 90,
      })
    );
    expect(state.orders[0].filled).toBe(0);
  });
});

describe("ordersSlice – orderCancelled", () => {
  it("marks a matching order as cancelled", () => {
    const order = makeOrder({ status: "working" });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, orderCancelled({ clientOrderId: "order-1" }));
    expect(state.orders[0].status).toBe("cancelled");
  });

  it("does nothing for unknown clientOrderId", () => {
    const order = makeOrder({ status: "working" });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, orderCancelled({ clientOrderId: "no-such-id" }));
    expect(state.orders[0].status).toBe("working");
  });
});

describe("ordersSlice – MAX_ORDERS cap", () => {
  it("trims orders list to 500 entries", () => {
    let state = reducer(undefined, { type: "@@INIT" });
    for (let i = 0; i < 502; i++) {
      state = reducer(state, orderAdded(makeOrder({ id: `order-${i}` })));
    }
    expect(state.orders).toHaveLength(500);
  });
});

describe("ordersSlice – submitOrderThunk", () => {
  let mockWs: { readyState: number; send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockWs = { readyState: 1 /* OPEN */, send: vi.fn() };
    setGatewayWs(mockWs as unknown as WebSocket);
  });

  afterEach(() => {
    setGatewayWs(null);
  });

  it("dispatches orderAdded and sends submitOrder over WebSocket", async () => {
    const dispatched: unknown[] = [];
    const thunkDispatch = (action: unknown) => {
      dispatched.push(action);
      return action;
    };
    const getState = () => ({ auth: { user: { id: "u1" } } });

    const trade = {
      asset: "AAPL",
      side: "BUY" as const,
      quantity: 100,
      limitPrice: 150,
      expiresAt: 300,
      algoParams: { strategy: "LIMIT" },
    };

    await submitOrderThunk(trade as never)(thunkDispatch as never, getState as never, undefined);

    expect(mockWs.send).toHaveBeenCalled();
    const sent = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(sent.type).toBe("submitOrder");
    expect(sent.payload.asset).toBe("AAPL");
  });

  it("dispatches orderAdded even when WebSocket is not connected", async () => {
    setGatewayWs(null);
    const dispatched: unknown[] = [];
    const thunkDispatch = (action: unknown) => {
      dispatched.push(action);
      return action;
    };
    const getState = () => ({ auth: { user: { id: "u1" } } });
    const trade = {
      asset: "TSLA",
      side: "SELL" as const,
      quantity: 50,
      limitPrice: 200,
      expiresAt: 300,
      algoParams: { strategy: "LIMIT" },
    };

    await submitOrderThunk(trade as never)(thunkDispatch as never, getState as never, undefined);

    const orderAddedAction = dispatched.find((a) => orderAdded.match(a as { type: string }));
    expect(orderAddedAction).toBeDefined();
    expect(mockWs.send).not.toHaveBeenCalled();
  });

  it("sets lastSubmittedOrderId in the reducer when fulfilled", () => {
    const clientOrderId = "test-client-id";
    const state = reducer(initial, {
      type: "orders/submit/fulfilled",
      payload: clientOrderId,
    } as never);
    expect(state.lastSubmittedOrderId).toBe(clientOrderId);
  });
});

describe("ordersSlice – killOrdersThunk", () => {
  it("sends killOrders message over WebSocket", async () => {
    const mockWs = { readyState: 1, send: vi.fn() };
    setGatewayWs(mockWs as unknown as WebSocket);

    await killOrdersThunk({ scope: "all" })(vi.fn() as never, vi.fn() as never, undefined);

    const sent = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(sent.type).toBe("killOrders");
    expect(sent.payload.scope).toBe("all");
    setGatewayWs(null);
  });
});

describe("ordersSlice – cancelOrdersThunk", () => {
  it("sends cancelOrders message over WebSocket", async () => {
    const mockWs = { readyState: 1, send: vi.fn() };
    setGatewayWs(mockWs as unknown as WebSocket);

    await cancelOrdersThunk(["ord-1", "ord-2"])(vi.fn() as never, vi.fn() as never, undefined);

    const sent = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(sent.type).toBe("cancelOrders");
    expect(sent.payload.orderIds).toEqual(["ord-1", "ord-2"]);
    setGatewayWs(null);
  });
});
