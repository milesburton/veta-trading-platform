/**
 * Volatility Profile Panel
 *
 * Shows an EWMA volatility trend over time for the selected symbol,
 * with a reference line at the rolling vol baseline.
 * Auto-polls every 60 seconds via RTK Query.
 */

import { useSignal } from "@preact/signals-react";
import { useGetVolProfileQuery } from "@veta/frontend/store/analyticsApi.ts";
import { useAppSelector } from "@veta/frontend/store/hooks.ts";
import { selectSymbols } from "@veta/frontend/store/selectors.ts";
import { COLOR } from "@veta/frontend/tokens.ts";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TooltipPayloadItem {
  name: string;
  value: number;
  dataKey: string;
  color?: string;
}
function VolTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const vol = payload[0]?.value as number | undefined;
  return (
    <div className="bg-surface border border-divider rounded px-2 py-1.5 text-[10px]">
      <div className="text-muted mb-0.5">{new Date(label as number).toLocaleTimeString()}</div>
      {vol !== undefined && (
        <div className="text-blue-400 tabular-nums">EWMA Vol: {(vol * 100).toFixed(2)}%</div>
      )}
    </div>
  );
}

export function VolatilityProfilePanel() {
  const symbols = useAppSelector(selectSymbols);
  const symbol = useSignal(symbols[0] ?? "AAPL");

  const { data, isFetching, error } = useGetVolProfileQuery(symbol.value, {
    skip: !symbol.value,
    pollingInterval: 60_000,
  });

  const chartData = data?.series.map((pt) => ({
    ts: pt.ts,
    vol: pt.vol,
  }));

  return (
    <div className="flex flex-col h-full bg-page text-default text-xs">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-panel shrink-0">
        <span className="text-[11px] font-semibold text-label uppercase tracking-wide">
          Volatility Profile
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-panel shrink-0">
        <select
          aria-label="Symbol"
          value={symbol.value}
          onChange={(e) => {
            symbol.value = e.target.value;
          }}
          className="bg-panel border border-divider rounded px-2 py-1 text-[11px] text-secondary flex-1"
        >
          {symbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {isFetching && <span className="text-[10px] text-subtle">Refreshing…</span>}
      </div>

      {/* Summary */}
      {data && (
        <div className="flex items-center gap-4 px-4 py-1.5 border-b border-panel shrink-0">
          <div>
            <span className="text-[9px] text-subtle uppercase tracking-wide mr-1">EWMA</span>
            <span className="text-[13px] font-mono font-semibold text-blue-400 tabular-nums">
              {(data.ewmaVol * 100).toFixed(2)}%
            </span>
          </div>
          <div>
            <span className="text-[9px] text-subtle uppercase tracking-wide mr-1">Rolling</span>
            <span className="text-[11px] font-mono text-label tabular-nums">
              {(data.rollingVol * 100).toFixed(2)}%
            </span>
          </div>
          {data.spotPrice !== null && (
            <div className="ml-auto text-[10px] text-subtle">Spot ${data.spotPrice.toFixed(2)}</div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-red-400 text-[10px] border-b border-panel">
          {("data" in error ? (error.data as { error?: string })?.error : null) ?? "Failed to load"}
        </div>
      )}

      {/* Chart */}
      {chartData && chartData.length > 0 ? (
        <div className="flex-1 min-h-0 px-2 py-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 16, bottom: 16, left: -8 }}>
              <defs>
                <linearGradient id="volGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLOR.LIMIT} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={COLOR.LIMIT} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLOR.CHART_GRID} />
              <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} scale="time" hide />
              <YAxis
                tick={{ fill: COLOR.CHART_AXIS, fontSize: 9 }}
                tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                width={40}
              />
              <Tooltip content={<VolTooltip />} />
              {data && (
                <ReferenceLine
                  y={data.rollingVol}
                  stroke={COLOR.CHART_AXIS}
                  strokeDasharray="4 2"
                  label={{
                    value: `Rolling ${(data.rollingVol * 100).toFixed(1)}%`,
                    fill: COLOR.CHART_AXIS,
                    fontSize: 8,
                    position: "insideTopRight",
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="vol"
                stroke={COLOR.LIMIT}
                strokeWidth={1.5}
                fill="url(#volGradient)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        !isFetching && (
          <div className="flex-1 flex items-center justify-center text-divider text-[11px]">
            {error ? "Could not load volatility data" : "Select a symbol to view vol profile"}
          </div>
        )
      )}

      {data && (
        <div className="px-4 py-1.5 border-t border-panel shrink-0 text-[9px] text-divider">
          {new Date(data.computedAt).toLocaleTimeString()} · EWMA λ=0.94 · Auto-refreshes every 60s
        </div>
      )}
    </div>
  );
}
