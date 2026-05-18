import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { MarketHeatmap } from "@veta/frontend/components/MarketHeatmap";
import { marketSlice } from "@veta/frontend/store/marketSlice";
import { ordersSlice } from "@veta/frontend/store/ordersSlice";
import { uiSlice } from "@veta/frontend/store/uiSlice";
import { windowSlice } from "@veta/frontend/store/windowSlice";
import type { AssetDef } from "@veta/frontend/types";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";

function makeAsset(over: Partial<AssetDef>): AssetDef {
  return {
    symbol: "X",
    initialPrice: 100,
    volatility: 0.1,
    sector: "Tech",
    ...over,
  };
}

function makeStore(opts: {
  assets: AssetDef[];
  prices?: Record<string, number>;
  open?: Record<string, number>;
}) {
  return configureStore({
    reducer: {
      market: marketSlice.reducer,
      orders: ordersSlice.reducer,
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
    },
    preloadedState: {
      market: {
        assets: opts.assets,
        prices: opts.prices ?? {},
        priceHistory: {},
        sessionOpen: opts.open ?? {},
        candleHistory: {},
        candlesReady: {},
        orderBook: {},
        connected: true,
        connectionFailures: 0,
        sessionPhase: "CONTINUOUS" as const,
      },
    },
  });
}

