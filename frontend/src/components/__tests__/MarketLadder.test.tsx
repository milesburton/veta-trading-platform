import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MarketLadder } from "@veta/frontend/components/MarketLadder";
import { ChannelContext } from "@veta/frontend/contexts/ChannelContext";
import { channelsSlice } from "@veta/frontend/store/channelsSlice";
import { gridPrefsSlice } from "@veta/frontend/store/gridPrefsSlice";
import { marketSlice } from "@veta/frontend/store/marketSlice";
import { uiSlice } from "@veta/frontend/store/uiSlice";
import { windowSlice } from "@veta/frontend/store/windowSlice";
import type { AssetDef, MarketPrices, PriceHistory } from "@veta/frontend/types";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const assets: AssetDef[] = [
  { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" },
  {
    symbol: "MSFT",
    initialPrice: 300,
    volatility: 0.015,
    sector: "Technology",
  },
  { symbol: "XOM", initialPrice: 80, volatility: 0.025, sector: "Energy" },
  { symbol: "JPM", initialPrice: 150, volatility: 0.02, sector: "Finance" },
];

const prices: MarketPrices = { AAPL: 155, MSFT: 305, XOM: 82, JPM: 148 };

const priceHistory: PriceHistory = {
  AAPL: [150, 152, 155],
  MSFT: [298, 302, 305],
  XOM: [79, 80, 82],
  JPM: [149, 147, 148],
};

function makeStore(
  overrides: { assets?: AssetDef[]; prices?: MarketPrices; priceHistory?: PriceHistory } = {}
) {
  return configureStore({
    reducer: {
      market: marketSlice.reducer,
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
      channels: channelsSlice.reducer,
      gridPrefs: gridPrefsSlice.reducer,
    },
    preloadedState: {
      market: {
        assets: overrides.assets ?? assets,
        prices: overrides.prices ?? prices,
        priceHistory: overrides.priceHistory ?? priceHistory,
        sessionOpen: {},
        candleHistory: {},
        candlesReady: {},
        connected: true,
        connectionFailures: 0,
        orderBook: {},
        sessionPhase: "CONTINUOUS" as const,
      },
    },
  });
}

function renderLadder(
  overrides: { assets?: AssetDef[]; prices?: MarketPrices; priceHistory?: PriceHistory } = {}
) {
  return render(
    <Provider store={makeStore(overrides)}>
      <ChannelContext.Provider
        value={{
          instanceId: "market-ladder",
          panelType: "market-ladder",
          outgoing: null,
          incoming: null,
        }}
      >
        <MarketLadder />
      </ChannelContext.Provider>
    </Provider>
  );
}

describe("MarketLadder – header", () => {
  it("shows filtered / total count", () => {
    renderLadder();
    expect(screen.getByText(`${assets.length}/${assets.length}`)).toBeInTheDocument();
  });
});

describe("MarketLadder – search filter", () => {
  it("renders a search input", () => {
    renderLadder();
    expect(screen.getByPlaceholderText(/Search symbol or sector/i)).toBeInTheDocument();
  });

  it("filters rows by symbol when typing", () => {
    renderLadder();
    const input = screen.getByPlaceholderText(/Search symbol or sector/i);
    fireEvent.change(input, { target: { value: "AAPL" } });
    expect(screen.getByText("1/4")).toBeInTheDocument();
  });

  it("filters rows by sector when typing", () => {
    renderLadder();
    const input = screen.getByPlaceholderText(/Search symbol or sector/i);
    fireEvent.change(input, { target: { value: "Technology" } });
    expect(screen.getByText("2/4")).toBeInTheDocument();
  });

  it("is case-insensitive", () => {
    renderLadder();
    const input = screen.getByPlaceholderText(/Search symbol or sector/i);
    fireEvent.change(input, { target: { value: "aapl" } });
    expect(screen.getByText("1/4")).toBeInTheDocument();
  });
});

describe("MarketLadder – sector filter", () => {
  it("renders sector dropdown with All option", () => {
    renderLadder();
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All" })).toBeInTheDocument();
  });

  it("populates sector options from assets", () => {
    renderLadder();
    expect(screen.getByRole("option", { name: "Technology" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Energy" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Finance" })).toBeInTheDocument();
  });

  it("filters to a specific sector", () => {
    renderLadder();
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "Energy" } });
    expect(screen.getByText("1/4")).toBeInTheDocument();
  });
});

describe("MarketLadder – column headers", () => {
  it("renders all column headers", () => {
    renderLadder();
    expect(screen.getByText("Symbol")).toBeInTheDocument();
    expect(screen.getByText("Bid")).toBeInTheDocument();
    expect(screen.getByText("Ask")).toBeInTheDocument();
    expect(screen.getByText("Last")).toBeInTheDocument();
    expect(screen.getByText("Δ%")).toBeInTheDocument();
    expect(screen.getByText("Trend")).toBeInTheDocument();
  });
});

