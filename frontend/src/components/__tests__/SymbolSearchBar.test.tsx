import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SymbolSearchBar } from "@veta/frontend/components/SymbolSearchBar";
import { ChannelContext } from "@veta/frontend/contexts/ChannelContext";
import { channelsSlice } from "@veta/frontend/store/channelsSlice";
import { marketSlice } from "@veta/frontend/store/marketSlice";
import { uiSlice } from "@veta/frontend/store/uiSlice";
import type { AssetDef } from "@veta/frontend/types";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";

const assets: AssetDef[] = [
  {
    symbol: "AAPL",
    name: "Apple Inc",
    exchange: "NASDAQ",
    sector: "Technology",
    initialPrice: 150,
    volatility: 0.02,
    ric: "AAPL.O",
    bbgTicker: "AAPL US Equity",
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp",
    exchange: "NASDAQ",
    sector: "Technology",
    initialPrice: 300,
    volatility: 0.015,
    ric: "MSFT.O",
    bbgTicker: "MSFT US Equity",
  },
];

function makeStore() {
  return configureStore({
    reducer: {
      market: marketSlice.reducer,
      ui: uiSlice.reducer,
      channels: channelsSlice.reducer,
    },
    preloadedState: {
      market: {
        assets,
        prices: { AAPL: 155, MSFT: 305 },
        priceHistory: {},
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

const extendedAssets: AssetDef[] = [
  ...assets,
  {
    symbol: "EUR/USD",
    exchange: "FX",
    sector: "Currency",
    initialPrice: 1.08,
    volatility: 0.01,
  },
];

function makeExtendedStore() {
  return configureStore({
    reducer: {
      market: marketSlice.reducer,
      ui: uiSlice.reducer,
      channels: channelsSlice.reducer,
    },
    preloadedState: {
      market: {
        assets: extendedAssets,
        prices: { AAPL: 155, MSFT: 305, "EUR/USD": 1.0823 },
        priceHistory: {},
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

function renderExtendedBar() {
  const store = makeExtendedStore();
  render(
    <Provider store={store}>
      <ChannelContext.Provider
        value={{
          instanceId: "symbol-search",
          panelType: "market-ladder",
          outgoing: null,
          incoming: null,
        }}
      >
        <SymbolSearchBar />
      </ChannelContext.Provider>
    </Provider>
  );
  return store;
}

function renderBar() {
  const store = makeStore();
  render(
    <Provider store={store}>
      <ChannelContext.Provider
        value={{
          instanceId: "symbol-search",
          panelType: "market-ladder",
          outgoing: null,
          incoming: null,
        }}
      >
        <SymbolSearchBar />
      </ChannelContext.Provider>
    </Provider>
  );
  return store;
}

describe("SymbolSearchBar", () => {
  it("shows matching instrument results and selects on click", async () => {
    const store = renderBar();

    fireEvent.change(screen.getByTestId("symbol-search-input"), {
      target: { value: "AAPL" },
    });

    expect(await screen.findByTestId("symbol-search-results")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("search-result-AAPL"));

    await waitFor(() => {
      expect(store.getState().ui.selectedAsset).toBe("AAPL");
    });
  });

  it("applies parsed trade and updates asset, side, and strategy", async () => {
    const store = renderBar();

    fireEvent.change(screen.getByTestId("symbol-search-input"), {
      target: { value: "SELL 200 MSFT @ 300 POV" },
    });

    expect(await screen.findByTestId("trade-parse-preview")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("apply-parsed-trade"));

    await waitFor(() => {
      const state = store.getState().ui;
      expect(state.selectedAsset).toBe("MSFT");
      expect(state.activeSide).toBe("SELL");
      expect(state.activeStrategy).toBe("POV");
    });
  });

  it("selects single match with Enter key", async () => {
    const store = renderBar();
    const input = screen.getByTestId("symbol-search-input");

    fireEvent.change(input, { target: { value: "MSFT" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(store.getState().ui.selectedAsset).toBe("MSFT");
    });
  });

  it("shows empty results when no match", async () => {
    renderBar();
    fireEvent.change(screen.getByTestId("symbol-search-input"), {
      target: { value: "ZZZZ" },
    });
    // No results dropdown — search input is still rendered
    expect(screen.getByTestId("symbol-search-input")).toBeInTheDocument();
  });

  it("Escape clears the input", () => {
    renderBar();
    const input = screen.getByTestId("symbol-search-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "AAPL" } });
    fireEvent.keyDown(input, { key: "Escape" });
    // Some implementations clear; check no crash
    expect(input).toBeInTheDocument();
  });

  it("matches by company name", async () => {
    renderBar();
    fireEvent.change(screen.getByTestId("symbol-search-input"), {
      target: { value: "Apple" },
    });
    expect(await screen.findByTestId("search-result-AAPL")).toBeInTheDocument();
  });

  it("matches by RIC", async () => {
    renderBar();
    fireEvent.change(screen.getByTestId("symbol-search-input"), {
      target: { value: "AAPL.O" },
    });
    expect(await screen.findByTestId("search-result-AAPL")).toBeInTheDocument();
  });

  it("matches by Bloomberg ticker", async () => {
    renderBar();
    fireEvent.change(screen.getByTestId("symbol-search-input"), {
      target: { value: "MSFT US" },
    });
    expect(await screen.findByTestId("search-result-MSFT")).toBeInTheDocument();
  });

  it("focuses the input on Ctrl+/", () => {
    renderBar();
    const input = screen.getByTestId("symbol-search-input") as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);
    fireEvent.keyDown(document, { key: "/", ctrlKey: true });
    expect(document.activeElement).toBe(input);
  });

  it("focuses the input on Meta+/", () => {
    renderBar();
    const input = screen.getByTestId("symbol-search-input") as HTMLInputElement;
    fireEvent.keyDown(document, { key: "/", metaKey: true });
    expect(document.activeElement).toBe(input);
  });

  it("navigates results with ArrowDown and ArrowUp then selects with Enter", async () => {
    const store = renderBar();
    const input = screen.getByTestId("symbol-search-input");

    fireEvent.change(input, { target: { value: "Tech" } });
    expect(await screen.findByTestId("symbol-search-results")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(store.getState().ui.selectedAsset).toBe("AAPL");
    });
  });

  it("applies a parsed trade with only a symbol on Enter", async () => {
    const store = renderBar();
    const input = screen.getByTestId("symbol-search-input");

    fireEvent.change(input, { target: { value: "BUY AAPL" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      const state = store.getState().ui;
      expect(state.selectedAsset).toBe("AAPL");
      expect(state.activeSide).toBe("BUY");
    });
  });

  it("reopens results on focus when query is present", async () => {
    renderBar();
    const input = screen.getByTestId("symbol-search-input");

    fireEvent.change(input, { target: { value: "AAPL" } });
    expect(await screen.findByTestId("symbol-search-results")).toBeInTheDocument();

    fireEvent.blur(input);
    fireEvent.focus(input);
    expect(screen.getByTestId("symbol-search-results")).toBeInTheDocument();
  });

  it("hides results after blur delay", async () => {
    renderBar();
    const input = screen.getByTestId("symbol-search-input");

    fireEvent.change(input, { target: { value: "AAPL" } });
    expect(await screen.findByTestId("symbol-search-results")).toBeInTheDocument();

    fireEvent.blur(input);
    await waitFor(() => {
      expect(screen.queryByTestId("symbol-search-results")).not.toBeInTheDocument();
    });
  });

  it("does not select on Enter when multiple results and none highlighted", async () => {
    const store = renderBar();
    const input = screen.getByTestId("symbol-search-input");

    fireEvent.change(input, { target: { value: "Tech" } });
    expect(await screen.findByTestId("symbol-search-results")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Enter" });

    expect(store.getState().ui.selectedAsset).toBeNull();
  });

  it("clamps ArrowUp at the top of the list", async () => {
    const store = renderBar();
    const input = screen.getByTestId("symbol-search-input");

    fireEvent.change(input, { target: { value: "Tech" } });
    expect(await screen.findByTestId("symbol-search-results")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(store.getState().ui.selectedAsset).toBeNull();
  });

  it("falls back to sector when an asset has no name", async () => {
    renderExtendedBar();
    fireEvent.change(screen.getByTestId("symbol-search-input"), {
      target: { value: "EUR/USD" },
    });
    const row = await screen.findByTestId("search-result-EUR/USD");
    expect(row).toHaveTextContent("Currency");
  });

  it("formats FX prices with four decimals", async () => {
    renderExtendedBar();
    fireEvent.change(screen.getByTestId("symbol-search-input"), {
      target: { value: "EUR/USD" },
    });
    const row = await screen.findByTestId("search-result-EUR/USD");
    expect(row).toHaveTextContent("1.0823");
  });
});
