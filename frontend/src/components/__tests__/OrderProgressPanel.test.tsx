import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { OrderProgressPanel } from "@veta/frontend/components/OrderProgressPanel";
import { ChannelContext } from "@veta/frontend/contexts/ChannelContext";
import { channelsSlice } from "@veta/frontend/store/channelsSlice";
import { marketSlice } from "@veta/frontend/store/marketSlice";
import { ordersSlice } from "@veta/frontend/store/ordersSlice";
import { uiSlice } from "@veta/frontend/store/uiSlice";
import { windowSlice } from "@veta/frontend/store/windowSlice";
import type { OrderRecord } from "@veta/frontend/types";
import * as React from "react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => {
  const MockContainer = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: MockContainer,
    PieChart: MockContainer,
    BarChart: MockContainer,
    Pie: MockContainer,
    Bar: MockContainer,
    XAxis: () => null,
    YAxis: () => null,
    Cell: () => null,
    Tooltip: ({ content }: { content?: React.ReactElement }) => {
      if (!content) return null;
      if (content.type && (content.type as { name?: string }).name?.includes("PieTooltipContent")) {
        return React.cloneElement(content, {
          active: true,
          payload: [{ name: "Filled", value: 50 }],
        });
      }
      return React.cloneElement(content, {
        active: true,
        label: "ABC123",
        payload: [{ value: 25 }],
      });
    },
  };
});

const now = Date.now();

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order-1",
    submittedAt: now,
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 150,
    expiresAt: now + 60_000,
    strategy: "TWAP",
    status: "working",
    filled: 50,
    algoParams: { strategy: "TWAP", numSlices: 4, participationCap: 25 },
    children: [],
    ...overrides,
  };
}

function makeStore(orders: OrderRecord[] = [], selectedOrderId: string | null = null) {
  return configureStore({
    reducer: {
      orders: ordersSlice.reducer,
      market: marketSlice.reducer,
      ui: uiSlice.reducer,
      channels: channelsSlice.reducer,
      windows: windowSlice.reducer,
    },
    preloadedState: {
      orders: { orders, lastSubmittedOrderId: null },
      channels: {
        data: {
          1: { selectedAsset: null, selectedOrderId: null },
          2: { selectedAsset: null, selectedOrderId },
          3: { selectedAsset: null, selectedOrderId: null },
          4: { selectedAsset: null, selectedOrderId: null },
          5: { selectedAsset: null, selectedOrderId: null },
          6: { selectedAsset: null, selectedOrderId: null },
        },
      },
    },
  });
}

function renderPanel(orders: OrderRecord[] = [], selectedOrderId: string | null = null) {
  const store = makeStore(orders, selectedOrderId);
  return render(
    <Provider store={store}>
      <ChannelContext.Provider
        value={{
          instanceId: "test",
          panelType: "order-progress",
          outgoing: null,
          incoming: 2,
        }}
      >
        <OrderProgressPanel />
      </ChannelContext.Provider>
    </Provider>
  );
}