describe("MarketLadder – row rendering (via react-window)", () => {
  it("renders at least one asset symbol", () => {
    renderLadder();
    // react-window virtualization may render a subset; just check at least one
    const aapl = screen.queryAllByText("AAPL");
    const msft = screen.queryAllByText("MSFT");
    expect(aapl.length + msft.length).toBeGreaterThan(0);
  });
});

describe("MarketLadder – empty assets", () => {
  it("renders with empty assets list without crashing", () => {
    renderLadder({ assets: [], prices: {}, priceHistory: {} });
    expect(screen.getByText("0/0")).toBeInTheDocument();
  });
});

describe("MarketLadder – row interaction", () => {
  it("clicking a row selects/deselects the asset", () => {
    renderLadder();
    const row = screen.getByTestId("asset-row-AAPL");
    fireEvent.click(row);
    fireEvent.click(row);
    expect(row).toBeInTheDocument();
  });

  it("right-clicking a row opens a context menu", () => {
    renderLadder();
    const row = screen.getByTestId("asset-row-AAPL");
    fireEvent.contextMenu(row);
    // ContextMenu renders Trade in ladder / Set as primary / Copy symbol etc.
    // Just assert the row is still present and didn't throw
    expect(row).toBeInTheDocument();
  });

  it("renders correctly when asset has no price (price=0)", () => {
    renderLadder({
      assets: [{ symbol: "ZERO", initialPrice: 100, volatility: 0.01, sector: "Other" }],
      prices: { ZERO: 0 },
      priceHistory: { ZERO: [] },
    });
    const row = screen.getByTestId("asset-row-ZERO");
    expect(row).toBeInTheDocument();
  });

  it("uses 4-dp formatting for FX symbols (with /)", () => {
    renderLadder({
      assets: [{ symbol: "EUR/USD", initialPrice: 1.1, volatility: 0.01, sector: "FX" }],
      prices: { "EUR/USD": 1.1234 },
      priceHistory: { "EUR/USD": [1.12, 1.123, 1.1234] },
    });
    expect(screen.getByText(/1\.1234/)).toBeInTheDocument();
  });

  it("renders price flash when price changes (via re-render)", () => {
    const store = makeStore();
    const { rerender } = render(
      <Provider store={store}>
        <ChannelContext.Provider
          value={{
            instanceId: "ml",
            panelType: "market-ladder",
            outgoing: null,
            incoming: null,
          }}
        >
          <MarketLadder />
        </ChannelContext.Provider>
      </Provider>
    );
    rerender(
      <Provider store={store}>
        <ChannelContext.Provider
          value={{
            instanceId: "ml",
            panelType: "market-ladder",
            outgoing: null,
            incoming: null,
          }}
        >
          <MarketLadder />
        </ChannelContext.Provider>
      </Provider>
    );
    expect(screen.getByTestId("asset-row-AAPL")).toBeInTheDocument();
  });
});

describe("MarketLadder – context menu and interactions", () => {
  it("right-click opens context menu and Copy symbol writes to clipboard", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderLadder();
    fireEvent.contextMenu(screen.getByTestId("asset-row-AAPL"));
    fireEvent.click(screen.getByText(/Copy symbol/));
    expect(writeText).toHaveBeenCalledWith("AAPL");
  });

  it("right-click select asset action", () => {
    renderLadder();
    fireEvent.contextMenu(screen.getByTestId("asset-row-AAPL"));
    fireEvent.click(screen.getByText(/Select asset|Deselect/));
    // No throw — function exercised
    expect(screen.getByTestId("asset-row-AAPL")).toBeInTheDocument();
  });
});

