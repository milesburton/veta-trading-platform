import { useState } from "react";
import { useGetRecommendationsMutation } from "../store/analyticsApi.ts";
import { useAppSelector } from "../store/hooks.ts";
import type { Recommendation, RecommendationResponse, SignalStrength } from "../types/analytics.ts";

const SIGNAL_STYLES: Record<SignalStrength, { badge: string; dot: string }> = {
  STRONG_BUY: {
    badge: "bg-emerald-800/60 text-emerald-200 border border-emerald-700",
    dot: "bg-emerald-400",
  },
  BUY: {
    badge: "bg-emerald-900/40 text-emerald-300 border border-emerald-800",
    dot: "bg-emerald-600",
  },
  NEUTRAL: {
    badge: "bg-gray-800/60 text-gray-400 border border-gray-700",
    dot: "bg-gray-500",
  },
  SELL: {
    badge: "bg-red-900/40 text-red-300 border border-red-800",
    dot: "bg-red-600",
  },
  STRONG_SELL: {
    badge: "bg-red-800/60 text-red-200 border border-red-700",
    dot: "bg-red-400",
  },
};

const REASON_LABELS: Record<string, string> = {
  // Structural rule codes
  DEEP_ITM: "Deep ITM",
  DEEP_OTM: "Deep OTM",
  ATM_HIGH_VOL: "ATM + High Vol",
  LOW_TIME_VALUE: "Low Time Value",
  HIGH_THETA_DECAY: "High Theta",
  POSITIVE_DELTA_TREND: "+Delta Trend",
  NEGATIVE_DELTA_TREND: "-Delta Trend",
  VOL_PREMIUM_ELEVATED: "Vol Premium High",
  VOL_DISCOUNT: "Vol Discount",
  NEAR_EXPIRY_RISK: "Near Expiry",
  WIDE_BID_ASK_PROXY: "Wide Spread",
  FAVOURABLE_RISK_REWARD: "Good R/R",
  // Intelligence feature names
  momentum: "Momentum",
  relativeVolume: "Rel. Volume",
  realisedVol: "Realised Vol",
  sectorRelativeStrength: "Sector RS",
  eventScore: "Event Score",
  newsVelocity: "News Velocity",
  sentimentDelta: "Sentiment Δ",
};

function fmtExpiry(secs: number): string {
  return `${Math.round(secs / 86400)}d`;
}

function ScoreBar({ score }: { score: number }) {
  const pct = ((score + 100) / 200) * 100;
  const color =
    score >= 60
      ? "bg-emerald-500"
      : score >= 20
        ? "bg-emerald-700"
        : score > -20
          ? "bg-gray-600"
          : score > -60
            ? "bg-red-700"
            : "bg-red-500";
  return (
    <div className="relative h-1.5 bg-gray-800 rounded-full w-20">
      <div className="absolute top-0 left-1/2 w-px h-1.5 bg-gray-600" />
      <div
        className={`absolute top-0 h-1.5 rounded-full ${color}`}
        style={{
          left: `${Math.min(50, pct)}%`,
          width: `${Math.abs(pct - 50)}%`,
        }}
      />
    </div>
  );
}