describe("OrderProgressPanel", () => {
  it("shows empty state when no order is selected", () => {
    renderPanel([makeOrder()]);
    expect(screen.getByText(/Select an order in the blotter/i)).toBeInTheDocument();
  });

  it("shows empty state when selected order does not exist", () => {
    renderPanel([], "nonexistent-id");
    expect(screen.getByText(/Select an order in the blotter/i)).toBeInTheDocument();
  });

  it("shows fill percentage for the selected order", () => {
    renderPanel([makeOrder({ id: "order-1", filled: 50, quantity: 100 })], "order-1");
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows order details in the header", () => {
    renderPanel([makeOrder({ id: "order-1" })], "order-1");
    expect(screen.getByText(/AAPL/)).toBeInTheDocument();
    expect(screen.getByText(/TWAP/)).toBeInTheDocument();
  });

  it("shows 100% for a fully filled order", () => {
    renderPanel(
      [
        makeOrder({
          id: "order-1",
          filled: 100,
          quantity: 100,
          status: "filled",
        }),
      ],
      "order-1"
    );
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("shows slice fills section when order has filled children", () => {
    const order = makeOrder({
      id: "order-1",
      filled: 50,
      children: [
        {
          id: "child-1",
          parentId: "order-1",
          asset: "AAPL",
          side: "BUY",
          quantity: 50,
          limitPrice: 150,
          status: "filled",
          filled: 50,
          submittedAt: now,
        },
      ],
    });
    renderPanel([order], "order-1");
    expect(screen.getByText(/Slice fills/i)).toBeInTheDocument();
  });

  it("does not show slice fills when no children", () => {
    renderPanel([makeOrder({ id: "order-1", children: [] })], "order-1");
    expect(screen.queryByText(/Slice fills/i)).not.toBeInTheDocument();
  });

  it("shows the order ID in the header", () => {
    renderPanel(
      [makeOrder({ id: "abcdef12-0000-0000-0000-000000000000" })],
      "abcdef12-0000-0000-0000-000000000000"
    );
    expect(screen.getByText("abcdef12")).toBeInTheDocument();
  });

  it("renders SELL order side", () => {
    renderPanel([makeOrder({ id: "order-sell", side: "SELL" })], "order-sell");
    // SELL might render in label, badge, or aria-label
    expect(screen.getAllByText(/SELL/i).length).toBeGreaterThan(0);
  });

  it("renders expired order without crash", () => {
    renderPanel([makeOrder({ id: "order-exp", status: "expired", filled: 30 })], "order-exp");
    expect(screen.getByText(/AAPL/)).toBeInTheDocument();
  });

  it("renders order with empty children list", () => {
    renderPanel([makeOrder({ id: "order-empty", filled: 0, children: [] })], "order-empty");
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("renders LIMIT strategy order", () => {
    renderPanel(
      [
        makeOrder({
          id: "order-limit",
          strategy: "LIMIT",
          algoParams: { strategy: "LIMIT" },
        }),
      ],
      "order-limit"
    );
    expect(screen.getByText("LIMIT")).toBeInTheDocument();
  });

  it("renders multiple slice children", () => {
    const order = makeOrder({
      id: "order-multi",
      filled: 100,
      quantity: 100,
      status: "filled",
      children: [
        {
          id: "c1",
          parentId: "order-multi",
          asset: "AAPL",
          side: "BUY",
          quantity: 50,
          limitPrice: 150,
          status: "filled",
          filled: 50,
          avgFillPrice: 150,
          submittedAt: now - 5000,
        },
        {
          id: "c2",
          parentId: "order-multi",
          asset: "AAPL",
          side: "BUY",
          quantity: 50,
          limitPrice: 151,
          status: "filled",
          filled: 50,
          avgFillPrice: 151,
          submittedAt: now,
        },
      ],
    });
    renderPanel([order], "order-multi");
    expect(screen.getByText(/Slice fills/i)).toBeInTheDocument();
  });

  it("renders 0% when quantity is zero", () => {
    renderPanel([makeOrder({ id: "order-zero", quantity: 0, filled: 50 })], "order-zero");
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("caps percentage at 100 when filled exceeds quantity", () => {
    renderPanel([makeOrder({ id: "order-over", quantity: 100, filled: 140 })], "order-over");
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("shows avg fill and commission when provided", () => {
    renderPanel(
      [
        makeOrder({
          id: "order-metrics",
          avgFillPrice: 149.123,
          totalCommissionUSD: 12.3,
        }),
      ],
      "order-metrics"
    );

    expect(screen.getByText("$149.12")).toBeInTheDocument();
    expect(screen.getByText("$12.30")).toBeInTheDocument();
  });

  it("hides commission when zero", () => {
    renderPanel([makeOrder({ id: "order-no-comm", totalCommissionUSD: 0 })], "order-no-comm");
    expect(screen.queryByText(/comm \$/i)).not.toBeInTheDocument();
  });

  it("does not show slice fills for non-filled or zero-filled children", () => {
    const order = makeOrder({
      id: "order-child-filter",
      children: [
        {
          id: "child-working",
          parentId: "order-child-filter",
          asset: "AAPL",
          side: "BUY",
          quantity: 50,
          limitPrice: 150,
          status: "working",
          filled: 20,
          submittedAt: now,
        },
        {
          id: "child-zero",
          parentId: "order-child-filter",
          asset: "AAPL",
          side: "BUY",
          quantity: 50,
          limitPrice: 150,
          status: "filled",
          filled: 0,
          submittedAt: now,
        },
      ],
    });

    renderPanel([order], "order-child-filter");
    expect(screen.queryByText(/Slice fills/i)).not.toBeInTheDocument();
  });

  it("renders tooltip content for pie and bar charts", () => {
    const order = makeOrder({
      id: "order-tooltips",
      children: [
        {
          id: "child-tt",
          parentId: "order-tooltips",
          asset: "AAPL",
          side: "BUY",
          quantity: 50,
          limitPrice: 150,
          status: "filled",
          filled: 25,
          submittedAt: now,
        },
      ],
    });

    renderPanel([order], "order-tooltips");
    expect(screen.getByText(/50% filled/i)).toBeInTheDocument();
    expect(screen.getByText(/Slice ABC123: 25 shares/i)).toBeInTheDocument();
  });

  it("renders all strategy labels used by colour mapping", () => {
    renderPanel([makeOrder({ id: "order-pov", strategy: "POV" })], "order-pov");
    expect(screen.getByText("POV")).toBeInTheDocument();

    renderPanel([makeOrder({ id: "order-vwap", strategy: "VWAP" })], "order-vwap");
    expect(screen.getByText("VWAP")).toBeInTheDocument();
  });

  it("renders unknown strategy without crashing", () => {
    const unknown = makeOrder({
      id: "order-unknown",
      strategy: "UNKNOWN" as unknown as OrderRecord["strategy"],
      algoParams: { strategy: "LIMIT" },
    });
    renderPanel([unknown], "order-unknown");
    expect(screen.getByText("UNKNOWN")).toBeInTheDocument();
  });
});
