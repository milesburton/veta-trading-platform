import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { breakersSlice } from "../../store/breakersSlice";
import type { RiskConfig, RiskPosition } from "../../store/riskApi";
import { RiskDashboardPanel } from "../RiskDashboardPanel";

const updateRiskConfig = vi.fn();

const state: {
  isLoading: boolean;
  positions: Record<string, RiskPosition[]>;
  riskConfig: RiskConfig;
  apiBreakers: Array<{
    key: string;
    type: "market-move" | "user-pnl";
    target: string;
    firedAt: number;
    expiresAt: number;
  }>;
} = {
  isLoading: false,
  positions: {},
  riskConfig: {
    fatFingerPct: 5,
    maxOpenOrders: 10,
    duplicateWindowMs: 500,
    maxOrdersPerSecond: 2,
    maxAdvPct: 10,
    maxGrossNotional: 1_000_000,
    maxDailyLoss: -50_000,
    maxConcentrationPct: 30,
    haltMovePercent: 8,
    breakerCooldownMs: 60_000,
    breakersEnabled: true,
  },
  apiBreakers: [],
};

vi.mock("../../store/riskApi.ts", () => ({
  useGetPositionsQuery: () => ({
    data: { positions: state.positions },
    isLoading: state.isLoading,
  }),
  useGetRiskConfigQuery: () => ({ data: state.riskConfig }),
  useGetBreakersQuery: () => ({ data: { active: state.apiBreakers } }),
  useUpdateRiskConfigMutation: () => [updateRiskConfig, { isLoading: false }],
}));

vi.mock("../PopOutButton.tsx", () => ({
  PopOutButton: () => <button type="button">Pop Out</button>,
}));

function renderPanel(wsBreakers: Array<{
  key: string;
  type: "market-move" | "user-pnl";
  scope: "symbol" | "user";
  target: string;
  observedValue: number;
  threshold: number;
  firedAt: number;
  expiresAt: number;
}> = []) {
  const store = configureStore({
    reducer: { breakers: breakersSlice.reducer },
    preloadedState: {
      breakers: {
        active: wsBreakers,
        cooldownMs: 60_000,
      },
    },
  });

  render(
    <Provider store={store}>
      <RiskDashboardPanel />
    </Provider>,
  );
}

describe("RiskDashboardPanel", () => {
  beforeEach(() => {
    updateRiskConfig.mockReset();
    updateRiskConfig.mockReturnValue({ unwrap: () => Promise.resolve({}) });

    state.isLoading = false;
    state.positions = {};
    state.apiBreakers = [];
    state.riskConfig = {
      fatFingerPct: 5,
      maxOpenOrders: 10,
      duplicateWindowMs: 500,
      maxOrdersPerSecond: 2,
      maxAdvPct: 10,
      maxGrossNotional: 1_000_000,
      maxDailyLoss: -50_000,
      maxConcentrationPct: 30,
      haltMovePercent: 8,
      breakerCooldownMs: 60_000,
      breakersEnabled: true,
    };
  });

  it("shows loading state", () => {
    state.isLoading = true;
    renderPanel();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders firm and user position data with breaker strip", () => {
    const now = Date.now();
    state.positions = {
      traderA: [
        {
          symbol: "AAPL",
          netQty: 100,
          avgPrice: 150,
          costBasis: 15_000,
          markPrice: 155,
          unrealisedPnl: 500,
          realisedPnl: -50,
          totalPnl: 450,
          fillCount: 2,
        },
      ],
    };
    state.apiBreakers = [
      {
        key: "market-move:AAPL",
        type: "market-move",
        target: "AAPL",
        firedAt: now - 1_000,
        expiresAt: now + 20_000,
      },
      {
        key: "market-move:EXPIRED",
        type: "market-move",
        target: "EXPIRED",
        firedAt: now - 10_000,
        expiresAt: now - 1,
      },
    ];

    renderPanel([
      {
        key: "user-pnl:traderA",
        type: "user-pnl",
        scope: "user",
        target: "traderA",
        observedValue: -1200,
        threshold: -1000,
        firedAt: now - 500,
        expiresAt: now + 30_000,
      },
    ]);

    expect(screen.getByText(/Risk Dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/Firm P&L/i)).toBeInTheDocument();
    expect(screen.getAllByText("traderA").length).toBeGreaterThan(0);
    expect(screen.getAllByText("AAPL").length).toBeGreaterThan(0);
    expect(screen.getByText(/Halted/i)).toBeInTheDocument();
    expect(screen.getAllByText("AAPL").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/expires in/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("EXPIRED")).not.toBeInTheDocument();
  });

  it("shows validation error when max daily loss is not negative", async () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText(/Max daily loss/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply/i }));

    await waitFor(() => {
      expect(screen.getByText(/maxDailyLoss must be negative/i)).toBeInTheDocument();
    });
    expect(updateRiskConfig).not.toHaveBeenCalled();
  });

  it("applies updated config", async () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText(/Max gross notional/i), {
      target: { value: "2000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply/i }));

    await waitFor(() => {
      expect(updateRiskConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          maxGrossNotional: 2_000_000,
          maxDailyLoss: -50_000,
        }),
      );
    });
  });
});
