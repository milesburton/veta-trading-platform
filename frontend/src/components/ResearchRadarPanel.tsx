/**
 * Research Radar Panel
 *
 * Bubble chart of all tracked symbols — X axis = signal score, Y axis = confidence,
 * bubble size = news velocity, colour = direction (long/short/neutral).
 * Clicking a bubble broadcasts the symbol on the outgoing channel.
 */

import { useMemo } from "react";
import { useChannelOut } from "../hooks/useChannelOut.ts";
import { useAppSelector } from "../store/hooks.ts";

const DIR_COLOUR: Record<string, string> = {
  long: "#34d399",
  short: "#f87171",
  neutral: "#9ca3af",
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function ResearchRadarPanel() {
  const signals = useAppSelector((s) => s.intelligence.signals);
  const features = useAppSelector((s) => s.intelligence.features);
  const broadcast = useChannelOut();

  const symbols = Object.keys(signals);

  const entries = useMemo(() => {
    return symbols.map((sym) => {
      const sig = signals[sym];
      const fv = features[sym];
      return {
        symbol: sym,
        score: sig.score,
        confidence: sig.confidence,
        direction: sig.direction,
        newsVelocity: fv?.newsVelocity ?? 0,
      };
    });
  }, [symbols, signals, features]);

  const W = 100;
  const H = 100;
  const PAD = 8;
  const plotW = W - 2 * PAD;
  const plotH = H - 2 * PAD;

  function toX(score: number) {
    return PAD + ((score + 1) / 2) * plotW;
  }
  function toY(confidence: number) {
    return PAD + (1 - confidence) * plotH;
  }
  function toR(newsVelocity: number) {
    return clamp(1 + newsVelocity * 0.4, 1, 4);
  }

  if (entries.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-xs">
        Waiting for signal data…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-950 text-gray-100">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-800 text-xs text-gray-400 shrink-0">
        <span className="text-gray-300 font-medium">Signal Radar</span>
        <span className="ml-auto">{entries.length} symbols</span>
        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Long
        <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Short
        <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> Neutral
      </div>

      <div className="flex-1 min-h-0 p-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-full"
          aria-label="Signal radar scatter chart"
        >
          <line x1={W / 2} y1={PAD} x2={W / 2} y2={H - PAD} stroke="#374151" strokeWidth="0.3" />
          <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="#374151" strokeWidth="0.3" />
          <text x={PAD} y={H - 1} fill="#6b7280" fontSize="3">
            Short
          </text>
          <text x={W - PAD - 6} y={H - 1} fill="#6b7280" fontSize="3">
            Long
          </text>
          <text x={1} y={PAD + 2} fill="#6b7280" fontSize="3">
            High conf
          </text>
          {entries.map((e) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: SVG g is not a static HTML element
            <g
              key={e.symbol}
              style={{ cursor: "pointer" }}
              onClick={() => broadcast({ selectedAsset: e.symbol })}
              onKeyDown={(ev) => ev.key === "Enter" && broadcast({ selectedAsset: e.symbol })}
              tabIndex={0}
            >
              <circle
                data-symbol={e.symbol}
                cx={toX(e.score)}
                cy={toY(e.confidence)}
                r={toR(e.newsVelocity)}
                fill={DIR_COLOUR[e.direction] ?? "#9ca3af"}
                fillOpacity={0.75}
                stroke="#1f2937"
                strokeWidth="0.3"
              />
              {toR(e.newsVelocity) >= 2.5 && (
                <text
                  x={toX(e.score)}
                  y={toY(e.confidence) + 1.2}
                  textAnchor="middle"
                  fill="#f9fafb"
                  fontSize="2"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {e.symbol}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

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
            {[...entries]
              .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
              .slice(0, 10)
              .map((e) => (
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
