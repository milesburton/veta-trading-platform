import { useSignal } from "@preact/signals-react";
import { useAppSelector } from "@veta/frontend/store/hooks.ts";
import { COLOR } from "@veta/frontend/tokens.ts";
import type { OhlcCandle } from "@veta/frontend/types.ts";
import type { IChartApi, ISeriesApi, LineData, UTCTimestamp } from "lightweight-charts";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  HistogramSeries,
  LineSeries,
} from "lightweight-charts";
import { type MutableRefObject, useEffect, useRef } from "react";

type MinuteInterval = `${number}m`;

const INTERVAL_OPTIONS: MinuteInterval[] = Array.from(
  { length: 15 },
  (_, i) => `${i + 1}m` as MinuteInterval
);
const CANDLE_BAR_SPACING = 8;
const DEFAULT_SMA_PERIOD = 20;
const MIN_SMA_PERIOD = 2;
const MAX_SMA_PERIOD = 200;

interface Props {
  symbol: string;
  candles: { "1m": OhlcCandle[]; "5m": OhlcCandle[] };
}

function getChartTheme() {
  const s = getComputedStyle(document.documentElement);
  function ch(v: string) {
    return `rgb(${s.getPropertyValue(v).trim()})`;
  }
  return {
    layout: {
      background: { type: ColorType.Solid, color: ch("--gray-950") },
      textColor: ch("--gray-400"),
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: ch("--gray-900") },
      horzLines: { color: ch("--gray-900") },
    },
    crosshair: { mode: CrosshairMode.Normal },
    leftPriceScale: { visible: false },
    rightPriceScale: { borderColor: ch("--gray-800") },
    timeScale: {
      borderColor: ch("--gray-800"),
      timeVisible: true,
      secondsVisible: false,
    },
  };
}

function toBarData(c: OhlcCandle) {
  return {
    time: (c.time / 1000) as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

function toVolData(c: OhlcCandle) {
  return {
    time: (c.time / 1000) as UTCTimestamp,
    value: c.volume ?? 0,
    color: c.close >= c.open ? COLOR.UP_BG : COLOR.DOWN_BG,
  };
}

function computeSma(candles: OhlcCandle[], period: number): LineData<UTCTimestamp>[] {
  if (period < 1 || candles.length < period) return [];

  const result: LineData<UTCTimestamp>[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) {
      result.push({
        time: (candles[i].time / 1000) as UTCTimestamp,
        value: sum / period,
      });
    }
  }
  return result;
}

function aggregateCandles(candles: OhlcCandle[], intervalMinutes: number): OhlcCandle[] {
  if (intervalMinutes <= 1) return candles;

  const intervalMs = intervalMinutes * 60_000;
  const result: OhlcCandle[] = [];

  for (const candle of candles) {
    const bucket = Math.floor(candle.time / intervalMs) * intervalMs;
    const last = result[result.length - 1];
    if (last && last.time === bucket) {
      last.high = Math.max(last.high, candle.high);
      last.low = Math.min(last.low, candle.low);
      last.close = candle.close;
      last.volume = (last.volume ?? 0) + (candle.volume ?? 0);
    } else {
      result.push({
        time: bucket,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume ?? 0,
      });
    }
  }

  return result;
}

function setFixedBarSpacing(chart: IChartApi, barCount: number, containerWidth: number) {
  const hasUsableContainerWidth = Number.isFinite(containerWidth) && containerWidth > 0;
  const wouldFillContainer =
    hasUsableContainerWidth && barCount * CANDLE_BAR_SPACING >= containerWidth;
  chart.timeScale().applyOptions({
    ...(wouldFillContainer
      ? { barSpacing: CANDLE_BAR_SPACING, minBarSpacing: CANDLE_BAR_SPACING }
      : { minBarSpacing: 0.5 }),
    rightOffset: 0,
    lockVisibleTimeRangeOnResize: true,
  });
}

function resizeChartToContainer(chart: IChartApi, width: number, height: number, barCount: number) {
  chart.resize(width, height);
  setFixedBarSpacing(chart, barCount, width);
}

function fitContentAndLockSpacing(chart: IChartApi | null, barCount: number) {
  if (!chart) return;
  const containerWidth = chart.timeScale().width();
  setFixedBarSpacing(chart, barCount, containerWidth);
  chart.timeScale().fitContent();
}

function getIntervalCandles(candles: Props["candles"], interval: MinuteInterval) {
  if (interval === "1m" || interval === "5m") return candles[interval];
  return aggregateCandles(candles["1m"], Number.parseInt(interval, 10));
}

function useCandlestickChartCanvas(
  containerRef: MutableRefObject<HTMLDivElement | null>,
  chartRef: MutableRefObject<IChartApi | null>,
  candleSeriesRef: MutableRefObject<ISeriesApi<"Candlestick"> | null>,
  volumeSeriesRef: MutableRefObject<ISeriesApi<"Histogram"> | null>,
  smaSeriesRef: MutableRefObject<ISeriesApi<"Line"> | null>,
  chartSizedRef: MutableRefObject<boolean>,
  pendingLoadRef: MutableRefObject<(() => void) | null>,
  loadedBarCountRef: MutableRefObject<number>,
  lastSizeRef: MutableRefObject<{ width: number; height: number }>
) {
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...getChartTheme(),
      autoSize: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: COLOR.UP,
      downColor: COLOR.DOWN,
      borderUpColor: COLOR.UP,
      borderDownColor: COLOR.DOWN,
      wickUpColor: COLOR.UP,
      wickDownColor: COLOR.DOWN,
      priceScaleId: "right",
    });
    volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
      color: COLOR.UP,
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    chart.priceScale("").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    smaSeriesRef.current = chart.addSeries(LineSeries, {
      color: COLOR.VWAP,
      lineWidth: 2,
      priceScaleId: "right",
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    setFixedBarSpacing(chart, loadedBarCountRef.current, 0);

    const ro = new ResizeObserver((entries) => {
      const { width = 0, height = 0 } = entries[0]?.contentRect ?? {};
      if (width <= 0 || height <= 0) return;

      const nextWidth = Math.max(1, Math.floor(width));
      const nextHeight = Math.max(1, Math.floor(height));
      const lastSize = lastSizeRef.current;
      if (lastSize.width !== nextWidth || lastSize.height !== nextHeight) {
        lastSizeRef.current = { width: nextWidth, height: nextHeight };
        resizeChartToContainer(chart, nextWidth, nextHeight, loadedBarCountRef.current);
      }

      if (!chartSizedRef.current) {
        chartSizedRef.current = true;
        if (pendingLoadRef.current) {
          pendingLoadRef.current();
          pendingLoadRef.current = null;
        }
      } else if (loadedBarCountRef.current > 0) {
        fitContentAndLockSpacing(chartRef.current, loadedBarCountRef.current);
      }
    });
    ro.observe(containerRef.current);

    requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        const nextWidth = Math.max(1, Math.floor(width));
        const nextHeight = Math.max(1, Math.floor(height));
        lastSizeRef.current = { width: nextWidth, height: nextHeight };
        resizeChartToContainer(chart, nextWidth, nextHeight, loadedBarCountRef.current);
      }
    });

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [
    chartRef,
    candleSeriesRef,
    chartSizedRef,
    containerRef,
    lastSizeRef,
    loadedBarCountRef,
    pendingLoadRef,
    smaSeriesRef,
    volumeSeriesRef,
  ]);
}

