/**
 * Instrument Analysis Panel
 *
 * Deep-dive for the symbol received on the incoming channel:
 *  - 7 feature bars (z-score normalised across all tracked symbols)
 *  - Signal direction + score header
 *  - Backtest replay as dual-axis Recharts ComposedChart
 */

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Line,
  YAxis,
  XAxis,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
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

const FEATURE_KEYS = Object.keys(FEATURE_LABELS);

function FeatureBar({ name, value, zScore }: { name: string; value: number; zScore: number }) {
  const normalised = Math.max(-1, Math.min(1, zScore));
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

// biome-ignore lint/suspicious/noExplicitAny: recharts tooltip type
function ReplayTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const score = payload.find((p: { dataKey: string }) => p.dataKey === "score");
  const price = payload.find((p: { dataKey: string }) => p.dataKey === "close");
  return (
    <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[10px]">
      <div className="text-gray-500 mb-0.5">{new Date(label).toLocaleTimeString()}</div>
      {price && (
        <div className="text-gray-300">
          Price: <span className="tabular-nums">${(price.value as number).toFixed(2)}</span>
        </div>
      )}
      {score && (
        <div style={{ color: (score.value as number) >= 0 ? "#34d399" : "#f87171" }}>
          Score:{" "}
          <span className="tabular-nums">
            {(score.value as number) >= 0 ? "+" : ""}
            {(score.value as number).toFixed(3)}
          </span>
        </div>
      )}
    </div>
  );
}

export function InstrumentAnalysisPanel() {
  const channelData = useChannelIn();
  const symbol = channelData?.selectedAsset ?? "";
  const signal = useAppSelector((s) => (symbol ? s.intelligence.signals[symbol] : undefined));
  const fv = useAppSelector((s) => (symbol ? s.intelligence.features[symbol] : undefined));

  // All features across all symbols for cross-symbol z-score normalisation
  const allFeatures = useAppSelector((s) => s.intelligence.features);

  const [replayLoading, setReplayLoading] = useState(false);
  const [replayFrames, setReplayFrames] = useState<ReplayFrame[] | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);

  const GATEWAY =
    (import.meta as { env: Record<string, string> }).env.VITE_GATEWAY_URL ?? "/api/gateway";

  // Compute per-feature mean and std across all tracked symbols
  const featureStats = useMemo(() => {
    const symbols = Object.keys(allFeatures);
    const stats: Record<string, { mean: number; std: number }> = {};
    for (const key of FEATURE_KEYS) {
      const vals = symbols
        .map((s) => (allFeatures[s] as unknown as Record<string, number>)[key])
        .filter((v) => typeof v === "number" && Number.isFinite(v));
      if (vals.length === 0) {
        stats[key] = { mean: 0, std: 1 };
        continue;
      }
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
      stats[key] = { mean, std: Math.sqrt(variance) || 1 };
    }
    return stats;
  }, [allFeatures]);

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

  // Build chart data: ts, close, score
  const chartData = replayFrames?.map((f) => ({
    ts: f.ts,
    close: f.close,
    score: f.signal.score,
  }));

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
          FEATURE_KEYS.map((k) => {
            const raw = (fv as unknown as Record<string, number>)[k] ?? 0;
            const { mean, std } = featureStats[k] ?? { mean: 0, std: 1 };
            return (
              <FeatureBar key={k} name={k} value={raw} zScore={(raw - mean) / std} />
            );
          })
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

        {chartData && chartData.length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] text-gray-500 mb-1">{chartData.length} frames</div>
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="ts"
                  hide
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  scale="time"
                />
                {/* Left Y: signal score */}
                <YAxis
                  yAxisId="score"
                  domain={[-1, 1]}
                  tick={{ fill: "#60a5fa", fontSize: 9 }}
                  width={30}
                  tickFormatter={(v: number) => v.toFixed(1)}
                />
                {/* Right Y: price */}
                <YAxis
                  yAxisId="price"
                  orientation="right"
                  tick={{ fill: "#9ca3af", fontSize: 9 }}
                  width={38}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                />
                <Tooltip content={<ReplayTooltip />} />
                <ReferenceLine yAxisId="score" y={0} stroke="#374151" strokeDasharray="3 3" />
                <Line
                  yAxisId="score"
                  dataKey="score"
                  stroke="#60a5fa"
                  dot={false}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="price"
                  dataKey="close"
                  stroke="#6b7280"
                  dot={false}
                  strokeWidth={1}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-1 text-[9px] text-gray-600">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-px bg-blue-400" /> Signal score (left)
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-px bg-gray-500" /> Price (right)
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 shrink-0">
        <AdvisoryPanel symbol={symbol} />
      </div>
    </div>
  );
}