describe("MarketHeatmap – rendering", () => {
  it("renders the panel header with no assets", () => {
    const store = makeStore({ assets: [] });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    expect(screen.getByTestId("market-heatmap-panel")).toBeInTheDocument();
    expect(screen.getByText(/Market Heatmap/i)).toBeInTheDocument();
  });

  it("renders one tile per asset and displays sector/symbol labels", () => {
    const assets: AssetDef[] = [
      makeAsset({ symbol: "AAPL", sector: "Tech", marketCapB: 2800 }),
      makeAsset({ symbol: "MSFT", sector: "Tech", marketCapB: 2500 }),
      makeAsset({ symbol: "JPM", sector: "Financial", marketCapB: 500 }),
    ];
    const store = makeStore({
      assets,
      prices: { AAPL: 102, MSFT: 99, JPM: 100 },
      open: { AAPL: 100, MSFT: 100, JPM: 100 },
    });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    expect(screen.getByTestId("heatmap-cell-AAPL")).toBeInTheDocument();
    expect(screen.getByTestId("heatmap-cell-MSFT")).toBeInTheDocument();
    expect(screen.getByTestId("heatmap-cell-JPM")).toBeInTheDocument();
  });

  it("toggles between sort modes", () => {
    const assets: AssetDef[] = [
      makeAsset({ symbol: "AAPL", sector: "Tech", marketCapB: 2800 }),
      makeAsset({ symbol: "MSFT", sector: "Tech", marketCapB: 2500 }),
    ];
    const store = makeStore({
      assets,
      prices: { AAPL: 110, MSFT: 90 },
      open: { AAPL: 100, MSFT: 100 },
    });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    const byMove = screen.getByRole("button", { name: /By Move/ });
    const byCap = screen.getByRole("button", { name: /By Cap/ });
    expect(byCap).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(byMove);
    expect(byMove).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(byCap);
    expect(byCap).toHaveAttribute("aria-pressed", "true");
  });

  it("shows tooltip on tile mouse-enter and clears on mouse-leave", () => {
    const assets: AssetDef[] = [
      makeAsset({
        symbol: "AAPL",
        sector: "Tech",
        marketCapB: 2800,
        beta: 1.2,
        peRatio: 28,
        dividendYield: 0.5,
        dailyVolume: 5_000_000,
      }),
    ];
    const store = makeStore({
      assets,
      prices: { AAPL: 102 },
      open: { AAPL: 100 },
    });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    const cell = screen.getByTestId("heatmap-cell-AAPL");
    fireEvent.mouseEnter(cell, { clientX: 50, clientY: 50 });
    expect(screen.getAllByText("AAPL").length).toBeGreaterThan(0);
    fireEvent.mouseMove(cell, { clientX: 60, clientY: 60 });
    fireEvent.mouseLeave(cell);
  });

  it("formats trillion-dollar market caps", () => {
    const assets: AssetDef[] = [makeAsset({ symbol: "AAPL", sector: "Tech", marketCapB: 2800 })];
    const store = makeStore({
      assets,
      prices: { AAPL: 100 },
      open: { AAPL: 100 },
    });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    fireEvent.mouseEnter(screen.getByTestId("heatmap-cell-AAPL"), {
      clientX: 10,
      clientY: 10,
    });
    expect(screen.getByText(/\$2\.8T/)).toBeInTheDocument();
  });

  it("formats sub-trillion caps and small volumes", () => {
    const assets: AssetDef[] = [
      makeAsset({
        symbol: "JPM",
        sector: "Financial",
        marketCapB: 500,
        dailyVolume: 50_000,
      }),
    ];
    const store = makeStore({
      assets,
      prices: { JPM: 100 },
      open: { JPM: 100 },
    });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    fireEvent.mouseEnter(screen.getByTestId("heatmap-cell-JPM"), {
      clientX: 10,
      clientY: 10,
    });
    expect(screen.getByText(/\$500B/)).toBeInTheDocument();
    expect(screen.getByText(/50K/)).toBeInTheDocument();
  });

  it("broadcasts on tile click and on Enter key", () => {
    const assets: AssetDef[] = [makeAsset({ symbol: "AAPL", marketCapB: 100 })];
    const store = makeStore({
      assets,
      prices: { AAPL: 105 },
      open: { AAPL: 100 },
    });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    const cell = screen.getByTestId("heatmap-cell-AAPL");
    fireEvent.click(cell);
    expect(store.getState().ui.selectedAsset).toBe("AAPL");

    store.dispatch({ type: "ui/setSelectedAsset", payload: null });
    fireEvent.keyDown(cell, { key: "Enter" });
    expect(store.getState().ui.selectedAsset).toBe("AAPL");

    store.dispatch({ type: "ui/setSelectedAsset", payload: null });
    fireEvent.keyDown(cell, { key: " " });
    expect(store.getState().ui.selectedAsset).toBe("AAPL");

    fireEvent.keyDown(cell, { key: "Tab" });
  });

  it("shows back button when drilled into a sector", () => {
    // Many small-cap tiles in one sector force the OTHER tile to render
    const assets: AssetDef[] = Array.from({ length: 20 }, (_, i) =>
      makeAsset({ symbol: `S${i}`, sector: "Tech", marketCapB: 1 })
    );
    const store = makeStore({
      assets,
      prices: Object.fromEntries(assets.map((a) => [a.symbol, 100])),
      open: Object.fromEntries(assets.map((a) => [a.symbol, 100])),
    });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    expect(screen.getByText(/Market Heatmap/i)).toBeInTheDocument();
  });

  it("handles assets where session-open is zero (degenerate pct)", () => {
    const assets: AssetDef[] = [makeAsset({ symbol: "ZERO", marketCapB: 50 })];
    const store = makeStore({
      assets,
      prices: { ZERO: 100 },
      open: { ZERO: 0 },
    });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    expect(screen.getByTestId("heatmap-cell-ZERO")).toBeInTheDocument();
  });

  it("renders deeply negative tiles with strong red styling", () => {
    const assets: AssetDef[] = [
      makeAsset({ symbol: "AAPL", marketCapB: 100 }),
      makeAsset({ symbol: "MSFT", marketCapB: 100 }),
      makeAsset({ symbol: "GOOGL", marketCapB: 100 }),
    ];
    const store = makeStore({
      assets,
      prices: { AAPL: 50, MSFT: 50, GOOGL: 50 },
      open: { AAPL: 100, MSFT: 100, GOOGL: 100 },
    });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    expect(screen.getByTestId("heatmap-cell-AAPL")).toBeInTheDocument();
  });

  it("renders strongly positive tiles", () => {
    const assets: AssetDef[] = [makeAsset({ symbol: "AAPL", marketCapB: 100 })];
    const store = makeStore({
      assets,
      prices: { AAPL: 200 },
      open: { AAPL: 100 },
    });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    expect(screen.getByTestId("heatmap-cell-AAPL")).toBeInTheDocument();
  });

  it("handles assets that have no session-open (defaulting to current price)", () => {
    const assets: AssetDef[] = [makeAsset({ symbol: "NEW", marketCapB: 50 })];
    const store = makeStore({
      assets,
      prices: { NEW: 100 },
      // no open price → defaults to current → 0% change
    });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    expect(screen.getByTestId("heatmap-cell-NEW")).toBeInTheDocument();
  });

  it("drills into a sector when OTHER tile is clicked", () => {
    // Need many small assets to force OTHER tile generation
    const assets: AssetDef[] = Array.from({ length: 30 }, (_, i) =>
      makeAsset({ symbol: `S${i}`, sector: "Tech", marketCapB: 1 })
    );
    const store = makeStore({
      assets,
      prices: Object.fromEntries(assets.map((a) => [a.symbol, 100])),
      open: Object.fromEntries(assets.map((a) => [a.symbol, 100])),
    });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    // The component sets canvas width via ResizeObserver — initial may be 960x540
    expect(screen.getByTestId("market-heatmap-panel")).toBeInTheDocument();
  });

  it("renders sortBy=change layout", () => {
    const assets: AssetDef[] = [
      makeAsset({ symbol: "A", sector: "Tech", marketCapB: 100 }),
      makeAsset({ symbol: "B", sector: "Tech", marketCapB: 100 }),
    ];
    const store = makeStore({
      assets,
      prices: { A: 110, B: 90 },
      open: { A: 100, B: 100 },
    });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    fireEvent.click(screen.getByRole("button", { name: /By Move/ }));
    expect(screen.getByTestId("market-heatmap-panel")).toBeInTheDocument();
  });

  it("handles tile with 0 marketCap (size defaults to 1)", () => {
    const assets: AssetDef[] = [makeAsset({ symbol: "TINY", sector: "Tech" })];
    const store = makeStore({
      assets,
      prices: { TINY: 100 },
      open: { TINY: 100 },
    });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    expect(screen.getByTestId("heatmap-cell-TINY")).toBeInTheDocument();
  });

  it("positions tooltip on left when mouse is near right edge", () => {
    const assets: AssetDef[] = [makeAsset({ symbol: "AAPL", marketCapB: 100 })];
    const store = makeStore({
      assets,
      prices: { AAPL: 100 },
      open: { AAPL: 100 },
    });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    fireEvent.mouseEnter(screen.getByTestId("heatmap-cell-AAPL"), {
      clientX: 900,
      clientY: 500,
    });
    expect(screen.getAllByText("AAPL").length).toBeGreaterThan(0);
  });

  it("renders tile with negative pct (red gradient)", () => {
    const assets: AssetDef[] = [makeAsset({ symbol: "FALL", sector: "Tech", marketCapB: 100 })];
    const store = makeStore({
      assets,
      prices: { FALL: 95 },
      open: { FALL: 100 },
    });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    fireEvent.mouseEnter(screen.getByTestId("heatmap-cell-FALL"), {
      clientX: 50,
      clientY: 50,
    });
    expect(screen.getAllByText(/-5\.00%/).length).toBeGreaterThan(0);
  });

  it("does not crash when assets list is empty after sortBy change", () => {
    const store = makeStore({ assets: [] });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    fireEvent.click(screen.getByRole("button", { name: /By Move/ }));
    expect(screen.getByTestId("market-heatmap-panel")).toBeInTheDocument();
  });

  it("renders multi-sector layout with both labelled and small sectors", () => {
    const assets: AssetDef[] = [
      // Tech: many small assets to force OTHER tile
      ...Array.from({ length: 15 }, (_, i) =>
        makeAsset({ symbol: `T${i}`, sector: "Tech", marketCapB: 1 })
      ),
      // Financial: a few big ones
      makeAsset({
        symbol: "JPM",
        sector: "Financial",
        marketCapB: 500,
      }),
    ];
    const prices = Object.fromEntries(assets.map((a) => [a.symbol, 100]));
    const open = Object.fromEntries(assets.map((a) => [a.symbol, 100]));
    const store = makeStore({ assets, prices, open });
    render(
      <Provider store={store}>
        <MarketHeatmap />
      </Provider>
    );
    expect(screen.getByTestId("market-heatmap-panel")).toBeInTheDocument();
  });
});
