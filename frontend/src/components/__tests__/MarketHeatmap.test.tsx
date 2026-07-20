import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  capItemsPerSector,
  collapseSmallTiles,
  MarketHeatmap,
  pctToColor,
  squarify,
  tileTextColor,
} from "@veta/frontend/components/MarketHeatmap";
import { marketSlice } from "@veta/frontend/store/marketSlice";
import { ordersSlice } from "@veta/frontend/store/ordersSlice";
import { uiSlice } from "@veta/frontend/store/uiSlice";
import { windowSlice } from "@veta/frontend/store/windowSlice";
import { COLOR } from "@veta/frontend/tokens";
import type { AssetDef } from "@veta/frontend/types";
import { act } from "react";
import { Provider as ReduxProvider } from "react-redux";
import { afterEach, describe, expect, it } from "vitest";

describe("MarketHeatmap helpers", () => {
  it("maps percentage bands to heat colors", () => {
    expect(pctToColor(4)).toBe(COLOR.HEAT_STRONG_UP);
    expect(pctToColor(2)).toBe(COLOR.HEAT_MID_UP);
    expect(pctToColor(1)).toBe(COLOR.HEAT_UP);
    expect(pctToColor(0.3)).toBe(COLOR.HEAT_LIGHT_UP);
    expect(pctToColor(0.1)).toBe(COLOR.HEAT_FAINT_UP);
    expect(pctToColor(0)).toBe(COLOR.HEAT_NEUTRAL);
    expect(pctToColor(-0.1)).toBe(COLOR.HEAT_FAINT_DOWN);
    expect(pctToColor(-0.5)).toBe(COLOR.HEAT_DOWN);
    expect(pctToColor(-1.5)).toBe(COLOR.HEAT_MID_DOWN);
    expect(pctToColor(-3)).toBe(COLOR.HEAT_STRONG_DOWN);
    expect(pctToColor(-4)).toBe(COLOR.HEAT_DEEP_DOWN);
  });

  it("uses legible text color on faint tiles", () => {
    expect(tileTextColor(0.1)).toBe(COLOR.HEAT_TEXT_LIGHT_UP);
    expect(tileTextColor(-0.1)).toBe(COLOR.HEAT_TEXT_LIGHT_DOWN);
    expect(tileTextColor(0)).toBe(COLOR.HEAT_TEXT_DEFAULT);
    expect(tileTextColor(2)).toBe(COLOR.HEAT_TEXT_DEFAULT);
  });

  it("returns empty layout when bounds are invalid", () => {
    const items = [{ symbol: "A", sector: "Tech", pct: 1, size: 1 }];
    expect(squarify(items, { x: 0, y: 0, w: 0, h: 100 })).toEqual([]);
    expect(squarify(items, { x: 0, y: 0, w: 100, h: 0 })).toEqual([]);
  });

  it("generates one tile per item with positive dimensions", () => {
    const items = [
      { symbol: "A", sector: "Tech", pct: 1.2, size: 5 },
      { symbol: "B", sector: "Tech", pct: -0.4, size: 3 },
      { symbol: "C", sector: "Tech", pct: 0.2, size: 2 },
    ];
    const out = squarify(items, { x: 0, y: 0, w: 100, h: 60 });

    expect(out).toHaveLength(items.length);
    for (const tile of out) {
      expect(tile.w).toBeGreaterThan(0);
      expect(tile.h).toBeGreaterThan(0);
    }
  });

  it("collapses tiny sector tiles into a single OTHER tile", () => {
    const items = [
      { symbol: "A", sector: "Tech", pct: 1, size: 1 },
      { symbol: "B", sector: "Tech", pct: 2, size: 1 },
      { symbol: "C", sector: "Tech", pct: -1, size: 1 },
      { symbol: "D", sector: "Tech", pct: -2, size: 1 },
    ];

    const out = collapseSmallTiles(items, { x: 0, y: 0, w: 20, h: 20 }, "Tech");
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("Tech:OTHER");
    expect(out[0].isOther).toBe(true);
    expect(out[0].otherCount).toBe(4);
  });

  it("returns empty when all sizes are zero", () => {
    const items = [{ symbol: "A", sector: "T", pct: 0, size: 0 }];
    expect(squarify(items, { x: 0, y: 0, w: 100, h: 100 })).toEqual([]);
  });

  it("returns items unchanged when all tiles fit comfortably", () => {
    const items = [
      { symbol: "A", sector: "T", pct: 1, size: 100 },
      { symbol: "B", sector: "T", pct: 2, size: 50 },
    ];
    const out = collapseSmallTiles(items, { x: 0, y: 0, w: 200, h: 200 }, "T");
    expect(out).toHaveLength(2);
    expect(out[0].isOther).toBeUndefined();
  });

  it("handles negative sectorPct in OTHER tile", () => {
    const items = [
      { symbol: "A", sector: "Tech", pct: -2, size: 10 },
      { symbol: "B", sector: "Tech", pct: -3, size: 10 },
    ];
    const out = collapseSmallTiles(items, { x: 0, y: 0, w: 5, h: 5 }, "Tech");
    expect(out).toHaveLength(1);
    expect(out[0].pct).toBeLessThan(0);
  });

  it("handles tall narrow bounds (w < h)", () => {
    const items = [
      { symbol: "A", sector: "T", pct: 1, size: 5 },
      { symbol: "B", sector: "T", pct: 2, size: 3 },
      { symbol: "C", sector: "T", pct: -1, size: 2 },
    ];
    const out = squarify(items, { x: 0, y: 0, w: 30, h: 100 });
    expect(out).toHaveLength(items.length);
    for (const t of out) {
      expect(t.w).toBeGreaterThan(0);
      expect(t.h).toBeGreaterThan(0);
    }
  });

  it("handles wide flat bounds (w > h)", () => {
    const items = [
      { symbol: "A", sector: "T", pct: 1, size: 5 },
      { symbol: "B", sector: "T", pct: 2, size: 3 },
      { symbol: "C", sector: "T", pct: -1, size: 2 },
    ];
    const out = squarify(items, { x: 0, y: 0, w: 200, h: 30 });
    expect(out).toHaveLength(items.length);
  });

  it("text color for very negative pct", () => {
    expect(tileTextColor(-3)).toBe(COLOR.HEAT_TEXT_DEFAULT);
  });

  it("text color for very positive pct", () => {
    expect(tileTextColor(5)).toBe(COLOR.HEAT_TEXT_DEFAULT);
  });

  it("maps the strongest up band", () => {
    expect(pctToColor(10)).toBe(COLOR.HEAT_STRONG_UP);
  });
});

