import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CandlestickChart } from "@veta/frontend/components/CandlestickChart";
import { themeSlice } from "@veta/frontend/store/themeSlice.ts";
import type { OhlcCandle } from "@veta/frontend/types";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function renderWithStore(ui: React.ReactElement) {
  const testStore = configureStore({ reducer: { theme: themeSlice.reducer } });
  return render(<Provider store={testStore}>{ui}</Provider>);
}

// lightweight-charts renders to canvas which jsdom doesn't support — stub it out
const seriesStub = { setData: vi.fn(), update: vi.fn(), applyOptions: vi.fn() };
const priceScaleStub = { applyOptions: vi.fn() };
const timeScaleStub = { fitContent: vi.fn(), applyOptions: vi.fn(), resize: vi.fn() };
const chartStub = {
  addSeries: vi.fn(() => seriesStub),
  priceScale: vi.fn(() => priceScaleStub),
  applyOptions: vi.fn(),
  timeScale: vi.fn(() => timeScaleStub),
  resize: vi.fn(),
  remove: vi.fn(),
};

vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => chartStub),
  CandlestickSeries: {},
  HistogramSeries: {},
  LineSeries: {},
  ColorType: { Solid: "solid" },
  CrosshairMode: { Normal: 0 },
}));

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
  it("renders minute interval buttons", () => {
    renderWithStore(<CandlestickChart symbol="MSFT" candles={filledCandles} />);
    expect(screen.getByRole("button", { name: "1m" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5m" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "15m" })).toBeInTheDocument();
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

  it("shows collecting 2m when interval is 2m and there are no aggregated candles", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={emptyCandles} />);
    fireEvent.click(screen.getByRole("button", { name: "2m" }));
    expect(screen.getByText(/Collecting 2m candles/i)).toBeInTheDocument();
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

  it("switches to 15m interval when 15m button is clicked", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={filledCandles} />);
    const btn15m = screen.getByRole("button", { name: "15m" });
    fireEvent.click(btn15m);
    expect(btn15m.className).toContain("bg-emerald-700");
  });

  it("shows collecting message after switching if 5m has no candles", () => {
    const partialCandles = { "1m": twoCandles, "5m": [] };
    renderWithStore(<CandlestickChart symbol="AAPL" candles={partialCandles} />);
    fireEvent.click(screen.getByRole("button", { name: "5m" }));
    expect(screen.getByText(/Collecting 5m candles/i)).toBeInTheDocument();
  });
});

describe("CandlestickChart – SMA overlay", () => {
  it("renders the SMA toggle enabled by default and a period input", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={filledCandles} />);
    const toggle = screen.getByTestId("sma-toggle");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("sma-period-input")).toHaveValue(20);
  });

  it("disables the period input when toggled off", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={filledCandles} />);
    fireEvent.click(screen.getByTestId("sma-toggle"));
    expect(screen.getByTestId("sma-toggle")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("sma-period-input")).toBeDisabled();
  });

  it("updates the period when the number input changes", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={filledCandles} />);
    const input = screen.getByTestId("sma-period-input");
    fireEvent.change(input, { target: { value: "10" } });
    expect(input).toHaveValue(10);
  });

  it("clamps the period to the configured min/max bounds", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={filledCandles} />);
    const input = screen.getByTestId("sma-period-input");
    fireEvent.change(input, { target: { value: "9999" } });
    expect(input).toHaveValue(200);
    fireEvent.change(input, { target: { value: "0" } });
    expect(input).toHaveValue(2);
  });

  it("ignores non-numeric period input", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={filledCandles} />);
    const input = screen.getByTestId("sma-period-input");
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue(10);
  });
});

type CapturedObserver = {
  callback: ResizeObserverCallback;
  instance: ResizeObserver;
  fire: (width: number, height: number) => void;
};

const observers: CapturedObserver[] = [];
const originalRaf = globalThis.requestAnimationFrame;
const originalCancelRaf = globalThis.cancelAnimationFrame;
const originalResizeObserver = globalThis.ResizeObserver;
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

