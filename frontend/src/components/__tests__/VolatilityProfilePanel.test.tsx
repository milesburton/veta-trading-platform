import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { VolatilityProfilePanel } from "@veta/frontend/components/VolatilityProfilePanel";
import { marketSlice } from "@veta/frontend/store/marketSlice";
import * as React from "react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useGetVolProfileQuery = vi.fn();

vi.mock("../../store/analyticsApi.ts", () => ({
  useGetVolProfileQuery: (...args: unknown[]) => useGetVolProfileQuery(...args),
}));

vi.mock("recharts", () => {
  const MockContainer = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: MockContainer,
    AreaChart: MockContainer,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Area: () => null,
    ReferenceLine: () => null,
    Tooltip: ({ content }: { content?: React.ReactElement }) => (
      <div>
        {content
          ? React.cloneElement(content, {
              active: true,
              label: Date.now(),
              payload: [{ name: "EWMA Vol", value: 0.25, dataKey: "vol", color: "#60a5fa" }],
            })
          : null}
      </div>
    ),
  };
});

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
        connectionFailures: 0,
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

  it("hides spot summary when spotPrice is null", () => {
    useGetVolProfileQuery.mockReturnValue({
      data: {
        ewmaVol: 0.25,
        rollingVol: 0.2,
        spotPrice: null,
        computedAt: Date.now(),
        series: [{ ts: Date.now(), vol: 0.25 }],
      },
      isFetching: false,
      error: undefined,
    });

    renderPanel();

    expect(screen.queryByText(/Spot \$/i)).not.toBeInTheDocument();
  });

  it("shows refreshing indicator while fetching", () => {
    useGetVolProfileQuery.mockReturnValue({
      data: undefined,
      isFetching: true,
      error: undefined,
    });

    renderPanel();

    expect(screen.getByText(/Refreshing…/i)).toBeInTheDocument();
    expect(screen.queryByText(/Select a symbol to view vol profile/i)).not.toBeInTheDocument();
  });

  it("shows empty state when no data and no error", () => {
    useGetVolProfileQuery.mockReturnValue({
      data: undefined,
      isFetching: false,
      error: undefined,
    });

    renderPanel();

    expect(screen.getByText(/Select a symbol to view vol profile/i)).toBeInTheDocument();
  });

  it("falls back to generic error copy when error payload has no message", () => {
    useGetVolProfileQuery.mockReturnValue({
      data: undefined,
      isFetching: false,
      error: { status: 500 },
    });

    renderPanel();

    expect(screen.getByText("Failed to load")).toBeInTheDocument();
  });

  it("shows chart tooltip value when data is present", () => {
    renderPanel();
    expect(screen.getByText(/EWMA Vol:/i)).toBeInTheDocument();
  });
});
