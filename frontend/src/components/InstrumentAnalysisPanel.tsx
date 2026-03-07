/**
 * Instrument Analysis Panel
 *
 * Deep-dive for the symbol received on the incoming channel:
 *  - 7 feature bars
 *  - Signal direction + score header
 *  - Backtest replay button
 */

import { useState } from "react";
import { useChannelIn } from "../hooks/useChannelIn.ts";
import { useAppSelector } from "../store/hooks.ts";
import { AdvisoryPanel } from "./AdvisoryPanel.tsx";

const FEATURE_LABELS: Record<string, string> = {
  momentum: "Momentum",
  relativeVolume: "Rel. Volume",
  realisedVol: "Realised Vol",
  sectorRelativeStrength: "Sector RS",
  eventScore: "Event Score",
  newsVelocity: "News Vel.",
  sentimentDelta: "Sent. Delta",
};

const FEATURE_SCALES: Record<string, number> = {
  momentum: 0.05,
  relativeVolume: 3.0,
  realisedVol: 0.8,
  sectorRelativeStrength: 0.03,
  eventScore: 2.0,
  newsVelocity: 10,
  sentimentDelta: 1.0,
};

function FeatureBar({ name, value }: { name: string; value: number }) {
  const scale = FEATURE_SCALES[name] ?? 1;
  const normalised = Math.max(-1, Math.min(1, value / scale));
  const isPositive = normalised >= 0;

  return (
    <div className="mb-1">
      <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
        <span>{FEATURE_LABELS[name] ?? name}</span>
        <span className={`tabular-nums ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
          {value.toFixed(4)}
        </span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded overflow-hidden">
        <div
          className="h-full rounded transition-all duration-300"
          style={{
            width: `${Math.abs(normalised) * 50}%`,
            marginLeft: isPositive ? "50%" : `${50 - Math.abs(normalised) * 50}%`,
            backgroundColor: isPositive ? "#34d399" : "#f87171",
          }}
        />
      </div>
    </div>
  );
}

interface ReplayFrame {
  ts: number;
  close: number;
  signal: { score: number; direction: string; confidence: number };
}

export function InstrumentAnalysisPanel() {
  const channelData = useChannelIn();
  const symbol = channelData?.selectedAsset ?? "";
  const signal = useAppSelector((s) => (symbol ? s.intelligence.signals[symbol] : undefined));
  const fv = useAppSelector((s) => (symbol ? s.intelligence.features[symbol] : undefined));

  const [replayLoading, setReplayLoading] = useState(false);
  const [replayFrames, setReplayFrames] = useState<ReplayFrame[] | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);

  const GATEWAY =
    (import.meta as { env: Record<string, string> }).env.VITE_GATEWAY_URL ?? "/api/gateway";

  async function runBacktest() {
    if (!symbol) return;
    setReplayLoading(true);
    setReplayError(null);
    setReplayFrames(null);
    try {
      const to = Date.now();
      const from = to - 4 * 60 * 60 * 1000;
      const res = await fetch(`${GATEWAY}/intelligence/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, from, to }),
      });
      if (!res.ok) throw new Error(await res.text());
      const frames: ReplayFrame[] = await res.json();
      setReplayFrames(frames);
    } catch (err) {
      setReplayError((err as Error).message);
    } finally {
      setReplayLoading(false);
    }
  }

  if (!symbol) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-xs">
        Link to a channel — waiting for symbol selection
      </div>
    );
  }

  const scoreColor =
    signal?.direction === "long"
      ? "text-emerald-400"
      : signal?.direction === "short"
        ? "text-red-400"
        : "text-gray-400";

  return (
    <div className="h-full flex flex-col bg-gray-950 text-gray-100 overflow-auto">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 shrink-0">
        <span className="text-sm font-mono font-bold text-gray-200">{symbol}</span>
        {signal && (
          <>
            <span className={`text-xs font-mono tabular-nums ${scoreColor}`}>
              {signal.score >= 0 ? "+" : ""}
              {signal.score.toFixed(3)}
            </span>
            <span className={`text-xs capitalize px-1.5 py-0.5 rounded ${scoreColor}`}>
              {signal.direction}
            </span>
            <span className="text-xs text-gray-500 ml-auto">
              conf {(signal.confidence * 100).toFixed(0)}%
            </span>
          </>
        )}
      </div>

      <div className="p-3 border-b border-gray-800 shrink-0">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Features</div>
        {fv ? (
          Object.keys(FEATURE_LABELS).map((k) => (
            <FeatureBar
              key={k}
              name={k}
              value={(fv as unknown as Record<string, number>)[k] ?? 0}
            />
          ))
        ) : (
          <div className="text-xs text-gray-600">No feature data yet…</div>
        )}
      </div>

      <div className="p-3 shrink-0">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
          Backtest Replay (last 4h)
        </div>
        <button
          type="button"
          onClick={runBacktest}
          disabled={replayLoading}
          className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors disabled:opacity-50"
        >
          {replayLoading ? "Running…" : "Run Backtest"}
        </button>
        {replayError && <div className="mt-2 text-xs text-red-400">{replayError}</div>}
        {replayFrames && (
          <div className="mt-2 overflow-auto max-h-40">
            <div className="text-[10px] text-gray-500 mb-1">{replayFrames.length} frames</div>
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-0.5">Time</th>
                  <th className="text-right py-0.5">Close</th>
                  <th className="text-right py-0.5">Score</th>
                  <th className="text-left py-0.5 pl-2">Dir</th>
                </tr>
              </thead>
              <tbody>
                {replayFrames.slice(-20).map((f) => {
                  const c =
                    f.signal.direction === "long"
                      ? "#34d399"
                      : f.signal.direction === "short"
                        ? "#f87171"
                        : "#9ca3af";
                  return (
                    <tr key={f.ts} className="border-b border-gray-900">
                      <td className="py-0.5 text-gray-500">
                        {new Date(f.ts).toLocaleTimeString()}
                      </td>
                      <td className="text-right py-0.5 tabular-nums text-gray-300">
                        {f.close.toFixed(2)}
                      </td>
                      <td className="text-right py-0.5 tabular-nums" style={{ color: c }}>
                        {f.signal.score >= 0 ? "+" : ""}
                        {f.signal.score.toFixed(3)}
                      </td>
                      <td className="py-0.5 pl-2 capitalize" style={{ color: c }}>
                        {f.signal.direction}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="p-3 shrink-0">
        <AdvisoryPanel symbol={symbol} />
      </div>
    </div>
  );
}
