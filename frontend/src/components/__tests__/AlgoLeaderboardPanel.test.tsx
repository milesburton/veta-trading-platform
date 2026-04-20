import { configureStore } from "@reduxjs/toolkit";
import { render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { ordersSlice } from "../../store/ordersSlice";
import type { OrderRecord } from "../../types";
import { AlgoLeaderboardPanel } from "../AlgoLeaderboardPanel";

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "o-1",
    submittedAt: Date.now(),
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 150,
    expiresAt: Date.now() + 60_000,
    strategy: "TWAP",
    status: "working",
    filled: 0,
    algoParams: { strategy: "TWAP", numSlices: 4, participationCap: 20 },
    children: [],
    ...overrides,
  };
}

function makeStore(orders: OrderRecord[]) {
  return configureStore({
    reducer: {
      orders: ordersSlice.reducer,
    },
    preloadedState: {
      orders: {
        orders,
        lastSubmittedOrderId: null,
      },
    },
  });
}

function renderPanel(orders: OrderRecord[]) {
  render(
    <Provider store={makeStore(orders)}>
      <AlgoLeaderboardPanel />
    </Provider>
  );
}

describe("AlgoLeaderboardPanel", () => {
  it("shows empty state when there are no recent orders", () => {
    renderPanel([]);
    expect(screen.getByText(/No order data in last 5 minutes/i)).toBeInTheDocument();
  });

  it("renders strategy rows with order counts and fill rate", () => {
    renderPanel([
      makeOrder({
        id: "twap-filled",
        strategy: "TWAP",
        status: "filled",
        filled: 100,
      }),
      makeOrder({
        id: "twap-expired",
        strategy: "TWAP",
        status: "expired",
        filled: 10,
      }),
      makeOrder({
        id: "pov-filled",
        strategy: "POV",
        status: "filled",
        filled: 50,
        limitPrice: 100,
        avgFillPrice: 100,
      }),
    ]);

    expect(screen.getByText("TWAP")).toBeInTheDocument();
    expect(screen.getByText("POV")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows avg slippage and total filled qty", () => {
    renderPanel([
      makeOrder({
        id: "twap-a",
        strategy: "TWAP",
        status: "filled",
        filled: 100,
        limitPrice: 150,
        avgFillPrice: 151,
      }),
      makeOrder({
        id: "twap-b",
        strategy: "TWAP",
        status: "filled",
        filled: 50,
        limitPrice: 200,
        avgFillPrice: 200,
      }),
    ]);

    // slippage should be shown in bp
    expect(screen.getByText(/bp$/i)).toBeInTheDocument();
    // total filled quantity for TWAP row is 150
    expect(screen.getByText("150")).toBeInTheDocument();
  });

  it("orders strategies by fill rate descending", () => {
    renderPanel([
      makeOrder({
        id: "twap-expired",
        strategy: "TWAP",
        status: "expired",
        filled: 0,
      }),
      makeOrder({
        id: "pov-filled",
        strategy: "POV",
        status: "filled",
        filled: 100,
        limitPrice: 100,
        avgFillPrice: 100,
      }),
    ]);

    const rows = screen.getAllByRole("row");
    const firstDataRow = rows[1];
    expect(within(firstDataRow).getByText("POV")).toBeInTheDocument();
  });
});
