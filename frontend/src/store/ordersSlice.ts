import type { PayloadAction } from "@reduxjs/toolkit";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import type { ChildOrder, MarketPrices, OrderRecord, Trade } from "../types.ts";

export type KillScope = "all" | "user" | "algo" | "market" | "symbol";

export interface KillOrdersPayload {
  scope: KillScope;
  scopeValue?: string;
  targetUserId?: string;
}

export interface ResumeOrdersPayload {
  scope: KillScope;
  scopeValue?: string;
  targetUserId?: string;
  resumeAt?: number;
}

export interface FillReceivedPayload {
  clOrdId: string;
  filledQty: number;
  avgFillPrice: number;
  leavesQty: number;
}

// Gateway WebSocket — shared singleton set by gatewayMiddleware
let _gatewayWs: WebSocket | null = null;
export function setGatewayWs(ws: WebSocket | null): void {
  _gatewayWs = ws;
}

/**
 * Submit an order via the gateway WebSocket.
 *
 * The order is added to Redux state immediately with clientOrderId so the
 * blotter shows it at once. The gateway publishes it to the bus; the OMS
 * assigns a canonical orderId and publishes orders.submitted, which the
 * gateway forwards back to the GUI, triggering a patch.
 */
export const submitOrderThunk = createAsyncThunk(
  "orders/submit",
  async (trade: Trade, { dispatch, getState }): Promise<string> => {
    const clientOrderId = uuidv4();
    // Pick up the current user's ID from auth state (may be undefined if not logged in)
    const state = getState() as { auth?: { user?: { id?: string } } };
    const userId = state.auth?.user?.id;
    const order: OrderRecord = {
      id: clientOrderId,
      submittedAt: Date.now(),
      asset: trade.asset,
      side: trade.side,
      quantity: trade.quantity,
      limitPrice: trade.limitPrice,
      expiresAt: Date.now() + trade.expiresAt * 1000,
      strategy: trade.algoParams.strategy,
      status: "pending",
      filled: 0,
      algoParams: trade.algoParams,
      children: [],
      userId,
    };
    dispatch(ordersSlice.actions.orderAdded(order));

    if (_gatewayWs?.readyState === WebSocket.OPEN) {
      _gatewayWs.send(
        JSON.stringify({
          type: "submitOrder",
          payload: { ...trade, clientOrderId },
        })
      );
    } else {
      console.warn("[orders] Gateway WebSocket not connected — order queued locally only");
    }
    return clientOrderId;
  }
);

export const killOrdersThunk = createAsyncThunk("orders/kill", (payload: KillOrdersPayload) => {
  if (_gatewayWs?.readyState === WebSocket.OPEN) {
    _gatewayWs.send(JSON.stringify({ type: "killOrders", payload }));
  } else {
    console.warn("[orders] Gateway WebSocket not connected — kill command not sent");
  }
});

export const resumeOrdersThunk = createAsyncThunk(
  "orders/resume",
  (payload: ResumeOrdersPayload) => {
    if (_gatewayWs?.readyState === WebSocket.OPEN) {
      _gatewayWs.send(JSON.stringify({ type: "resumeOrders", payload }));
    } else {
      console.warn("[orders] Gateway WebSocket not connected — resume command not sent");
    }
  }
);

interface OrdersState {
  orders: OrderRecord[];
}

const MAX_ORDERS = 500;

const initialState: OrdersState = { orders: [] };

export const ordersSlice = createSlice({
  name: "orders",
  initialState,
  reducers: {
    orderAdded(state, action: PayloadAction<OrderRecord>) {
      if (!state.orders.find((o) => o.id === action.payload.id)) {
        state.orders.unshift(action.payload);
        if (state.orders.length > MAX_ORDERS) state.orders.length = MAX_ORDERS;
      }
    },
    orderPatched(state, action: PayloadAction<{ id: string; patch: Partial<OrderRecord> }>) {
      const { id, patch } = action.payload;
      const idx = state.orders.findIndex((o) => o.id === id);
      if (idx !== -1) Object.assign(state.orders[idx], patch);
    },
    childAdded(state, action: PayloadAction<{ parentId: string; child: ChildOrder }>) {
      const { parentId, child } = action.payload;
      const parent = state.orders.find((o) => o.id === parentId);
      if (parent) {
        const exists = parent.children.find((c) => c.id === child.id);
        if (!exists) parent.children.push(child);
        else Object.assign(exists, child);
      }
    },
    limitOrdersChecked(state, action: PayloadAction<MarketPrices>) {
      const prices = action.payload;
      const now = Date.now();
      state.orders = state.orders.map((order) => {
        if (order.strategy !== "LIMIT") return order;
        if (order.status === "filled" || order.status === "expired") return order;
        const marketPrice = prices[order.asset];
        if (!marketPrice) return order;
        if (now >= order.expiresAt) return { ...order, status: "expired" };
        const triggered =
          (order.side === "BUY" && marketPrice <= order.limitPrice) ||
          (order.side === "SELL" && marketPrice >= order.limitPrice);
        if (triggered) return { ...order, status: "filled", filled: order.quantity };
        if (order.status === "pending") return { ...order, status: "working" };
        return order;
      });
    },
    fillReceived(state, action: PayloadAction<FillReceivedPayload>) {
      const { clOrdId, filledQty } = action.payload;
      const order = state.orders.find((o) => o.id === clOrdId);
      if (!order) return;
      order.filled = (order.filled ?? 0) + filledQty;
      if (order.filled >= order.quantity) {
        order.status = "filled";
      } else if (filledQty > 0) {
        order.status = "working";
      }
    },
    orderCancelled(state, action: PayloadAction<{ clientOrderId: string }>) {
      const { clientOrderId } = action.payload;
      const idx = state.orders.findIndex((o) => o.id === clientOrderId);
      if (idx !== -1) state.orders[idx].status = "cancelled";
    },
  },
});

export const {
  orderAdded,
  orderPatched,
  childAdded,
  limitOrdersChecked,
  fillReceived,
  orderCancelled,
} = ordersSlice.actions;
