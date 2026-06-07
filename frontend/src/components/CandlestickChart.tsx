import { useSignal } from "@preact/signals-react";
import { useAppSelector } from "@veta/frontend/store/hooks.ts";
import { COLOR } from "@veta/frontend/tokens.ts";
import type { OhlcCandle } from "@veta/frontend/types.ts";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  HistogramSeries,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

type MinuteInterval = `${number}m`;

const INTERVAL_OPTIONS: MinuteInterval[] = Array.from(
  { length: 15 },
  (_, i) => `${i + 1}m` as MinuteInterval
);
const CANDLE_BAR_SPACING = 8;

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

function setFixedBarSpacing(chart: IChartApi) {
  chart.timeScale().applyOptions({
    barSpacing: CANDLE_BAR_SPACING,
    minBarSpacing: CANDLE_BAR_SPACING,
    rightOffset: 0,
    lockVisibleTimeRangeOnResize: true,
  });
}

export function CandlestickChart({ symbol, candles }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const theme = useAppSelector((s) => s.theme.theme);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const interval = useSignal<MinuteInterval>("1m");
  const loadedKeyRef = useRef<string>("");
  const lastBarTimeRef = useRef<number>(0);
  const loadedBarCountRef = useRef<number>(0);
  const fitOnNextTickRef = useRef(false);
  // Set to true once the container has non-zero width (chart is ready to receive data)
  const chartSizedRef = useRef(false);
  // Pending candles to load once the chart has been sized
  const pendingLoadRef = useRef<(() => void) | null>(null);
  const lastSizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...getChartTheme(),
      autoSize: false,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: COLOR.UP,
      downColor: COLOR.DOWN,
      borderUpColor: COLOR.UP,
      borderDownColor: COLOR.DOWN,
      wickUpColor: COLOR.UP,
      wickDownColor: COLOR.DOWN,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: COLOR.UP,
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    setFixedBarSpacing(chart);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const ro = new ResizeObserver((entries) => {
      const { width = 0, height = 0 } = entries[0]?.contentRect ?? {};
      if (width <= 0 || height <= 0) return;

      const nextWidth = Math.max(1, Math.floor(width));
      const nextHeight = Math.max(1, Math.floor(height));
      const lastSize = lastSizeRef.current;
      if (lastSize.width !== nextWidth || lastSize.height !== nextHeight) {
        lastSizeRef.current = { width: nextWidth, height: nextHeight };
        chart.resize(nextWidth, nextHeight);
        setFixedBarSpacing(chart);
      }

      if (!chartSizedRef.current) {
        chartSizedRef.current = true;
        if (pendingLoadRef.current) {
          pendingLoadRef.current();
          pendingLoadRef.current = null;
        }
      } else if (loadedBarCountRef.current > 0) {
        chartRef.current?.timeScale().fitContent();
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
        chart.resize(nextWidth, nextHeight);
        setFixedBarSpacing(chart);
      }
    });

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: theme is a trigger; getChartTheme reads CSS vars from the DOM
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      chartRef.current?.applyOptions(getChartTheme());
    });
    return () => cancelAnimationFrame(raf);
  }, [theme]);

  useEffect(() => {
    const cs = candleSeriesRef.current;
    const vs = volumeSeriesRef.current;
    if (!cs || !vs) return;

    const intervalMinutes = Number.parseInt(interval.value, 10);
    const raw =
      interval.value === "1m"
        ? candles["1m"]
        : interval.value === "5m"
          ? candles["5m"]
          : aggregateCandles(candles["1m"], intervalMinutes);
    if (raw.length === 0) return;

    const newKey = `${symbol}:${interval.value}`;
    const isNewSeries = loadedKeyRef.current !== newKey;
    const last = raw[raw.length - 1];
    const lastTime = last.time;
    // Full replace when: new series, time went backwards, or bar count jumped
    // (the last case catches a seed arriving after a few live-tick bars were loaded)
    const isFullReplace =
      isNewSeries ||
      lastTime < lastBarTimeRef.current ||
      raw.length > loadedBarCountRef.current + 1;

    function doLoad() {
      if (isFullReplace) {
        cs?.setData(raw.map(toBarData));
        vs?.setData(raw.map(toVolData));
        loadedKeyRef.current = newKey;
        lastBarTimeRef.current = lastTime;
        loadedBarCountRef.current = raw.length;
        fitOnNextTickRef.current = true;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const chartInstance = chartRef.current;
            chartInstance?.timeScale().fitContent();
            if (chartInstance) setFixedBarSpacing(chartInstance);
          })
        );
      } else {
        cs?.update(toBarData(last));
        vs?.update(toVolData(last));
        lastBarTimeRef.current = lastTime;
        loadedBarCountRef.current = raw.length;
        if (fitOnNextTickRef.current) {
          fitOnNextTickRef.current = false;
          requestAnimationFrame(() => {
            const chartInstance = chartRef.current;
            chartInstance?.timeScale().fitContent();
            if (chartInstance) setFixedBarSpacing(chartInstance);
          });
        }
      }
    }

    if (!chartSizedRef.current) {
      pendingLoadRef.current = doLoad;
    } else {
      doLoad();
    }
  }, [candles, interval.value, symbol]);

  const intervalMinutes = Number.parseInt(interval.value, 10);
  const raw =
    interval.value === "1m"
      ? candles["1m"]
      : interval.value === "5m"
        ? candles["5m"]
        : aggregateCandles(candles["1m"], intervalMinutes);

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
