import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { MarketDepth } from "@veta/frontend/components/MarketDepth";
import { marketSlice } from "@veta/frontend/store/marketSlice";
import { ordersSlice } from "@veta/frontend/store/ordersSlice";
import { uiSlice } from "@veta/frontend/store/uiSlice";
import { windowSlice } from "@veta/frontend/store/windowSlice";
import type { OrderBookSnapshot } from "@veta/frontend/types";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it, vi } from "vitest";

// lightweight-charts renders to canvas — stub it
vi.mock("lightweight-charts", () => {
  const seriesStub = { setData: vi.fn(), applyOptions: vi.fn() };
  const chartStub = {
    addSeries: vi.fn(() => seriesStub),
    priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    applyOptions: vi.fn(),
    timeScale: vi.fn(() => ({ fitContent: vi.fn(), visible: false })),
    remove: vi.fn(),
  };
  return {
    createChart: vi.fn(() => chartStub),
    HistogramSeries: {},
    ColorType: { Solid: "solid" },
  };
});

const mockSnapshot: OrderBookSnapshot = {
  mid: 180.25,
  ts: Date.now(),
  bids: Array.from({ length: 10 }, (_, i) => ({ price: 180.25 - i * 0.01, size: 1000 - i * 80 })),
  asks: Array.from({ length: 10 }, (_, i) => ({ price: 180.26 + i * 0.01, size: 1000 - i * 80 })),
};

function makeStore(orderBook: Record<string, OrderBookSnapshot> = {}) {
  return configureStore({
    reducer: {
      market: marketSlice.reducer,
      orders: ordersSlice.reducer,
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
    },
    preloadedState: {
      market: {
        assets: [],
        prices: {},
        priceHistory: {},
        sessionOpen: {},
        candleHistory: {},
        candlesReady: {},
        orderBook,
        connected: true,
        connectionFailures: 0,
        sessionPhase: "CONTINUOUS" as const,
      },
    },
  });
}

describe("MarketDepth – no data", () => {
  it("shows waiting message when no snapshot available", () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <MarketDepth symbol="AAPL" />
      </Provider>
    );
    expect(screen.getByText(/No depth data for AAPL/i)).toBeInTheDocument();
  });
});

describe("MarketDepth – with data", () => {
  it("shows mid price when snapshot is present", () => {
    const store = makeStore({ AAPL: mockSnapshot });
    render(
      <Provider store={store}>
        <MarketDepth symbol="AAPL" />
      </Provider>
    );
    // Mid price appears in the spread indicator (title attribute) and bid levels
    const midEl = screen.getByTitle("Mid price — midpoint between best bid and ask");
    expect(midEl).toHaveTextContent("180.25");
  });

  it("does not show waiting message when data is present", () => {
    const store = makeStore({ AAPL: mockSnapshot });
    render(
      <Provider store={store}>
        <MarketDepth symbol="AAPL" />
      </Provider>
    );
    expect(screen.queryByText(/No depth data/i)).not.toBeInTheDocument();
  });

  it("formats prices with 4 decimals for an FX symbol (contains '/')", () => {
    const fxSnapshot: OrderBookSnapshot = {
      ...mockSnapshot,
      mid: 1.0855,
      bids: [{ price: 1.0854, size: 1_000_000 }],
      asks: [{ price: 1.0856, size: 1_000_000 }],
    };
    const store = makeStore({ "EUR/USD": fxSnapshot });
    render(
      <Provider store={store}>
        <MarketDepth symbol="EUR/USD" />
      </Provider>
    );
    const midEl = screen.getByTitle("Mid price — midpoint between best bid and ask");
    expect(midEl).toHaveTextContent("1.0855");
  });

  it("shows an 'unavailable' spread and '—' text when bids or asks are empty", () => {
    const oneSided: OrderBookSnapshot = {
      mid: 180.25,
      ts: Date.now(),
      bids: [],
      asks: mockSnapshot.asks,
    };
    const store = makeStore({ AAPL: oneSided });
    render(
      <Provider store={store}>
        <MarketDepth symbol="AAPL" />
      </Provider>
    );
    const spreadEl = screen.getByTitle(
      "Bid-ask spread — difference between best ask and best bid prices"
    );
    expect(spreadEl).toHaveTextContent("—");
  });
});

describe("MarketDepthPanel", () => {
  afterEach(() => {
    vi.doUnmock("../../hooks/useChannelIn.ts");
    vi.resetModules();
  });

  it("prompts to select an asset when none is selected", async () => {
    vi.resetModules();
    vi.doMock("../../hooks/useChannelIn.ts", () => ({
      useChannelIn: () => ({ selectedAsset: null }),
    }));
    const { MarketDepthPanel: FreshPanel } = await import("@veta/frontend/components/MarketDepth");
    const store = makeStore();
    render(
      <Provider store={store}>
        <FreshPanel />
      </Provider>
    );
    expect(screen.getByText(/Select an asset in Market Ladder/i)).toBeInTheDocument();
  });

  it("renders MarketDepth for the currently selected asset", async () => {
    vi.resetModules();
    vi.doMock("../../hooks/useChannelIn.ts", () => ({
      useChannelIn: () => ({ selectedAsset: "AAPL" }),
    }));
    const { MarketDepthPanel: FreshPanel } = await import("@veta/frontend/components/MarketDepth");
    const store = makeStore({ AAPL: mockSnapshot });
    render(
      <Provider store={store}>
        <FreshPanel />
      </Provider>
    );
    expect(screen.getByTestId("market-depth-panel")).toBeInTheDocument();
  });
});