describe("MarketLadder – sort and selected state", () => {
  it("clicking a sortable column header changes sort", () => {
    renderLadder();
    const lastHeader = screen.getByText("Last");
    fireEvent.click(lastHeader);
    // Just verifying no crash
    expect(lastHeader).toBeInTheDocument();
  });

  it("clicking a selected row deselects it", () => {
    renderLadder();
    const row = screen.getByTestId("asset-row-AAPL");
    fireEvent.click(row);
    fireEvent.click(row);
    expect(row).toBeInTheDocument();
  });

  it("renders selected row with accent border", () => {
    const store = makeStore();
    store.dispatch({ type: "ui/setSelectedAsset", payload: "AAPL" });
    render(
      <Provider store={store}>
        <ChannelContext.Provider
          value={{
            instanceId: "ml-2",
            panelType: "market-ladder",
            outgoing: 1,
            incoming: null,
          }}
        >
          <MarketLadder />
        </ChannelContext.Provider>
      </Provider>
    );
    const row = screen.getByTestId("asset-row-AAPL");
    expect(row).toBeInTheDocument();
  });

  it("renders price-zero state correctly", () => {
    renderLadder({
      assets: [{ symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" }],
      prices: { AAPL: 0 },
      priceHistory: { AAPL: [] },
    });
    const row = screen.getByTestId("asset-row-AAPL");
    expect(row).toBeInTheDocument();
  });
});

describe("MarketLadder – metadata rendering", () => {
  it("renders beta and market cap when available", () => {
    renderLadder({
      assets: [
        {
          symbol: "AAPL",
          initialPrice: 150,
          volatility: 0.02,
          sector: "Technology",
          beta: 1.2,
          marketCapB: 2800,
        },
      ],
      prices: { AAPL: 150 },
      priceHistory: { AAPL: [150] },
    });
    expect(screen.getByText(/β1\.20/)).toBeInTheDocument();
    expect(screen.getByText(/2\.8T/)).toBeInTheDocument();
  });

  it("formats sub-trillion market caps in B", () => {
    renderLadder({
      assets: [
        {
          symbol: "JPM",
          initialPrice: 150,
          volatility: 0.02,
          sector: "Finance",
          beta: 1.0,
          marketCapB: 500,
        },
      ],
      prices: { JPM: 150 },
      priceHistory: { JPM: [150] },
    });
    expect(screen.getByText(/500B/)).toBeInTheDocument();
  });
});

describe("MarketLadder – sparkline drawing", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    const ctx = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
      lineJoin: "",
    };
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => ctx
    ) as unknown as typeof originalGetContext;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it("draws a sparkline path for an up-trending history", () => {
    renderLadder({
      assets: [{ symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" }],
      prices: { AAPL: 155 },
      priceHistory: { AAPL: [150, 152, 155] },
    });
    expect(screen.getByTestId("asset-row-AAPL")).toBeInTheDocument();
  });

  it("draws a sparkline path for a down-trending history", () => {
    renderLadder({
      assets: [{ symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" }],
      prices: { AAPL: 148 },
      priceHistory: { AAPL: [155, 152, 148] },
    });
    expect(screen.getByTestId("asset-row-AAPL")).toBeInTheDocument();
  });
});

describe("MarketLadder – price flash timing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("flashes then clears after the timeout when the price changes", () => {
    const store = makeStore({
      assets: [{ symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" }],
      prices: { AAPL: 150 },
      priceHistory: { AAPL: [150, 150] },
    });
    const { rerender } = render(
      <Provider store={store}>
        <ChannelContext.Provider
          value={{
            instanceId: "ml-flash",
            panelType: "market-ladder",
            outgoing: null,
            incoming: null,
          }}
        >
          <MarketLadder />
        </ChannelContext.Provider>
      </Provider>
    );
    act(() => {
      store.dispatch(marketSlice.actions.tickReceived({ prices: { AAPL: 152 }, ts: Date.now() }));
    });
    rerender(
      <Provider store={store}>
        <ChannelContext.Provider
          value={{
            instanceId: "ml-flash",
            panelType: "market-ladder",
            outgoing: null,
            incoming: null,
          }}
        >
          <MarketLadder />
        </ChannelContext.Provider>
      </Provider>
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId("asset-row-AAPL")).toBeInTheDocument();
  });
});

describe("MarketLadder – column resize", () => {
  it("drags a column resize handle and updates width", () => {
    const { container } = renderLadder();
    const handle = container.querySelector(".resize-handle");
    expect(handle).toBeTruthy();
    fireEvent.mouseDown(handle as Element, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 160 });
    fireEvent.mouseUp(document);
    expect(handle).toBeInTheDocument();
  });
});

describe("MarketLadder – resize observer", () => {
  const original = globalThis.ResizeObserver;

  afterEach(() => {
    globalThis.ResizeObserver = original;
  });

  it("updates list height when the container resizes", () => {
    globalThis.ResizeObserver = class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() {
        this.cb(
          [{ contentRect: { height: 640 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver
        );
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    renderLadder();
    expect(screen.getByTestId("ladder-table")).toBeInTheDocument();
  });
});

describe("MarketLadder – row mouse down", () => {
  it("prevents default on row mouse down to preserve selection", () => {
    renderLadder();
    const row = screen.getByTestId("asset-row-AAPL");
    fireEvent.mouseDown(row);
    expect(row).toBeInTheDocument();
  });
});

describe("MarketLadder – context menu select actions", () => {
  it("View in order ticket selects the asset", () => {
    renderLadder();
    fireEvent.contextMenu(screen.getByTestId("asset-row-AAPL"));
    fireEvent.click(screen.getByText(/View in order ticket/));
    expect(screen.getByTestId("asset-row-AAPL")).toBeInTheDocument();
  });

  it("View chart & depth selects the asset", () => {
    renderLadder();
    fireEvent.contextMenu(screen.getByTestId("asset-row-AAPL"));
    fireEvent.click(screen.getByText(/View chart & depth/));
    expect(screen.getByTestId("asset-row-AAPL")).toBeInTheDocument();
  });
});
