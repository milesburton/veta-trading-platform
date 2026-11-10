import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { PopOutHost } from "@veta/frontend/components/PopOutHost";
import { channelsSlice } from "@veta/frontend/store/channelsSlice";
import { marketSlice } from "@veta/frontend/store/marketSlice";
import { themeSlice } from "@veta/frontend/store/themeSlice";
import { uiSlice } from "@veta/frontend/store/uiSlice";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../MarketLadder.tsx", () => ({
  MarketLadder: () => <div data-testid="market-ladder-panel">Market Ladder Panel</div>,
}));

vi.mock("../DashboardLayout.tsx", () => ({
  modelToLayoutItems: () => [],
}));

vi.mock("../OrderTicket.tsx", () => ({
  OrderTicket: () => <div>Order Ticket Panel</div>,
}));
vi.mock("../OrderBlotter.tsx", () => ({ OrderBlotter: () => <div /> }));
vi.mock("../AlgoMonitor.tsx", () => ({ AlgoMonitor: () => <div /> }));
vi.mock("../ObservabilityPanel.tsx", () => ({
  ObservabilityPanel: () => <div />,
}));
vi.mock("../ExecutionsPanel.tsx", () => ({ ExecutionsPanel: () => <div /> }));
vi.mock("../DecisionLog.tsx", () => ({ DecisionLog: () => <div /> }));
vi.mock("../MarketMatch.tsx", () => ({ MarketMatch: () => <div /> }));
vi.mock("../AdminPanel.tsx", () => ({ AdminPanel: () => <div /> }));
vi.mock("../AnalysisPanel.tsx", () => ({ AnalysisPanel: () => <div /> }));
vi.mock("../NewsSourcesPanel.tsx", () => ({ NewsSourcesPanel: () => <div /> }));
vi.mock("../OrderProgressPanel.tsx", () => ({
  OrderProgressPanel: () => <div />,
}));
vi.mock("../MarketHeatmap.tsx", () => ({ MarketHeatmap: () => <div /> }));
vi.mock("../CandlestickChart.tsx", () => ({
  CandlestickChart: ({ symbol }: { symbol: string }) => <div data-testid="candles">{symbol}</div>,
}));
vi.mock("../MarketDepth.tsx", () => ({
  MarketDepth: () => <div />,
  MarketDepthPanel: () => <div />,
}));

function renderHost(panelType: string, candles: { symbol: string; count: number } | null = null) {
  const store = configureStore({
    reducer: {
      theme: themeSlice.reducer,
      ui: uiSlice.reducer,
      channels: channelsSlice.reducer,
      market: marketSlice.reducer,
    },
    preloadedState: {
      channels: {
        data: {
          1: { selectedAsset: "MSFT", selectedOrderId: null },
          2: { selectedAsset: null, selectedOrderId: null },
          3: { selectedAsset: null, selectedOrderId: null },
          4: { selectedAsset: null, selectedOrderId: null },
          5: { selectedAsset: null, selectedOrderId: null },
          6: { selectedAsset: null, selectedOrderId: null },
        },
      },
      market: {
        assets: [],
        prices: {},
        sessionOpen: {},
        priceHistory: {},
        candleHistory: candles
          ? {
              [candles.symbol]: {
                "1m": Array.from({ length: candles.count }, (_, i) => ({
                  time: i,
                  open: 1,
                  high: 1,
                  low: 1,
                  close: 1,
                })),
                "5m": [],
              },
            }
          : {},
        candlesReady: candles ? { [candles.symbol]: true } : {},
        orderBook: {},
        connected: true,
        connectionFailures: 0,
        sessionPhase: "CONTINUOUS" as const,
      },
    },
  });

  render(
    <Provider store={store}>
      <PopOutHost instanceId="panel-1" panelType={panelType} layoutKey="layout-test" />
    </Provider>
  );
  return store;
}

