/**
 * Price Fan Panel — GBM forward price projection
 *
 * Shows Monte Carlo confidence bands (p5/p25/p50/p75/p95) for a selected
 * equity symbol over a chosen horizon.  Auto-refreshes every 60 seconds.
 */

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useGetPriceFanQuery } from "../store/analyticsApi.ts";

// ── Horizon presets ──────────────────────────────────────────────────────────

interface HorizonPreset {
  label: string;
  steps: number;
  stepSecs: number;
}

const HORIZONS: HorizonPreset[] = [
  { label: "1h", steps: 6, stepSecs: 600 },
  { label: "4h", steps: 8, stepSecs: 1800 },
  { label: "1d", steps: 24, stepSecs: 3600 },
  { label: "1w", steps: 7, stepSecs: 86400 },
];

function formatStepLabel(tSecs: number, stepSecs: number): string {
  const total = tSecs;
  if (stepSecs >= 86400) return `+${Math.round(total / 86400)}d`;
  if (stepSecs >= 3600) return `+${Math.round(total / 3600)}h`;
  return `+${Math.round(total / 60)}m`;
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function PriceFanPanel() {
  const [symbol, setSymbol] = useState("AAPL");
  const [inputValue, setInputValue] = useState("AAPL");
  const [horizonIdx, setHorizonIdx] = useState(2); // default "1d"

  const horizon = HORIZONS[horizonIdx];

  const { data, isFetching, isError } = useGetPriceFanQuery(
    { symbol, steps: horizon.steps, stepSecs: horizon.stepSecs },
    { pollingInterval: 60_000, skip: !symbol }
  );

  function handleSymbolSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inputValue.trim().toUpperCase();
    if (trimmed) setSymbol(trimmed);
  }

  const steps = data?.steps ?? [];
  const spotPrice = data?.spotPrice ?? 0;
  const impliedVol = data?.impliedVol ?? 0;

  // Build chart data: prepend step 0 (spot) so the fan starts at current price
  const chartData = [
    {
      label: "now",
      tSecs: 0,
      p5: spotPrice,
      p25: spotPrice,
      p50: spotPrice,
      p75: spotPrice,
      p95: spotPrice,
    },
    ...steps.map((s) => ({
      label: formatStepLabel(s.tSecs, horizon.stepSecs),
      tSecs: s.tSecs,
      p5: +s.p5.toFixed(2),
      p25: +s.p25.toFixed(2),
      p50: +s.p50.toFixed(2),
      p75: +s.p75.toFixed(2),
      p95: +s.p95.toFixed(2),
    })),
  ];

  // Recharts Area requires [lo, hi] pairs via dataKey for stacked areas.
  // We use a derived dataset with p5, band1 (p25-p5), band2 (p75-p25), band3 (p95-p75).
  const areaData = chartData.map((d) => ({
    label: d.label,
    p5: +d.p5.toFixed(2),
    band1: +(d.p25 - d.p5).toFixed(2), // p5 → p25
    band2: +(d.p75 - d.p25).toFixed(2), // p25 → p75
    band3: +(d.p95 - d.p75).toFixed(2), // p75 → p95
    p50: +d.p50.toFixed(2),
  }));

  const yMin = steps.length > 0 ? Math.min(...steps.map((s) => s.p5)) * 0.995 : undefined;
  const yMax = steps.length > 0 ? Math.max(...steps.map((s) => s.p95)) * 1.005 : undefined;

  return (
    <div className="h-full flex flex-col bg-gray-950 text-gray-200 overflow-hidden text-xs">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 shrink-0 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide shrink-0">
          Price Fan · GBM Projection
        </span>
        <form onSubmit={handleSymbolSubmit} className="flex gap-1 items-center">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
            placeholder="AAPL"
            className="w-20 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-200 font-mono focus:outline-none focus:border-blue-600"
          />
          <button
            type="submit"
            className="text-[10px] px-2 py-0.5 rounded bg-blue-900/40 border border-blue-700/50 text-blue-300 hover:bg-blue-800/50"
          >
            Go
          </button>
        </form>
        <div className="flex gap-1 ml-auto">
          {HORIZONS.map((h, i) => (
            <button
              key={h.label}
              type="button"
              onClick={() => setHorizonIdx(i)}
              className={`text-[10px] px-2 py-0.5 rounded border ${
                i === horizonIdx
                  ? "bg-blue-800/60 border-blue-600 text-blue-200"
                  : "bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-200"
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 px-2 py-2">
        {isError ? (
          <div className="flex items-center justify-center h-full text-red-400 text-[10px]">
            Failed to load fan data for {symbol}
          </div>
        ) : steps.length === 0 && !isFetching ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-[10px]">
            {symbol ? `No data for ${symbol}` : "Enter a symbol"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={areaData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#6b7280" }} />
              <YAxis
                domain={[yMin ?? "auto", yMax ?? "auto"]}
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                tick={{ fontSize: 9, fill: "#6b7280" }}
              />
              <Tooltip
                contentStyle={{
                  background: "#111827",
                  border: "1px solid #374151",
                  borderRadius: 4,
                  fontSize: 9,
                  color: "#d1d5db",
                }}
                formatter={(v: number, name: string) => {
                  if (name === "p50") return [`$${v.toFixed(2)}`, "median"];
                  return [null, null]; // hide band segments from tooltip
                }}
              />
              {/* Stacked areas: p5 base (transparent), then 3 bands */}
              <Area
                dataKey="p5"
                stackId="fan"
                stroke="none"
                fill="transparent"
                isAnimationActive={false}
                legendType="none"
              />
              <Area
                dataKey="band1"
                stackId="fan"
                stroke="none"
                fill="#3b82f6"
                fillOpacity={0.12}
                isAnimationActive={false}
                legendType="none"
              />
              <Area
                dataKey="band2"
                stackId="fan"
                stroke="none"
                fill="#3b82f6"
                fillOpacity={0.22}
                isAnimationActive={false}
                legendType="none"
              />
              <Area
                dataKey="band3"
                stackId="fan"
                stroke="none"
                fill="#3b82f6"
                fillOpacity={0.12}
                isAnimationActive={false}
                legendType="none"
              />
              {/* Median line */}
              <Line
                type="monotone"
                dataKey="p50"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              {/* Current price reference */}
              {spotPrice > 0 && (
                <ReferenceLine
                  y={spotPrice}
                  stroke="#6b7280"
                  strokeDasharray="4 3"
                  strokeWidth={1}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1 border-t border-gray-800 shrink-0 flex items-center gap-3 text-[9px] text-gray-600">
        {data && (
          <>
            <span>Vol: {(impliedVol * 100).toFixed(1)}%</span>
            <span>·</span>
            <span>500 paths</span>
            <span>·</span>
            <span>p5 / p25–p75 / p95 bands</span>
            <span className="ml-auto">{isFetching ? "refreshing…" : "refreshes 60s"}</span>
          </>
        )}
      </div>
    </div>
  );
}
