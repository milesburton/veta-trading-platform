import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authSlice } from "../../store/authSlice";
import type { RiskPosition } from "../../store/riskApi";
import { MyPositionsPanel } from "../MyPositionsPanel";

const state: {
  isLoading: boolean;
  positions: RiskPosition[];
} = {
  isLoading: false,
  positions: [],
};

vi.mock("../../store/riskApi.ts", () => ({
  useGetUserPositionsQuery: () => ({
    data: { userId: "u-1", positions: state.positions },
    isLoading: state.isLoading,
  }),
}));

vi.mock("../PopOutButton.tsx", () => ({
  PopOutButton: () => <button type="button">Pop Out</button>,
}));

function renderPanel() {
  const store = configureStore({
    reducer: { auth: authSlice.reducer },
    preloadedState: {
      auth: {
        user: {
          id: "u-1",
          name: "Trader",
          role: "trader",
          avatar_emoji: "T",
        },
        limits: {
          max_order_qty: 10_000,
          max_daily_notional: 1_000_000,
          allowed_strategies: ["LIMIT"],
          allowed_desks: ["equity"],
          dark_pool_access: false,
        },
        status: "authenticated" as const,
      },
    },
  });

  render(
    <Provider store={store}>
      <MyPositionsPanel />
    </Provider>,
  );
}

describe("MyPositionsPanel", () => {
  beforeEach(() => {
    state.isLoading = false;
    state.positions = [];
  });

  it("shows loading state", () => {
    state.isLoading = true;
    renderPanel();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows empty state when no positions", () => {
    renderPanel();

    expect(screen.getByText(/No open positions/i)).toBeInTheDocument();
  });

  it("renders rows and totals", () => {
    state.positions = [
      {
        symbol: "AAPL",
        netQty: 100,
        avgPrice: 150,
        costBasis: 15000,
        markPrice: 155,
        unrealisedPnl: 500,
        realisedPnl: -40,
        totalPnl: 460,
        fillCount: 2,
      },
      {
        symbol: "MSFT",
        netQty: -50,
        avgPrice: 300,
        costBasis: 15000,
        markPrice: 290,
        unrealisedPnl: 500,
        realisedPnl: 20,
        totalPnl: 520,
        fillCount: 1,
      },
    ];

    renderPanel();

    expect(screen.getByText(/My Positions/i)).toBeInTheDocument();
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("MSFT")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText(/Gross/i)).toBeInTheDocument();
    expect(screen.getAllByText(/P&L/i).length).toBeGreaterThan(0);
  });
});
