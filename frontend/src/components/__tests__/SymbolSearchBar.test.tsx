import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { ChannelContext } from "../../contexts/ChannelContext";
import { channelsSlice } from "../../store/channelsSlice";
import { marketSlice } from "../../store/marketSlice";
import { uiSlice } from "../../store/uiSlice";
import type { AssetDef } from "../../types";
import { SymbolSearchBar } from "../SymbolSearchBar";

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
        orderBook: {},
        sessionPhase: "CONTINUOUS" as const,
      },
    },
  });
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
    </Provider>,
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
});
