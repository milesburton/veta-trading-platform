import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { themeSlice } from "../../store/themeSlice.ts";
import type { OhlcCandle } from "../../types";
import { CandlestickChart } from "../CandlestickChart";

function renderWithStore(ui: React.ReactElement) {
  const testStore = configureStore({ reducer: { theme: themeSlice.reducer } });
  return render(<Provider store={testStore}>{ui}</Provider>);
}

// lightweight-charts renders to canvas which jsdom doesn't support — stub it out
vi.mock("lightweight-charts", () => {
  const seriesStub = { setData: vi.fn(), applyOptions: vi.fn() };
  const priceScaleStub = { applyOptions: vi.fn() };
  const chartStub = {
    addSeries: vi.fn(() => seriesStub),
    priceScale: vi.fn(() => priceScaleStub),
    applyOptions: vi.fn(),
    timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
    remove: vi.fn(),
  };
  return {
    createChart: vi.fn(() => chartStub),
    CandlestickSeries: {},
    HistogramSeries: {},
    ColorType: { Solid: "solid" },
    CrosshairMode: { Normal: 0 },
  };
});

function makeCandle(overrides: Partial<OhlcCandle> = {}): OhlcCandle {
  return {
    time: Date.now(),
    open: 150,
    high: 155,
    low: 148,
    close: 152,
    ...overrides,
  };
}

const twoCandles = [makeCandle({ time: 1000 }), makeCandle({ time: 2000, close: 153 })];
const emptyCandles = { "1m": [], "5m": [] };
const filledCandles = { "1m": twoCandles, "5m": twoCandles };

describe("CandlestickChart – rendering", () => {
  it("renders interval buttons 1m and 5m", () => {
    renderWithStore(<CandlestickChart symbol="MSFT" candles={filledCandles} />);
    expect(screen.getByRole("button", { name: "1m" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5m" })).toBeInTheDocument();
  });

  it("shows candle count when data is present", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={filledCandles} />);
    // Header shows "N bars" count
    expect(screen.getByText(/\d+ bars/i)).toBeInTheDocument();
  });
});

describe("CandlestickChart – empty state", () => {
  it("shows collecting message when fewer than 2 candles", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={emptyCandles} />);
    expect(screen.getByText(/Collecting 1m candles/i)).toBeInTheDocument();
  });

  it("shows collecting 5m when interval is 5m and no candles", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={emptyCandles} />);
    // Switch to 5m
    fireEvent.click(screen.getByRole("button", { name: "5m" }));
    expect(screen.getByText(/Collecting 5m candles/i)).toBeInTheDocument();
  });
});

describe("CandlestickChart – interval switching", () => {
  it("defaults to 1m interval", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={filledCandles} />);
    // 1m button should be highlighted (it contains the active class)
    const btn1m = screen.getByRole("button", { name: "1m" });
    expect(btn1m.className).toContain("bg-emerald-700");
  });

  it("switches to 5m interval when 5m button is clicked", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={filledCandles} />);
    const btn5m = screen.getByRole("button", { name: "5m" });
    fireEvent.click(btn5m);
    expect(btn5m.className).toContain("bg-emerald-700");
  });

  it("shows collecting message after switching if 5m has no candles", () => {
    const partialCandles = { "1m": twoCandles, "5m": [] };
    renderWithStore(<CandlestickChart symbol="AAPL" candles={partialCandles} />);
    fireEvent.click(screen.getByRole("button", { name: "5m" }));
    expect(screen.getByText(/Collecting 5m candles/i)).toBeInTheDocument();
  });
});