describe("capItemsPerSector", () => {
  function makeItems(count: number, sector = "Technology") {
    return Array.from({ length: count }, (_, i) => ({
      symbol: `SYM${i}`,
      sector,
      pct: 0.5,
      size: count - i,
    }));
  }

  it("returns items unchanged when under the cap", () => {
    const items = makeItems(50);
    expect(capItemsPerSector(items, "Technology", 150)).toEqual(items);
  });

  it("caps to the largest N items plus a single OTHER tile", () => {
    const items = makeItems(300);
    const out = capItemsPerSector(items, "Technology", 150);
    expect(out).toHaveLength(151);
    expect(out.slice(0, 150).every((t) => !t.isOther)).toBe(true);
    const other = out[150];
    expect(other.isOther).toBe(true);
    expect(other.symbol).toBe("Technology:OTHER");
    expect(other.otherCount).toBe(150);
  });

  it("keeps the largest-size items, not the first N in input order", () => {
    const items = makeItems(200);
    const out = capItemsPerSector(items, "Technology", 150);
    const keptSymbols = new Set(out.slice(0, 150).map((t) => t.symbol));
    // Items are seeded with descending size (SYM0 largest), so the top 150
    // by size are SYM0..SYM149.
    expect(keptSymbols.has("SYM0")).toBe(true);
    expect(keptSymbols.has("SYM149")).toBe(true);
    expect(keptSymbols.has("SYM199")).toBe(false);
  });

  it("aggregates size and volume-weighted pct correctly into the OTHER tile", () => {
    const items = [
      { symbol: "A", sector: "T", pct: 2, size: 100 },
      { symbol: "B", sector: "T", pct: -4, size: 50 },
    ];
    const out = capItemsPerSector(items, "T", 1);
    expect(out).toHaveLength(2);
    const other = out[1];
    expect(other.size).toBe(50);
    expect(other.pct).toBe(-4);
  });
});

