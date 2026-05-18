/**
 * Research Radar Panel
 *
 * Scatter chart of all tracked symbols — X = signal score, Y = confidence,
 * bubble size = news velocity, colour = direction (long/short/neutral).
 * Clicking a bubble broadcasts the symbol on the outgoing channel.
 * Filter by direction; sort by score, confidence, or news velocity.
 */

import { useSignal } from "@preact/signals-react";
import { useChannelOut } from "@veta/frontend/hooks/useChannelOut.ts";
import { useAppSelector } from "@veta/frontend/store/hooks.ts";
import { COLOR } from "@veta/frontend/tokens.ts";
import { useMemo } from "react";
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

const DIR_COLOUR: Record<string, string> = {
  get long() {
    return COLOR.UP;
  },
  get short() {
    return COLOR.DOWN;
  },
  get neutral() {
    return COLOR.NEUTRAL;
  },
};

type Direction = "long" | "short" | "neutral";
type SortKey = "score" | "confidence" | "news";

interface Entry {
  symbol: string;
  score: number;
  confidence: number;
  direction: Direction;
  newsVelocity: number;
  // For scatter chart — z maps to bubble size
  z: number;
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  dataKey: string;
  payload?: Entry;
}
function RadarTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as Entry | undefined;
  if (!d) return null;
  return (
    <div className="bg-surface border border-divider rounded px-2 py-1.5 text-[10px]">
      <div className="font-mono font-bold text-secondary mb-0.5">{d.symbol}</div>
      <div style={{ color: DIR_COLOUR[d.direction] }} className="capitalize mb-0.5">
        {d.direction}
      </div>
      <div className="text-label">
        Score:{" "}
        <span className="tabular-nums" style={{ color: DIR_COLOUR[d.direction] }}>
          {d.score >= 0 ? "+" : ""}
          {d.score.toFixed(3)}
        </span>
      </div>
      <div className="text-label">
        Confidence: <span className="tabular-nums">{(d.confidence * 100).toFixed(0)}%</span>
      </div>
      {d.newsVelocity > 0 && (
        <div className="text-muted">
          News vel: <span className="tabular-nums">{d.newsVelocity.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}

export function ResearchRadarPanel() {
  const signals = useAppSelector((s) => s.intelligence.signals);
  const features = useAppSelector((s) => s.intelligence.features);
  const broadcast = useChannelOut();

  const filter = useSignal<Direction | "ALL">("ALL");
  const sort = useSignal<SortKey>("score");

  const allEntries = useMemo<Entry[]>(() => {
    return Object.keys(signals).map((sym) => {
      const sig = signals[sym];
      const fv = features[sym];
      const nv = fv?.newsVelocity ?? 0;
      return {
        symbol: sym,
        score: sig.score,
        confidence: sig.confidence,
        direction: sig.direction as Direction,
        newsVelocity: nv,
        z: Math.max(200, Math.min(1200, 200 + nv * 100)),
      };
    });
  }, [signals, features]);

  const counts = useMemo(
    () => ({
      long: allEntries.filter((e) => e.direction === "long").length,
      short: allEntries.filter((e) => e.direction === "short").length,
      neutral: allEntries.filter((e) => e.direction === "neutral").length,
    }),
    [allEntries]
  );

  const filtered = useMemo(
    () =>
      filter.value === "ALL" ? allEntries : allEntries.filter((e) => e.direction === filter.value),
    [allEntries, filter.value]
  );

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sort.value === "score") return Math.abs(b.score) - Math.abs(a.score);
      if (sort.value === "confidence") return b.confidence - a.confidence;
      return b.newsVelocity - a.newsVelocity;
    });
  }, [filtered, sort.value]);

  if (allEntries.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted text-xs">
        Waiting for signal data…
      </div>
    );
  }

  const FILTER_OPTIONS: { key: Direction | "ALL"; label: string }[] = [
    { key: "ALL", label: `All (${allEntries.length})` },
    { key: "long", label: `Long (${counts.long})` },
    { key: "short", label: `Short (${counts.short})` },
    { key: "neutral", label: `Neutral (${counts.neutral})` },
  ];

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "score", label: "Score" },
    { key: "confidence", label: "Conf" },
    { key: "news", label: "News" },
  ];

  return (
    <div className="h-full flex flex-col bg-page text-primary">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-panel text-xs text-label shrink-0 flex-wrap">
        <span className="text-default font-medium">Signal Radar</span>
        <div className="flex gap-1 ml-auto">
          {FILTER_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                filter.value = key;
              }}
              className={`text-[9px] px-2 py-0.5 rounded transition-colors ${
                filter.value === key ? "bg-divider text-primary" : "text-subtle hover:text-label"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-[9px] text-subtle">
          Sort:
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                sort.value = key;
              }}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                sort.value === key ? "text-default underline" : "hover:text-label"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 px-2 py-1">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLOR.CHART_GRID} />
            <XAxis
              type="number"
              dataKey="score"
              domain={[-1, 1]}
              tick={{ fill: COLOR.CHART_AXIS, fontSize: 9 }}
              tickFormatter={(v: number) => v.toFixed(1)}
              label={{
                value: "Score",
                position: "insideBottom",
                fill: "rgb(var(--gray-600))",
                fontSize: 9,
                dy: 8,
              }}
            />
            <YAxis
              type="number"
              dataKey="confidence"
              domain={[0, 1]}
              tick={{ fill: COLOR.CHART_AXIS, fontSize: 9 }}
              tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              label={{
                value: "Conf",
                angle: -90,
                position: "insideLeft",
                fill: "rgb(var(--gray-600))",
                fontSize: 9,
                dx: 12,
              }}
            />
            <ZAxis type="number" dataKey="z" range={[30, 300]} />
            <ReferenceLine x={0} stroke={COLOR.CHART_TOOLTIP_BORDER} strokeDasharray="3 3" />
            <Tooltip content={<RadarTooltip />} cursor={false} />
            <Scatter
              data={filtered}
              onClick={(d: Entry) => broadcast({ selectedAsset: d.symbol })}
              style={{ cursor: "pointer" }}
              shape={(props: unknown) => {
                const p = props as {
                  cx?: number;
                  cy?: number;
                  r?: number;
                  fill?: string;
                  payload?: Entry;
                };
                const { cx = 0, cy = 0, r = 6, fill = COLOR.NEUTRAL, payload } = p;
                return (
                  <circle
                    data-symbol={payload?.symbol}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={fill}
                    fillOpacity={0.75}
                    stroke={COLOR.CHART_GRID}
                    strokeWidth={0.5}
                  />
                );
              }}
            >
              {filtered.map((entry) => (
                <Cell key={entry.symbol} fill={DIR_COLOUR[entry.direction] ?? COLOR.NEUTRAL} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="shrink-0 border-t border-panel overflow-auto" style={{ maxHeight: "35%" }}>
        <table className="w-full text-[10px] font-mono">
          <thead>
            <tr className="text-muted border-b border-panel">
              <th className="text-left px-2 py-1">Symbol</th>
              <th className="text-right px-2 py-1">Score</th>
              <th className="text-right px-2 py-1">Conf</th>
              <th className="text-left px-2 py-1">Dir</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 10).map((e) => (
              <tr
                key={e.symbol}
                className="border-b border-surface hover:bg-surface cursor-pointer"
                onClick={() => broadcast({ selectedAsset: e.symbol })}
              >
                <td className="px-2 py-0.5 text-default">{e.symbol}</td>
                <td
                  className="text-right px-2 py-0.5 tabular-nums"
                  style={{ color: DIR_COLOUR[e.direction] }}
                >
                  {e.score >= 0 ? "+" : ""}
                  {e.score.toFixed(3)}
                </td>
                <td className="text-right px-2 py-0.5 tabular-nums text-label">
                  {(e.confidence * 100).toFixed(0)}%
                </td>
                <td className="px-2 py-0.5 capitalize" style={{ color: DIR_COLOUR[e.direction] }}>
                  {e.direction}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