function useCandlestickData(
  candles: Props["candles"],
  interval: MinuteInterval,
  symbol: string,
  smaPeriod: number,
  smaVisible: boolean,
  chartRef: MutableRefObject<IChartApi | null>,
  candleSeriesRef: MutableRefObject<ISeriesApi<"Candlestick"> | null>,
  volumeSeriesRef: MutableRefObject<ISeriesApi<"Histogram"> | null>,
  smaSeriesRef: MutableRefObject<ISeriesApi<"Line"> | null>,
  chartSizedRef: MutableRefObject<boolean>,
  pendingLoadRef: MutableRefObject<(() => void) | null>,
  loadedKeyRef: MutableRefObject<string>,
  lastBarTimeRef: MutableRefObject<number>,
  loadedBarCountRef: MutableRefObject<number>,
  fitOnNextTickRef: MutableRefObject<boolean>
) {
  useEffect(() => {
    const cs = candleSeriesRef.current;
    const vs = volumeSeriesRef.current;
    const ss = smaSeriesRef.current;
    if (!cs || !vs || !ss) return;

    const raw = getIntervalCandles(candles, interval);
    if (raw.length === 0) return;

    const newKey = `${symbol}:${interval}:${smaPeriod}:${smaVisible}`;
    const isNewSeries = loadedKeyRef.current !== newKey;
    const last = raw[raw.length - 1];
    const lastTime = last.time;
    const isFullReplace =
      isNewSeries ||
      lastTime < lastBarTimeRef.current ||
      raw.length > loadedBarCountRef.current + 1;

    function doLoad() {
      const cs = candleSeriesRef.current;
      const vs = volumeSeriesRef.current;
      const ss = smaSeriesRef.current;
      if (!cs || !vs || !ss) return;

      if (isFullReplace) {
        cs.setData(raw.map(toBarData));
        vs.setData(raw.map(toVolData));
        ss.setData(smaVisible ? computeSma(raw, smaPeriod) : []);
        loadedKeyRef.current = newKey;
        lastBarTimeRef.current = lastTime;
        loadedBarCountRef.current = raw.length;
        fitOnNextTickRef.current = true;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => fitContentAndLockSpacing(chartRef.current, raw.length))
        );
      } else {
        cs.update(toBarData(last));
        vs.update(toVolData(last));
        if (smaVisible && raw.length >= smaPeriod) {
          const smaTail = computeSma(raw.slice(-smaPeriod - 1), smaPeriod);
          const latestSma = smaTail[smaTail.length - 1];
          if (latestSma) ss.update(latestSma);
        }
        lastBarTimeRef.current = lastTime;
        loadedBarCountRef.current = raw.length;
        if (fitOnNextTickRef.current) {
          fitOnNextTickRef.current = false;
          requestAnimationFrame(() => fitContentAndLockSpacing(chartRef.current, raw.length));
        }
      }
    }

    if (!chartSizedRef.current) {
      pendingLoadRef.current = doLoad;
    } else {
      doLoad();
    }
  }, [
    candleSeriesRef,
    candles,
    chartRef,
    chartSizedRef,
    fitOnNextTickRef,
    interval,
    lastBarTimeRef,
    loadedBarCountRef,
    loadedKeyRef,
    pendingLoadRef,
    smaPeriod,
    smaSeriesRef,
    smaVisible,
    symbol,
    volumeSeriesRef,
  ]);
}