describe("collapseSmallTiles with a pre-existing OTHER tile", () => {
  it("merges further collapsed tiles into the single OTHER entry instead of producing a duplicate key", () => {
    const items = Array.from({ length: 300 }, (_, i) => ({
      symbol: `SYM${i}`,
      sector: "Technology",
      pct: 0.5,
      size: 300 - i,
    }));
    const capped = capItemsPerSector(items, "Technology", 150);
    // Tight bounds force nearly everything, including the pre-existing
    // OTHER tile from capItemsPerSector, to collapse further.
    const out = collapseSmallTiles(capped, { x: 0, y: 0, w: 40, h: 40 }, "Technology");
    const otherTiles = out.filter((t) => t.symbol === "Technology:OTHER");
    expect(otherTiles).toHaveLength(1);
    const symbols = out.map((t) => t.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("preserves the pre-existing OTHER tile untouched when nothing new collapses", () => {
    const items = [
      { symbol: "A", sector: "T", pct: 1, size: 100 },
      { symbol: "T:OTHER", sector: "T", pct: -1, size: 50, isOther: true, otherCount: 5 },
    ];
    const out = collapseSmallTiles(items, { x: 0, y: 0, w: 900, h: 500 }, "T");
    const other = out.find((t) => t.symbol === "T:OTHER");
    expect(other?.otherCount).toBe(5);
  });
});

function makeAsset(over: Partial<AssetDef>): AssetDef {
  return {
    symbol: "X",
    initialPrice: 100,
    volatility: 0.1,
    sector: "Tech",
    ...over,
  };
}

function makeStore(assets: AssetDef[]) {
  const prices = Object.fromEntries(assets.map((a) => [a.symbol, 100]));
  return configureStore({
    reducer: {
      market: marketSlice.reducer,
      orders: ordersSlice.reducer,
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
    },
    preloadedState: {
      market: {
        assets,
        prices,
        priceHistory: {},
        sessionOpen: prices,
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

function renderHeatmap(assets: AssetDef[]) {
  const store = makeStore(assets);
  const Wrapper = () => (
    <ReduxProvider store={store}>
      <MarketHeatmap />
    </ReduxProvider>
  );
  render(<Wrapper />);
  return store;
}

function manySmallTech(count: number): AssetDef[] {
  return Array.from({ length: count }, (_, i) =>
    makeAsset({ symbol: `S${i}`, sector: "Tech", marketCapB: 1 })
  );
}

describe("MarketHeatmap OTHER tile and drilldown", () => {
  it("hovers and clicks the OTHER tile to drill into a sector and back", () => {
    renderHeatmap(manySmallTech(60));

    const other = screen.getAllByLabelText(/more stocks in/)[0];
    fireEvent.mouseEnter(other, { clientX: 50, clientY: 50 });
    fireEvent.mouseMove(other, { clientX: 60, clientY: 60 });
    expect(screen.queryByLabelText("Back to full market view")).toBeNull();
    fireEvent.click(other);

    const back = screen.getByLabelText("Back to full market view");
    expect(back).toBeInTheDocument();

    fireEvent.click(back);
    expect(screen.getByText(/Market Heatmap/i)).toBeInTheDocument();
  });

  it("renders an OTHER tooltip when hovering the collapsed tile", () => {
    renderHeatmap(manySmallTech(60));

    const other = screen.getAllByLabelText(/more stocks in/)[0];
    fireEvent.mouseEnter(other, { clientX: 50, clientY: 50 });
    expect(screen.getByText(/too small to display/i)).toBeInTheDocument();
    fireEvent.mouseLeave(other);
  });

  it("expands the OTHER tile via keyboard Enter", () => {
    renderHeatmap(manySmallTech(60));

    const other = screen.getAllByLabelText(/more stocks in/)[0];
    fireEvent.keyDown(other, { key: "Enter" });
    expect(screen.getByLabelText("Back to full market view")).toBeInTheDocument();
  });

  it("expands the OTHER tile via keyboard Space", () => {
    renderHeatmap(manySmallTech(60));

    const other = screen.getAllByLabelText(/more stocks in/)[0];
    fireEvent.keyDown(other, { key: " " });
    expect(screen.getByLabelText("Back to full market view")).toBeInTheDocument();
  });
});

describe("MarketHeatmap normal tile interactions", () => {
  it("broadcasts the selected asset when a tile is clicked", () => {
    const store = renderHeatmap([makeAsset({ symbol: "AAA", marketCapB: 100 })]);

    const cell = screen.getByTestId("heatmap-cell-AAA");
    fireEvent.click(cell);

    expect(store.getState().ui.selectedAsset).toBe("AAA");
  });

  it("broadcasts the selected asset via keyboard Enter and Space", () => {
    const store = renderHeatmap([makeAsset({ symbol: "BBB", marketCapB: 100 })]);

    const cell = screen.getByTestId("heatmap-cell-BBB");
    fireEvent.keyDown(cell, { key: "Enter" });
    expect(store.getState().ui.selectedAsset).toBe("BBB");

    fireEvent.keyDown(cell, { key: " " });
    expect(store.getState().ui.selectedAsset).toBe("BBB");
  });

  it("shows and hides a symbol tooltip on hover", () => {
    renderHeatmap([makeAsset({ symbol: "CCC", marketCapB: 100 })]);

    const cell = screen.getByTestId("heatmap-cell-CCC");
    fireEvent.mouseEnter(cell, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(cell, { clientX: 20, clientY: 20 });
    expect(screen.getAllByText("CCC").length).toBeGreaterThan(0);

    fireEvent.mouseLeave(cell);
  });

  it("renders multiple sectors sorted by total size", () => {
    renderHeatmap([
      makeAsset({ symbol: "AAA", sector: "Tech", marketCapB: 100 }),
      makeAsset({ symbol: "BBB", sector: "Energy", marketCapB: 200 }),
      makeAsset({ symbol: "CCC", sector: "Health", marketCapB: 50 }),
    ]);

    expect(screen.getByTestId("heatmap-cell-AAA")).toBeInTheDocument();
    expect(screen.getByTestId("heatmap-cell-BBB")).toBeInTheDocument();
    expect(screen.getByTestId("heatmap-cell-CCC")).toBeInTheDocument();
  });

  it("re-sizes tiles when toggling sort By Move", () => {
    renderHeatmap([
      makeAsset({ symbol: "AAA", sector: "Tech", marketCapB: 100 }),
      makeAsset({ symbol: "BBB", sector: "Energy", marketCapB: 200 }),
    ]);

    const byMove = screen.getByRole("button", { name: "By Move" });
    fireEvent.click(byMove);
    expect(byMove).toHaveAttribute("aria-pressed", "true");

    const byCap = screen.getByRole("button", { name: "By Cap" });
    fireEvent.click(byCap);
    expect(byCap).toHaveAttribute("aria-pressed", "true");
  });
});

describe("MarketHeatmap resize observer", () => {
  const RealResizeObserver = globalThis.ResizeObserver;
  afterEach(() => {
    globalThis.ResizeObserver = RealResizeObserver;
  });

  it("updates the canvas dimensions when the container resizes", () => {
    let captured: ((entries: ResizeObserverEntry[]) => void) | null = null;
    globalThis.ResizeObserver = class {
      constructor(cb: (entries: ResizeObserverEntry[]) => void) {
        captured = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;

    renderHeatmap([makeAsset({ symbol: "A", marketCapB: 100 })]);
    expect(captured).not.toBeNull();

    act(() => {
      captured?.([{ contentRect: { width: 640, height: 480 } } as ResizeObserverEntry]);
    });

    const svg = screen.getByLabelText(/Market heatmap/);
    expect(svg.getAttribute("viewBox")).toContain("640");
  });

  it("ignores zero-sized resize entries", () => {
    let captured: ((entries: ResizeObserverEntry[]) => void) | null = null;
    globalThis.ResizeObserver = class {
      constructor(cb: (entries: ResizeObserverEntry[]) => void) {
        captured = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;

    renderHeatmap([makeAsset({ symbol: "A", marketCapB: 100 })]);

    act(() => {
      captured?.([{ contentRect: { width: 0, height: 0 } } as ResizeObserverEntry]);
    });

    const svg = screen.getByLabelText(/Market heatmap/);
    expect(svg.getAttribute("viewBox")).toContain("960");
  });
});
