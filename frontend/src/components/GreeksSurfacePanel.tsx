/**
 * Greeks Surface Panel
 *
 * Visualises delta, gamma, theta, and vega across the strike surface for a
 * given symbol and expiry.  Data from GET /analytics/greeks-surface/:symbol.
 */

import { useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useGetGreeksSurfaceQuery } from "../store/analyticsApi.ts";
import { useAppSelector } from "../store/hooks.ts";

const EXPIRY_PRESETS = [
  { label: "7d", secs: 7 * 86400 },
  { label: "14d", secs: 14 * 86400 },
  { label: "30d", secs: 30 * 86400 },
  { label: "60d", secs: 60 * 86400 },
  { label: "90d", secs: 90 * 86400 },
];

// biome-ignore lint/suspicious/noExplicitAny: recharts tooltip type
function SurfaceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-[10px]">
      <div className="text-gray-400 mb-1">
        K/S = <span className="tabular-nums text-gray-200">{(label as number).toFixed(3)}</span>
      </div>
      {(payload as { name: string; value: number; color: string }[]).map((p) => (
        <div key={p.name} style={{ color: p.color }} className="tabular-nums">
          {p.name}: {p.value >= 0 ? "" : ""}
          {p.value.toFixed(4)}
        </div>
      ))}
    </div>
  );
}

export function GreeksSurfacePanel() {
  const symbols = useAppSelector((s) => s.market.assets.map((a) => a.symbol));
  const [symbol, setSymbol] = useState(symbols[0] ?? "AAPL");
  const [expirySecs, setExpirySecs] = useState(30 * 86400);

  const { data, isFetching, error } = useGetGreeksSurfaceQuery(
    { symbol, expirySecs },
    { skip: !symbol },
  );

  const chartData = data?.strikes.map((pt) => ({
    moneyness: pt.moneyness,
    delta: pt.callDelta,
    "gamma×100": pt.gamma * 100,
    theta: pt.theta,
    vega: pt.vega,
  }));

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-300 text-xs">
      {/* Panel header */}
      <div className="px-4 py-2.5 border-b border-gray-800 shrink-0">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          Greeks Surface
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 shrink-0 flex-wrap">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200"
        >
          {symbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div className="flex gap-1">
          {EXPIRY_PRESETS.map(({ label, secs }) => (
            <button
              key={label}
              type="button"
              onClick={() => setExpirySecs(secs)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                expirySecs === secs
                  ? "bg-blue-700 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isFetching && (
          <span className="text-[10px] text-gray-600 ml-auto">Loading…</span>
        )}
      </div>

      {/* Summary bar */}
      {data && (
        <div className="flex items-center gap-3 px-4 py-1.5 border-b border-gray-800 shrink-0">
          <span className="text-[10px] text-gray-500">
            Spot ${data.spotPrice.toFixed(2)}
          </span>
          <span className="text-[10px] text-gray-500">
            IV {(data.impliedVol * 100).toFixed(1)}%
          </span>
          <span className="text-[10px] text-gray-600">
            {data.strikes.length} strikes
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-red-400 text-[10px] border-b border-gray-800">
          {("data" in error ? (error.data as { error?: string })?.error : null) ?? "Failed to load"}
        </div>
      )}

      {/* Chart */}
      {chartData && chartData.length > 0 ? (
        <div className="flex-1 min-h-0 px-2 py-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 16, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="moneyness"
                type="number"
                domain={["dataMin", "dataMax"]}
                tick={{ fill: "#6b7280", fontSize: 9 }}
                tickFormatter={(v: number) => v.toFixed(2)}
                label={{
                  value: "Moneyness (K/S)",
                  position: "insideBottom",
                  fill: "#4b5563",
                  fontSize: 9,
                  dy: 12,
                }}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 9 }}
                tickFormatter={(v: number) => v.toFixed(2)}
                width={36}
              />
              <Tooltip content={<SurfaceTooltip />} />
              <Legend
                iconSize={8}
                wrapperStyle={{ fontSize: "9px", paddingTop: "4px" }}
              />
              <ReferenceLine x={1.0} stroke="#374151" strokeDasharray="4 2" label={{ value: "ATM", fill: "#6b7280", fontSize: 8 }} />
              <Line dataKey="delta" stroke="#34d399" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              <Line dataKey="gamma×100" stroke="#60a5fa" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              <Line dataKey="theta" stroke="#f87171" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              <Line dataKey="vega" stroke="#a78bfa" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        !isFetching && (
          <div className="flex-1 flex items-center justify-center text-gray-700 text-[11px]">
            {error ? "Could not load surface data" : "Select a symbol to view Greeks surface"}
          </div>
        )
      )}

      {data && (
        <div className="px-4 py-1.5 border-t border-gray-800 shrink-0 text-[9px] text-gray-700">
          {new Date(data.computedAt).toLocaleTimeString()} · For educational use only
        </div>
      )}
    </div>
  );
}