function RecommendationRow({ rec }: { rec: Recommendation }) {
  const [expanded, setExpanded] = useState(false);
  const s = SIGNAL_STYLES[rec.signalStrength];

  // Format reason string: factor contribution codes look like "momentum:+0.123"
  function formatReason(r: string): string {
    if (r.includes(":")) {
      const [name, contrib] = r.split(":");
      return `${REASON_LABELS[name] ?? name} ${contrib}`;
    }
    return REASON_LABELS[r] ?? r;
  }

  return (
    <li className="border-b border-gray-800 last:border-0" data-testid="recommendation-row">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: list row toggle */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: list row toggle */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-900/60 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${s.dot}`} />
        <span
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${s.badge}`}
        >
          {rec.signalStrength.replace("_", " ")}
        </span>
        <span className="text-[11px] text-gray-200 flex-1">
          <span className={rec.optionType === "call" ? "text-emerald-400" : "text-red-400"}>
            {rec.optionType.toUpperCase()}
          </span>{" "}
          ${rec.strike.toFixed(0)} · {fmtExpiry(rec.expirySecs)}
        </span>
        <span className="text-[11px] text-gray-300 tabular-nums font-mono">
          ${rec.price.toFixed(3)}
        </span>
        <ScoreBar score={rec.score} />
        <span className="text-[10px] text-gray-500 tabular-nums w-8 text-right">
          {rec.score > 0 ? "+" : ""}
          {rec.score.toFixed(0)}
        </span>
        <span className="text-gray-600 text-xs ml-1">{expanded ? "▾" : "▸"}</span>
      </div>

      {expanded && (
        <div className="px-4 pb-3 bg-gray-900/30">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-2 pt-2">
            <div className="text-[10px] text-gray-500">Δ {rec.greeks.delta.toFixed(3)}</div>
            <div className="text-[10px] text-gray-500">Γ {rec.greeks.gamma.toFixed(5)}</div>
            <div className="text-[10px] text-gray-500">Θ {rec.greeks.theta.toFixed(4)}/day</div>
            <div className="text-[10px] text-gray-500">ν {rec.greeks.vega.toFixed(4)}/1%</div>
            <div className="text-[10px] text-gray-500">
              Vol {(rec.impliedVol * 100).toFixed(1)}%
            </div>
            {rec.scoringMode && (
              <div className="text-[10px]">
                <span
                  className={`px-1 py-0.5 rounded text-[8px] ${
                    rec.scoringMode === "signal-driven"
                      ? "bg-blue-900/40 text-blue-400"
                      : "bg-gray-800 text-gray-500"
                  }`}
                >
                  {rec.scoringMode}
                </span>
              </div>
            )}
          </div>
          {rec.scoringMode === "signal-driven" && rec.signalScore !== undefined && (
            <div className="text-[9px] text-gray-500 mb-2">
              Signal: {rec.signalScore >= 0 ? "+" : ""}
              {rec.signalScore.toFixed(3)} ·{" "}
              <span className="capitalize">{rec.signalDirection}</span> · conf{" "}
              {((rec.signalConfidence ?? 0) * 100).toFixed(0)}%
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {rec.reasons.map((r) => (
              <span
                key={r}
                className={`text-[9px] px-1.5 py-0.5 rounded border ${
                  r.includes(":") && r.includes("+")
                    ? "bg-emerald-900/30 text-emerald-400 border-emerald-800"
                    : r.includes(":") && r.includes("-")
                      ? "bg-red-900/30 text-red-400 border-red-800"
                      : "bg-gray-800 text-gray-500 border-gray-700"
                }`}
              >
                {formatReason(r)}
              </span>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

export function TradeRecommendationPanel() {
  const symbols = useAppSelector((s) => s.market.assets.map((a) => a.symbol));
  const [symbol, setSymbol] = useState(symbols[0] ?? "AAPL");
  const [result, setResult] = useState<RecommendationResponse | null>(null);
  const [filterStrength, setFilterStrength] = useState<SignalStrength | "ALL">("ALL");

  const signal = useAppSelector((s) => s.intelligence.signals[symbol]);

  const [getRecommendations, { isLoading, error }] = useGetRecommendationsMutation();

  async function handleFetch() {
    try {
      const res = await getRecommendations({
        symbol,
        ...(signal
          ? {
              signal: {
                score: signal.score,
                direction: signal.direction,
                confidence: signal.confidence,
                factors: signal.factors,
              },
            }
          : {}),
      }).unwrap();
      setResult(res);
      setFilterStrength("ALL");
    } catch {
      /* error shown below */
    }
  }

  const filtered = result
    ? filterStrength === "ALL"
      ? result.recommendations
      : result.recommendations.filter((r) => r.signalStrength === filterStrength)
    : [];

  const signalColor =
    signal?.direction === "long"
      ? "text-emerald-400"
      : signal?.direction === "short"
        ? "text-red-400"
        : "text-gray-400";

  return (
    <div
      className="flex flex-col h-full bg-gray-950 text-gray-300 text-xs"
      data-testid="recommendation-panel"
    >
      <div className="px-4 py-2.5 border-b border-gray-800 shrink-0">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          Trade Recommendations
        </span>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 shrink-0">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 flex-1"
        >
          {symbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleFetch}
          disabled={isLoading}
          data-testid="refresh-recommendations-btn"
          className="px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-[11px] font-semibold text-white transition-colors shrink-0"
        >
          {isLoading ? "Analysing…" : "Analyse"}
        </button>
      </div>

      {/* Live signal context banner */}
      {signal && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-900/50 border-b border-gray-800 shrink-0">
          <span className="text-[9px] text-gray-600 uppercase tracking-wide shrink-0">Signal</span>
          <span className={`text-[11px] font-mono tabular-nums ${signalColor}`}>
            {signal.score >= 0 ? "+" : ""}
            {signal.score.toFixed(3)}
          </span>
          <span className={`text-[9px] capitalize ${signalColor}`}>{signal.direction}</span>
          <span className="text-[9px] text-gray-600">
            conf {(signal.confidence * 100).toFixed(0)}%
          </span>
          <div className="ml-auto flex gap-1 flex-wrap">
            {[...signal.factors]
              .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
              .slice(0, 3)
              .map((f) => (
                <span
                  key={f.name}
                  className={`text-[8px] px-1 py-0.5 rounded ${
                    f.contribution > 0
                      ? "bg-emerald-900/40 text-emerald-400"
                      : "bg-red-900/40 text-red-400"
                  }`}
                >
                  {REASON_LABELS[f.name] ?? f.name}: {f.contribution > 0 ? "+" : ""}
                  {f.contribution.toFixed(3)}
                </span>
              ))}
          </div>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 text-red-400 text-[10px] border-b border-gray-800">
          Error:{" "}
          {("data" in error ? (error.data as { error?: string })?.error : null) ?? "Failed to load"}
        </div>
      )}

      {result && (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 shrink-0">
            <span className="text-[10px] text-gray-500">
              Spot ${result.spotPrice.toFixed(2)} · Vol {(result.impliedVol * 100).toFixed(1)}%
            </span>
            <span className="text-[10px] text-gray-600">
              {result.recommendations.length} options
            </span>
          </div>

          {/* Filter */}
          <div className="flex gap-1 px-4 py-1.5 border-b border-gray-800 shrink-0 flex-wrap">
            {(["ALL", "STRONG_BUY", "BUY", "NEUTRAL", "SELL", "STRONG_SELL"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilterStrength(f)}
                className={`text-[9px] px-2 py-0.5 rounded transition-colors ${
                  filterStrength === f
                    ? "bg-gray-700 text-gray-100"
                    : "text-gray-600 hover:text-gray-400"
                }`}
              >
                {f === "ALL" ? "All" : f.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-gray-600 text-[11px]">
                No recommendations match this filter
              </div>
            ) : (
              <ul className="list-none m-0 p-0">
                {filtered.map((rec) => (
                  <RecommendationRow
                    key={`${rec.optionType}-${rec.strike}-${rec.expirySecs}`}
                    rec={rec}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="px-4 py-1.5 border-t border-gray-800 shrink-0 text-[9px] text-gray-700">
            {new Date(result.computedAt).toLocaleTimeString()} ·{" "}
            {signal ? "Signal-driven scoring" : "Rule-based scoring"} · For educational use only
          </div>
        </>
      )}

      {!result && !isLoading && (
        <div className="flex-1 flex items-center justify-center text-gray-700 text-[11px]">
          Select a symbol and click Analyse
        </div>
      )}
    </div>
  );
}