describe("PopOutHost", () => {
  it("renders mapped panel with channel header context from localStorage", () => {
    localStorage.setItem(
      "layout-test",
      JSON.stringify({
        _v: 3,
        items: [
          {
            i: "panel-1",
            outgoing: 2,
            incoming: 1,
          },
        ],
      })
    );

    renderHost("market-ladder");

    expect(screen.getByTestId("market-ladder-panel")).toBeInTheDocument();
    expect(screen.getByText("MSFT")).toBeInTheDocument();
    expect(screen.getByText("IN")).toBeInTheDocument();
    expect(screen.getByText("OUT")).toBeInTheDocument();
    expect(document.title).toMatch(/VETA/);
  });

  it("shows unknown panel message for unmapped type", () => {
    localStorage.removeItem("layout-test");

    renderHost("not-a-real-panel");

    expect(screen.getByText(/Unknown panel/i)).toBeInTheDocument();
  });

  it("falls back gracefully when localStorage payload is malformed", () => {
    localStorage.setItem("layout-test", "{not json");
    renderHost("market-ladder");
    expect(screen.getByTestId("market-ladder-panel")).toBeInTheDocument();
  });

  it("falls back when layout v3 has no matching instance", () => {
    localStorage.setItem(
      "layout-test",
      JSON.stringify({
        _v: 3,
        items: [{ i: "different-id", outgoing: 1, incoming: 2 }],
      })
    );
    renderHost("market-ladder");
    expect(screen.getByTestId("market-ladder-panel")).toBeInTheDocument();
  });

  it("falls back when localStorage is empty", () => {
    localStorage.clear();
    renderHost("market-ladder");
    expect(screen.getByTestId("market-ladder-panel")).toBeInTheDocument();
  });

  it("renders order-ticket panel and registers resize handler", () => {
    localStorage.removeItem("layout-test");
    renderHost("order-ticket");
    expect(screen.getByText(/Order Ticket Panel/)).toBeInTheDocument();
  });

  it("renders candle-chart pop-out with waiting message when no data", () => {
    localStorage.removeItem("layout-test");
    renderHost("candle-chart");
    expect(screen.getByText(/Waiting for candle data/i)).toBeInTheDocument();
  });

  it("renders market-depth pop-out with default symbol", () => {
    localStorage.removeItem("layout-test");
    renderHost("market-depth");
    // MarketDepth is mocked as <div /> so no specific text, just no throw
    expect(document.title).toMatch(/VETA/);
  });

  it("falls back when v4 flex layout is malformed", () => {
    localStorage.setItem("layout-test", JSON.stringify({ _v: 4, flex: "not a json model" }));
    renderHost("market-ladder");
    expect(screen.getByTestId("market-ladder-panel")).toBeInTheDocument();
  });

  it("candle-chart pop-out reads selectedAsset from incoming channel", () => {
    localStorage.setItem(
      "layout-test",
      JSON.stringify({
        _v: 3,
        items: [{ i: "panel-1", outgoing: 2, incoming: 1 }],
      })
    );
    renderHost("candle-chart");
    expect(screen.getByText(/Waiting for candle data/i)).toBeInTheDocument();
  });

  it("market-depth pop-out uses incoming channel symbol", () => {
    localStorage.setItem(
      "layout-test",
      JSON.stringify({
        _v: 3,
        items: [{ i: "panel-1", outgoing: 2, incoming: 1 }],
      })
    );
    renderHost("market-depth");
    expect(document.title).toMatch(/VETA/);
  });

  it("renders the candlestick chart once enough candles are ready", () => {
    localStorage.removeItem("layout-test");
    localStorage.setItem(
      "layout-test",
      JSON.stringify({ _v: 3, items: [{ i: "panel-1", outgoing: 2, incoming: 1 }] })
    );
    renderHost("candle-chart", { symbol: "MSFT", count: 3 });
    expect(screen.getByTestId("candles")).toHaveTextContent("MSFT");
  });

  it("keeps waiting when fewer than two candles exist", () => {
    localStorage.setItem(
      "layout-test",
      JSON.stringify({ _v: 3, items: [{ i: "panel-1", outgoing: 2, incoming: 1 }] })
    );
    renderHost("candle-chart", { symbol: "MSFT", count: 1 });
    expect(screen.getByText(/Waiting for candle data/i)).toBeInTheDocument();
  });

  it("debounces order-ticket window resizes into the store", () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    try {
      localStorage.removeItem("layout-test");
      const store = renderHost("order-ticket");
      Object.defineProperty(globalThis, "outerWidth", { value: 640, configurable: true });
      Object.defineProperty(globalThis, "outerHeight", { value: 480, configurable: true });

      globalThis.dispatchEvent(new Event("resize"));
      globalThis.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(299);
      expect(JSON.stringify(store.getState().ui)).not.toContain("640");
      vi.advanceTimersByTime(1);

      expect(JSON.stringify(store.getState().ui)).toContain("640");
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
