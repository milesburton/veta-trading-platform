import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { channelsSlice } from "../../store/channelsSlice";
import { marketSlice } from "../../store/marketSlice";
import { themeSlice } from "../../store/themeSlice";
import { uiSlice } from "../../store/uiSlice";
import { PopOutHost } from "../PopOutHost";

vi.mock("../MarketLadder.tsx", () => ({
  MarketLadder: () => (
    <div data-testid="market-ladder-panel">Market Ladder Panel</div>
  ),
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
vi.mock("../CandlestickChart.tsx", () => ({ CandlestickChart: () => <div /> }));
vi.mock("../MarketDepth.tsx", () => ({
  MarketDepth: () => <div />,
  MarketDepthPanel: () => <div />,
}));

function renderHost(panelType: string) {
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
      <PopOutHost
        instanceId="panel-1"
        panelType={panelType}
        layoutKey="layout-test"
      />
    </Provider>,
  );
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
      }),
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
});
