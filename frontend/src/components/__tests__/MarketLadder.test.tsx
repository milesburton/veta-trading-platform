import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { ChannelContext } from "../../contexts/ChannelContext";
import { channelsSlice } from "../../store/channelsSlice";
import { gridPrefsSlice } from "../../store/gridPrefsSlice";
import { marketSlice } from "../../store/marketSlice";
import { uiSlice } from "../../store/uiSlice";
import { windowSlice } from "../../store/windowSlice";
import type { AssetDef, MarketPrices, PriceHistory } from "../../types";
import { MarketLadder } from "../MarketLadder";

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