function fireResize(observer: CapturedObserver, width: number, height: number) {
  act(() => {
    observer.callback(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      observer.instance
    );
  });
}

describe("CandlestickChart – chart wiring", () => {
  beforeEach(() => {
    observers.length = 0;
    seriesStub.setData.mockClear();
    seriesStub.update.mockClear();
    chartStub.resize.mockClear();
    chartStub.applyOptions.mockClear();
    timeScaleStub.applyOptions.mockClear();
    timeScaleStub.fitContent.mockClear();

    globalThis.ResizeObserver = class implements ResizeObserver {
      callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        const captured: CapturedObserver = {
          callback,
          instance: this,
          fire: (width, height) => fireResize(captured, width, height),
        };
        observers.push(captured);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

    Element.prototype.getBoundingClientRect = () =>
      ({
        width: 600,
        height: 400,
        top: 0,
        left: 0,
        right: 600,
        bottom: 400,
        x: 0,
        y: 0,
      }) as DOMRect;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it("resizes the chart on the initial animation frame when the container has size", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={filledCandles} />);
    expect(chartStub.resize).toHaveBeenCalledWith(600, 400);
    expect(timeScaleStub.applyOptions).toHaveBeenCalled();
  });

  it("loads candle data once the resize observer reports a non-zero size", () => {
    const upCandles = {
      "1m": [
        makeCandle({ time: 60_000, open: 150, close: 152, volume: 10 }),
        makeCandle({ time: 120_000, open: 152, close: 149, volume: 20 }),
      ],
      "5m": [] as OhlcCandle[],
    };
    renderWithStore(<CandlestickChart symbol="AAPL" candles={upCandles} />);
    expect(observers.length).toBeGreaterThan(0);
    observers[0].fire(800, 500);
    expect(seriesStub.setData).toHaveBeenCalled();
    const barData = seriesStub.setData.mock.calls[0][0];
    expect(barData[0]).toEqual({ time: 60, open: 150, high: 155, low: 148, close: 152 });
  });

  it("colours volume bars by candle direction", () => {
    const directionalCandles = {
      "1m": [
        makeCandle({ time: 60_000, open: 150, close: 155, volume: 5 }),
        makeCandle({ time: 120_000, open: 155, close: 150, volume: 7 }),
      ],
      "5m": [] as OhlcCandle[],
    };
    renderWithStore(<CandlestickChart symbol="AAPL" candles={directionalCandles} />);
    observers[0].fire(800, 500);
    const volData = seriesStub.setData.mock.calls.find((c) => c[0]?.[0]?.value !== undefined)?.[0];
    expect(volData).toBeDefined();
    expect(volData[0].value).toBe(5);
    expect(volData[0].color).not.toBe(volData[1].color);
  });

  it("re-fits content when a subsequent resize arrives after data is loaded", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={filledCandles} />);
    observers[0].fire(800, 500);
    timeScaleStub.fitContent.mockClear();
    observers[0].fire(900, 600);
    expect(chartStub.resize).toHaveBeenCalledWith(900, 600);
    expect(timeScaleStub.fitContent).toHaveBeenCalled();
  });

  it("ignores resize entries with non-positive dimensions", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={filledCandles} />);
    chartStub.resize.mockClear();
    observers[0].fire(0, 0);
    expect(chartStub.resize).not.toHaveBeenCalled();
  });

  it("appends a single bar via update when only one new candle arrives", () => {
    const base = [
      makeCandle({ time: 60_000, open: 150, close: 152, volume: 10 }),
      makeCandle({ time: 120_000, open: 152, close: 151, volume: 11 }),
    ];
    const { rerender } = renderWithStore(
      <CandlestickChart symbol="AAPL" candles={{ "1m": base, "5m": [] }} />
    );
    observers[0].fire(800, 500);
    seriesStub.update.mockClear();
    const appended = [...base, makeCandle({ time: 180_000, open: 151, close: 153, volume: 12 })];
    rerender(
      <Provider store={configureStore({ reducer: { theme: themeSlice.reducer } })}>
        <CandlestickChart symbol="AAPL" candles={{ "1m": appended, "5m": [] }} />
      </Provider>
    );
    expect(seriesStub.update).toHaveBeenCalled();
  });

  it("reapplies the theme on the next frame when the theme changes", () => {
    const store = configureStore({ reducer: { theme: themeSlice.reducer } });
    render(
      <Provider store={store}>
        <CandlestickChart symbol="AAPL" candles={filledCandles} />
      </Provider>
    );
    chartStub.applyOptions.mockClear();
    act(() => {
      store.dispatch(themeSlice.actions.setTheme("light"));
    });
    expect(chartStub.applyOptions).toHaveBeenCalled();
  });

  it("does not resize again when a resize entry repeats the current dimensions", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={filledCandles} />);
    observers[0].fire(800, 500);
    chartStub.resize.mockClear();
    observers[0].fire(800, 500);
    expect(chartStub.resize).not.toHaveBeenCalled();
  });

  it("resizes when only the height differs from the current dimensions", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={filledCandles} />);
    observers[0].fire(800, 500);
    chartStub.resize.mockClear();
    observers[0].fire(800, 650);
    expect(chartStub.resize).toHaveBeenCalledWith(800, 650);
  });

  it("does not load data on the initial resize when no candles are pending", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={emptyCandles} />);
    seriesStub.setData.mockClear();
    observers[0].fire(800, 500);
    expect(seriesStub.setData).not.toHaveBeenCalled();
  });

  it("does not refit on subsequent resizes while no bars are loaded", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={emptyCandles} />);
    observers[0].fire(800, 500);
    timeScaleStub.fitContent.mockClear();
    observers[0].fire(900, 600);
    expect(timeScaleStub.fitContent).not.toHaveBeenCalled();
  });

  it("skips the initial frame resize when the container reports zero size", () => {
    Element.prototype.getBoundingClientRect = () =>
      ({
        width: 0,
        height: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
      }) as DOMRect;
    renderWithStore(<CandlestickChart symbol="AAPL" candles={filledCandles} />);
    expect(chartStub.resize).not.toHaveBeenCalled();
  });

  it("falls back to zero dimensions when the resize entry has no contentRect", () => {
    renderWithStore(<CandlestickChart symbol="AAPL" candles={filledCandles} />);
    chartStub.resize.mockClear();
    act(() => {
      observers[0].callback([{} as ResizeObserverEntry], observers[0].instance);
    });
    expect(chartStub.resize).not.toHaveBeenCalled();
  });

  it("does not refit after the first appended bar consumes the pending fit flag", () => {
    const base = [
      makeCandle({ time: 60_000, open: 150, close: 152, volume: 10 }),
      makeCandle({ time: 120_000, open: 152, close: 151, volume: 11 }),
    ];
    const store = configureStore({ reducer: { theme: themeSlice.reducer } });
    const { rerender } = render(
      <Provider store={store}>
        <CandlestickChart symbol="AAPL" candles={{ "1m": base, "5m": [] }} />
      </Provider>
    );
    observers[0].fire(800, 500);

    const oneAppended = [...base, makeCandle({ time: 180_000, open: 151, close: 153, volume: 12 })];
    rerender(
      <Provider store={store}>
        <CandlestickChart symbol="AAPL" candles={{ "1m": oneAppended, "5m": [] }} />
      </Provider>
    );

    timeScaleStub.fitContent.mockClear();
    const twoAppended = [
      ...oneAppended,
      makeCandle({ time: 240_000, open: 153, close: 154, volume: 13 }),
    ];
    rerender(
      <Provider store={store}>
        <CandlestickChart symbol="AAPL" candles={{ "1m": twoAppended, "5m": [] }} />
      </Provider>
    );

    expect(seriesStub.update).toHaveBeenCalled();
    expect(timeScaleStub.fitContent).not.toHaveBeenCalled();
  });
});
