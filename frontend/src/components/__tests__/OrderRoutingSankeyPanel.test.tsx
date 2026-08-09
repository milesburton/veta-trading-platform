import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { OrderRoutingSankeyPanel } from "@veta/frontend/components/OrderRoutingSankeyPanel";
import { ordersSlice } from "@veta/frontend/store/ordersSlice";
import type { ChildOrder, OrderRecord } from "@veta/frontend/types";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";

const now = Date.now();

function makeChild(overrides: Partial<ChildOrder> = {}): ChildOrder {
  return {
    id: "child-1",
    parentId: "order-1",
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 150,
    status: "filled",
    filled: 100,
    submittedAt: now,
    ...overrides,
  };
}

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order-1",
    submittedAt: now,
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 150,
    expiresAt: now + 300_000,
    strategy: "TWAP",
    status: "filled",
    filled: 100,
    algoParams: { strategy: "TWAP", numSlices: 4, participationCap: 25 },
    children: [],
    ...overrides,
  };
}

function renderPanel(orders: OrderRecord[] = []) {
  const store = configureStore({
    reducer: { orders: ordersSlice.reducer },
    preloadedState: { orders: { orders, lastSubmittedOrderId: null } },
  });
  return render(
    <Provider store={store}>
      <OrderRoutingSankeyPanel />
    </Provider>
  );
}

describe("OrderRoutingSankeyPanel", () => {
  it("renders the panel header", () => {
    renderPanel();
    expect(screen.getByText("Order Routing Flow")).toBeInTheDocument();
  });

  it("shows an empty state when there are no filled child orders", () => {
    renderPanel([]);
    expect(screen.getByText("No filled child orders yet")).toBeInTheDocument();
  });

  it("shows an empty state when orders exist but no child has a venue yet", () => {
    renderPanel([makeOrder({ children: [makeChild({ venue: undefined })] })]);
    expect(screen.getByText("No filled child orders yet")).toBeInTheDocument();
  });

  it("renders the diagram (not the empty state) once flow exists", () => {
    renderPanel([makeOrder({ children: [makeChild({ venue: "XNAS", filled: 100 })] })]);
    expect(screen.queryByText("No filled child orders yet")).not.toBeInTheDocument();
  });

  it("toggles to a table view showing strategy, venue and filled quantity", () => {
    renderPanel([
      makeOrder({
        strategy: "TWAP",
        children: [makeChild({ venue: "XNAS", filled: 100 })],
      }),
    ]);
    fireEvent.click(screen.getByTestId("toggle-table-view"));
    const table = screen.getByTestId("routing-table");
    expect(table).toHaveTextContent("TWAP");
    expect(table).toHaveTextContent("XNAS");
    expect(table).toHaveTextContent("100");
  });

  it("toggles back to the diagram view", () => {
    renderPanel([makeOrder({ children: [makeChild({ venue: "XNAS", filled: 100 })] })]);
    const toggle = screen.getByTestId("toggle-table-view");
    fireEvent.click(toggle);
    expect(screen.getByTestId("routing-table")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByTestId("routing-table")).not.toBeInTheDocument();
  });
});