export function CandlestickChart({ symbol, candles }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const theme = useAppSelector((s) => s.theme.theme);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const interval = useSignal<MinuteInterval>("1m");
  const smaPeriod = useSignal<number>(DEFAULT_SMA_PERIOD);
  const smaVisible = useSignal<boolean>(true);
  const loadedKeyRef = useRef<string>("");
  const lastBarTimeRef = useRef<number>(0);
  const loadedBarCountRef = useRef<number>(0);
  const fitOnNextTickRef = useRef(false);
  // Set to true once the container has non-zero width (chart is ready to receive data)
  const chartSizedRef = useRef(false);
  // Pending candles to load once the chart has been sized
  const pendingLoadRef = useRef<(() => void) | null>(null);
  const lastSizeRef = useRef({ width: 0, height: 0 });
  useCandlestickChartCanvas(
    containerRef,
    chartRef,
    candleSeriesRef,
    volumeSeriesRef,
    smaSeriesRef,
    chartSizedRef,
    pendingLoadRef,
    loadedBarCountRef,
    lastSizeRef
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: theme is a trigger; getChartTheme reads CSS vars from the DOM
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      chartRef.current?.applyOptions(getChartTheme());
    });
    return () => cancelAnimationFrame(raf);
  }, [theme]);

  useCandlestickData(
    candles,
    interval.value,
    symbol,
    smaPeriod.value,
    smaVisible.value,
    chartRef,
    candleSeriesRef,
    volumeSeriesRef,
    smaSeriesRef,
    chartSizedRef,
    pendingLoadRef,
    loadedKeyRef,
    lastBarTimeRef,
    loadedBarCountRef,
    fitOnNextTickRef
  );

  const raw = getIntervalCandles(candles, interval.value);

  return (
    <div className="relative flex flex-col h-full bg-page" data-testid="candlestick-chart-panel">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-panel shrink-0">
        <div className="flex rounded overflow-hidden border border-divider">
          {INTERVAL_OPTIONS.map((iv) => (
            <button
              key={iv}
              type="button"
              data-testid={`interval-${iv}-tab`}
              onClick={() => {
                interval.value = iv;
              }}
              className={`px-2 py-0.5 text-xs transition-colors ${
                interval.value === iv
                  ? "bg-emerald-700 text-white"
                  : "bg-panel text-label hover:bg-divider"
              }`}
            >
              {iv}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="sma-toggle"
            onClick={() => {
              smaVisible.value = !smaVisible.value;
            }}
            aria-pressed={smaVisible.value}
            className={`px-2 py-0.5 text-xs rounded border transition-colors ${
              smaVisible.value
                ? "bg-amber-700/30 border-amber-600 text-amber-300"
                : "bg-panel border-divider text-muted hover:bg-divider"
            }`}
          >
            SMA
          </button>
          <input
            type="number"
            data-testid="sma-period-input"
            value={smaPeriod.value}
            disabled={!smaVisible.value}
            min={MIN_SMA_PERIOD}
            max={MAX_SMA_PERIOD}
            onChange={(e) => {
              const next = Number.parseInt(e.target.value, 10);
              if (Number.isNaN(next)) return;
              smaPeriod.value = Math.min(MAX_SMA_PERIOD, Math.max(MIN_SMA_PERIOD, next));
            }}
            className="w-12 px-1 py-0.5 text-xs rounded border border-divider bg-panel text-label disabled:opacity-40 tabular-nums"
          />
          {smaVisible.value && raw.length > 0 && raw.length < smaPeriod.value && (
            <span data-testid="sma-insufficient-data" className="text-[10px] text-amber-400">
              needs {smaPeriod.value - raw.length} more bar
              {smaPeriod.value - raw.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {raw.length > 0 && (
          <span className="ml-auto text-[10px] text-muted tabular-nums">{raw.length} bars</span>
        )}
      </div>

      {raw.length === 0 && (
        <div className="absolute inset-0 top-8 flex flex-col items-center justify-center gap-3 pointer-events-none z-10">
          <svg
            aria-label="Loading"
            className="animate-spin w-6 h-6 text-emerald-500/60"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-[11px] text-muted">Collecting {interval.value} candles…</span>
        </div>
      )}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 min-w-0 overflow-hidden"
        data-testid="chart-container"
      />
    </div>
  );
}
