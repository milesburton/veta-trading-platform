import { configureStore } from "@reduxjs/toolkit";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { alertsSlice } from "../../store/alertsSlice";
import { observabilitySlice } from "../../store/observabilitySlice";
import { ordersSlice } from "../../store/ordersSlice";
import { ThroughputGaugesPanel } from "../ThroughputGaugesPanel";

vi.mock("recharts", () => {
  const MockContainer = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: MockContainer,
    LineChart: MockContainer,
    Tooltip: () => null,
    XAxis: () => null,
    Line: () => null,
  };
});

function makeOrder(id: string, submittedAt: number, strategy = "TWAP", filledChildren = 0, totalChildren = 0) {
  return {
    id,
    submittedAt,
    status: "working",
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 100,
    expiresAt: submittedAt + 60_000,
    strategy,
    filled: 0,
    algoParams: { strategy: "TWAP", numSlices: 2, participationCap: 0.1 },
    children: Array.from({ length: totalChildren }, (_, i) => ({
      id: `${id}-c-${i}`,
      parentId: id,
      asset: "AAPL",
      side: "BUY",
      quantity: 10,
      limitPrice: 100,
      status: i < filledChildren ? "filled" : "working",
      submittedAt,
      filledQty: i < filledChildren ? 10 : 0,
    })),
  };
}

function renderPanel({ orders, events }: { orders: unknown[]; events: unknown[] }) {
  const store = configureStore({
    reducer: {
      orders: ordersSlice.reducer,
      observability: observabilitySlice.reducer,
      alerts: alertsSlice.reducer,
    },
    preloadedState: {
      orders: { orders, lastSubmittedOrderId: null },
      observability: { events },
      alerts: { alerts: [], muteRules: [] },
    },
  });

  render(
    <Provider store={store}>
      <ThroughputGaugesPanel />
    </Provider>,
  );

  return store;
}

describe("ThroughputGaugesPanel", () => {
  it("renders computed metrics from recent orders and events", () => {
    const now = Date.now();
    renderPanel({
      orders: [
        makeOrder("o1", now - 1_000, "TWAP", 2, 4),
        makeOrder("o2", now - 2_000, "VWAP", 1, 3),
      ],
      events: [{ type: "orders.submitted", ts: now - 500 }],
    });

    expect(screen.getByText(/Throughput Gauges/i)).toBeInTheDocument();
    expect(screen.getByText(/Orders \/ min/i)).toBeInTheDocument();
    expect(screen.getByText(/Fills \/ min/i)).toBeInTheDocument();
    expect(screen.getByText(/Bus events \/ min/i)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("43%")).toBeInTheDocument();
  });

  it("emits a warning alert when fill rate is degraded", async () => {
    const now = Date.now();
    const store = renderPanel({
      orders: [makeOrder("o1", now - 1_000, "TWAP", 1, 6)],
      events: [],
    });

    await waitFor(() => {
      const warnings = store
        .getState()
        .alerts.alerts.filter((a) => a.message.includes("Fill rate degraded"));
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  it("emits an order flood warning when rate exceeds threshold", async () => {
    const now = Date.now();
    const manyOrders = Array.from({ length: 205 }, (_, i) => makeOrder(`o-${i}`, now - 1_000));

    const store = renderPanel({ orders: manyOrders, events: [] });

    await waitFor(() => {
      const warnings = store
        .getState()
        .alerts.alerts.filter((a) => a.message.includes("Order flood detected"));
      expect(warnings.length).toBeGreaterThan(0);
    });
  });
});
