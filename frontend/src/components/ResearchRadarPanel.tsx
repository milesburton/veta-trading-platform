/**
 * Research Radar Panel
 *
 * Scatter chart of all tracked symbols — X = signal score, Y = confidence,
 * bubble size = news velocity, colour = direction (long/short/neutral).
 * Clicking a bubble broadcasts the symbol on the outgoing channel.
 * Filter by direction; sort by score, confidence, or news velocity.
 */

import { useMemo, useState } from "react";
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
import { useChannelOut } from "../hooks/useChannelOut.ts";
import { useAppSelector } from "../store/hooks.ts";

const DIR_COLOUR: Record<string, string> = {
  long: "#34d399",
  short: "#f87171",
  neutral: "#9ca3af",
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

// biome-ignore lint/suspicious/noExplicitAny: recharts tooltip type
function RadarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as Entry | undefined;
  if (!d) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-[10px]">
      <div className="font-mono font-bold text-gray-200 mb-0.5">{d.symbol}</div>
      <div style={{ color: DIR_COLOUR[d.direction] }} className="capitalize mb-0.5">
        {d.direction}
      </div>
      <div className="text-gray-400">
        Score:{" "}
        <span className="tabular-nums" style={{ color: DIR_COLOUR[d.direction] }}>
          {d.score >= 0 ? "+" : ""}
          {d.score.toFixed(3)}
        </span>
      </div>
      <div className="text-gray-400">
        Confidence: <span className="tabular-nums">{(d.confidence * 100).toFixed(0)}%</span>
      </div>
      {d.newsVelocity > 0 && (
        <div className="text-gray-500">
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

  const [filter, setFilter] = useState<Direction | "ALL">("ALL");
  const [sort, setSort] = useState<SortKey>("score");

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
    () => (filter === "ALL" ? allEntries : allEntries.filter((e) => e.direction === filter)),
    [allEntries, filter]
  );

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sort === "score") return Math.abs(b.score) - Math.abs(a.score);
      if (sort === "confidence") return b.confidence - a.confidence;
      return b.newsVelocity - a.newsVelocity;
    });
  }, [filtered, sort]);

  if (allEntries.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-xs">
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
    <div className="h-full flex flex-col bg-gray-950 text-gray-100">
      {/* Header + legend */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-800 text-xs text-gray-400 shrink-0 flex-wrap">
        <span className="text-gray-300 font-medium">Signal Radar</span>
        <div className="flex gap-1 ml-auto">
          {FILTER_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`text-[9px] px-2 py-0.5 rounded transition-colors ${
                filter === key ? "bg-gray-700 text-gray-100" : "text-gray-600 hover:text-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-[9px] text-gray-600">
          Sort:
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                sort === key ? "text-gray-300 underline" : "hover:text-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Scatter chart */}
      <div className="flex-1 min-h-0 px-2 py-1">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              type="number"
              dataKey="score"
              domain={[-1, 1]}
              tick={{ fill: "#6b7280", fontSize: 9 }}
              tickFormatter={(v: number) => v.toFixed(1)}
              label={{
                value: "Score",
                position: "insideBottom",
                fill: "#4b5563",
                fontSize: 9,
                dy: 8,
              }}
            />
            <YAxis
              type="number"
              dataKey="confidence"
              domain={[0, 1]}
              tick={{ fill: "#6b7280", fontSize: 9 }}
              tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              label={{
                value: "Conf",
                angle: -90,
                position: "insideLeft",
                fill: "#4b5563",
                fontSize: 9,
                dx: 12,
              }}
            />
            <ZAxis type="number" dataKey="z" range={[30, 300]} />
            <ReferenceLine x={0} stroke="#374151" strokeDasharray="3 3" />
            <Tooltip content={<RadarTooltip />} cursor={false} />
            <Scatter
              data={filtered}
              onClick={(d: Entry) => broadcast({ selectedAsset: d.symbol })}
              style={{ cursor: "pointer" }}
            >
              {filtered.map((entry) => (
                <Cell
                  key={entry.symbol}
                  fill={DIR_COLOUR[entry.direction] ?? "#9ca3af"}
                  fillOpacity={0.75}
                  stroke="#1f2937"
                  strokeWidth={0.5}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="shrink-0 border-t border-gray-800 overflow-auto" style={{ maxHeight: "35%" }}>
        <table className="w-full text-[10px] font-mono">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
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
                className="border-b border-gray-900 hover:bg-gray-900 cursor-pointer"
                onClick={() => broadcast({ selectedAsset: e.symbol })}
              >
                <td className="px-2 py-0.5 text-gray-300">{e.symbol}</td>
                <td
                  className="text-right px-2 py-0.5 tabular-nums"
                  style={{ color: DIR_COLOUR[e.direction] }}
                >
                  {e.score >= 0 ? "+" : ""}
                  {e.score.toFixed(3)}
                </td>
                <td className="text-right px-2 py-0.5 tabular-nums text-gray-400">
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
