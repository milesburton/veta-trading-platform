import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { marketSlice } from "../../store/marketSlice";
import { VolatilityProfilePanel } from "../VolatilityProfilePanel";

const useGetVolProfileQuery = vi.fn();

vi.mock("../../store/analyticsApi.ts", () => ({
  useGetVolProfileQuery: (...args: unknown[]) => useGetVolProfileQuery(...args),
}));

function renderPanel() {
  const store = configureStore({
    reducer: { market: marketSlice.reducer },
    preloadedState: {
      market: {
        assets: [
          {
            symbol: "AAPL",
            name: "Apple",
            exchange: "NASDAQ",
            sector: "Tech",
            initialPrice: 150,
            volatility: 0.02,
          },
          {
            symbol: "MSFT",
            name: "Microsoft",
            exchange: "NASDAQ",
            sector: "Tech",
            initialPrice: 300,
            volatility: 0.02,
          },
        ],
        prices: {},
        sessionOpen: {},
        priceHistory: {},
        candleHistory: {},
        candlesReady: {},
        orderBook: {},
        connected: true,
        sessionPhase: "CONTINUOUS" as const,
      },
    },
  });

  render(
    <Provider store={store}>
      <VolatilityProfilePanel />
    </Provider>
  );
}

beforeEach(() => {
  useGetVolProfileQuery.mockReset();
  useGetVolProfileQuery.mockReturnValue({
    data: {
      ewmaVol: 0.25,
      rollingVol: 0.2,
      spotPrice: 123.45,
      computedAt: Date.now(),
      series: [
        { ts: Date.now() - 120_000, vol: 0.22 },
        { ts: Date.now() - 60_000, vol: 0.24 },
        { ts: Date.now(), vol: 0.25 },
      ],
    },
    isFetching: false,
    error: undefined,
  });
});

describe("VolatilityProfilePanel", () => {
  it("renders summary metrics and chart context", () => {
    renderPanel();

    expect(screen.getByText(/Volatility Profile/i)).toBeInTheDocument();
    expect(screen.getByText("25.00%")).toBeInTheDocument();
    expect(screen.getByText("20.00%")).toBeInTheDocument();
    expect(screen.getByText("Spot $123.45")).toBeInTheDocument();
    expect(screen.getByText(/Auto-refreshes every 60s/i)).toBeInTheDocument();
  });

  it("changes selected symbol and re-queries", () => {
    renderPanel();

    const symbolSelect = screen.getByRole("combobox");
    fireEvent.change(symbolSelect, { target: { value: "MSFT" } });

    const symbolsSeen = useGetVolProfileQuery.mock.calls.map((c) => c[0]);
    expect(symbolsSeen).toContain("AAPL");
    expect(symbolsSeen).toContain("MSFT");
  });

  it("shows error and empty-state messaging", () => {
    useGetVolProfileQuery.mockReturnValue({
      data: undefined,
      isFetching: false,
      error: { data: { error: "backend down" } },
    });

    renderPanel();

    expect(screen.getByText("backend down")).toBeInTheDocument();
    expect(screen.getByText(/Could not load volatility data/i)).toBeInTheDocument();
  });
});
