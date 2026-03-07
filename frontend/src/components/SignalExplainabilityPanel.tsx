/**
 * Signal Explainability Panel
 *
 * Waterfall chart showing how each feature factor contributes to the final
 * signal score for the symbol received on the incoming channel.
 */

import { useChannelIn } from "../hooks/useChannelIn.ts";
import { useAppSelector } from "../store/hooks.ts";
import type { SignalFactor } from "../store/intelligenceSlice.ts";

const FEATURE_LABELS: Record<string, string> = {
  momentum: "Momentum",
  relativeVolume: "Rel. Volume",
  realisedVol: "Realised Vol",
  sectorRelativeStrength: "Sector RS",
  eventScore: "Event Score",
  newsVelocity: "News Vel.",
  sentimentDelta: "Sent. Delta",
};

export function SignalExplainabilityPanel() {
  const channelData = useChannelIn();
  const symbol = channelData?.selectedAsset ?? "";
  const signal = useAppSelector((s) => (symbol ? s.intelligence.signals[symbol] : undefined));

  if (!symbol) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-xs">
        Link to a channel — waiting for symbol selection
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-xs">
        No signal data for {symbol}
      </div>
    );
  }

  const maxContrib = Math.max(
    ...signal.factors.map((f: SignalFactor) => Math.abs(f.contribution)),
    0.001
  );
  const sortedFactors = [...signal.factors].sort(
    (a: SignalFactor, b: SignalFactor) => Math.abs(b.contribution) - Math.abs(a.contribution)
  );

  const scoreColor =
    signal.direction === "long"
      ? "text-emerald-400"
      : signal.direction === "short"
        ? "text-red-400"
        : "text-gray-400";

  return (
    <div className="h-full flex flex-col bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 shrink-0 text-xs">
        <span className="font-mono font-bold text-gray-200">{symbol}</span>
        <span className={`font-mono tabular-nums ${scoreColor}`}>
          score {signal.score >= 0 ? "+" : ""}
          {signal.score.toFixed(3)}
        </span>
        <span className="text-gray-500 ml-auto capitalize">{signal.direction}</span>
      </div>

      {/* Waterfall bars */}
      <div className="flex-1 overflow-auto px-3 py-2">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">
          Factor contributions
        </div>
        {sortedFactors.map((f: SignalFactor) => {
          const isPositive = f.contribution >= 0;
          const barPct = (Math.abs(f.contribution) / maxContrib) * 100;
          const colour = isPositive ? "#34d399" : "#f87171";
          const label = FEATURE_LABELS[f.name] ?? f.name;

          return (
            <div key={f.name} className="mb-3">
              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                <span>{label}</span>
                <span className="tabular-nums" style={{ color: colour }}>
                  {isPositive ? "+" : ""}
                  {f.contribution.toFixed(4)}
                </span>
              </div>
              {/* Bar — always centred, extends left or right */}
              <div className="relative h-3 bg-gray-800 rounded overflow-hidden">
                {/* Centre marker */}
                <div className="absolute top-0 bottom-0 w-px bg-gray-600" style={{ left: "50%" }} />
                {/* Contribution bar */}
                <div
                  className="absolute top-0 bottom-0 rounded transition-all duration-300"
                  style={{
                    width: `${barPct / 2}%`,
                    left: isPositive ? "50%" : `${50 - barPct / 2}%`,
                    backgroundColor: colour,
                  }}
                />
              </div>
              {/* Weight indicator */}
              <div className="text-[9px] text-gray-600 mt-0.5">
                weight {f.weight >= 0 ? "+" : ""}
                {f.weight.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Score summary */}
      <div className="shrink-0 border-t border-gray-800 px-3 py-2 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">Final score</span>
          <span className={`font-mono tabular-nums font-bold ${scoreColor}`}>
            {signal.score >= 0 ? "+" : ""}
            {signal.score.toFixed(4)}
          </span>
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-gray-500">Confidence</span>
          <span className="font-mono tabular-nums text-gray-300">
            {(signal.confidence * 100).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
