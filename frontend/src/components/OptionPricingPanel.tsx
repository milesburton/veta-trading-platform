import { useState } from "react";
import { useGetQuoteMutation } from "../store/analyticsApi.ts";
import { useAppSelector } from "../store/hooks.ts";
import type { OptionQuoteResponse, OptionType } from "../types/analytics.ts";

const EXPIRY_OPTIONS = [
  { label: "7d", secs: 7 * 86400 },
  { label: "14d", secs: 14 * 86400 },
  { label: "30d", secs: 30 * 86400 },
  { label: "60d", secs: 60 * 86400 },
  { label: "90d", secs: 90 * 86400 },
];

function fmt(n: number, dp = 4): string {
  return n.toFixed(dp);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function GreekRow({ label, value, title }: { label: string; value: string; title: string }) {
  return (
    <div
      className="flex justify-between items-center py-1 border-b border-gray-800 last:border-0"
      title={title}
    >
      <span className="text-gray-500 text-[11px]">{label}</span>
      <span className="text-gray-200 text-[11px] tabular-nums font-mono">{value}</span>
    </div>
  );
}

export function OptionPricingPanel() {
  const symbols = useAppSelector((s) => Object.keys(s.market.assets));
  const [symbol, setSymbol] = useState(symbols[0] ?? "AAPL");
  const [optionType, setOptionType] = useState<OptionType>("call");
  const [strike, setStrike] = useState("");
  const [expirySecs, setExpirySecs] = useState(30 * 86400);
  const [result, setResult] = useState<OptionQuoteResponse | null>(null);

  const [getQuote, { isLoading, error }] = useGetQuoteMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const k = Number(strike);
    if (!k || k <= 0) return;
    try {
      const res = await getQuote({ symbol, optionType, strike: k, expirySecs }).unwrap();
      setResult(res);
    } catch {
      /* error shown below */
    }
  }

  return (
    <div
      className="flex flex-col h-full bg-gray-950 text-gray-300 text-xs"
      data-testid="option-pricing-panel"
    >
      <div className="px-4 py-2.5 border-b border-gray-800 shrink-0">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          Option Pricing — Black-Scholes
        </span>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 px-4 py-3 border-b border-gray-800 shrink-0"
      >
        <div className="grid grid-cols-2 gap-2">
          {/* Symbol */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="op-symbol"
              className="text-[10px] text-gray-500 uppercase tracking-wide"
            >
              Symbol
            </label>
            <select
              id="op-symbol"
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
          </div>

          {/* Option type */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Type</span>
            <div className="flex gap-1">
              {(["call", "put"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  data-testid={t === "call" ? "call-btn" : "put-btn"}
                  onClick={() => setOptionType(t)}
                  className={`flex-1 py-1 rounded text-[11px] font-semibold transition-colors ${
                    optionType === t
                      ? t === "call"
                        ? "bg-emerald-800 text-emerald-200"
                        : "bg-red-900 text-red-200"
                      : "bg-gray-800 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Strike */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="op-strike"
              className="text-[10px] text-gray-500 uppercase tracking-wide"
            >
              Strike ($)
            </label>
            <input
              id="op-strike"
              type="number"
              min="0.01"
              step="0.01"
              value={strike}
              onChange={(e) => setStrike(e.target.value)}
              placeholder="e.g. 150"
              data-testid="strike-input"
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 placeholder:text-gray-600"
            />
          </div>

          {/* Expiry */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="op-expiry"
              className="text-[10px] text-gray-500 uppercase tracking-wide"
            >
              Expiry
            </label>
            <select
              id="op-expiry"
              value={expirySecs}
              onChange={(e) => setExpirySecs(Number(e.target.value))}
              data-testid="expiry-input"
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200"
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.secs} value={o.secs}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || !strike}
          data-testid="get-quote-btn"
          className="w-full py-1.5 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-[11px] font-semibold text-white transition-colors"
        >
          {isLoading ? "Computing…" : "Price Option"}
        </button>

        {error && (
          <div className="text-red-400 text-[10px]">
            Error:{" "}
            {("data" in error ? (error.data as { error?: string })?.error : null) ??
              "Failed to compute"}
          </div>
        )}
      </form>

      {result && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4" data-testid="quote-result">
          {/* Summary */}
          <div className="bg-gray-900 rounded p-3">
            <div className="flex justify-between mb-2">
              <span className="text-[10px] text-gray-500">Theoretical Price</span>
              <span className="text-lg font-bold text-gray-100 tabular-nums font-mono">
                ${fmt(result.price, 4)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[10px]">
              <div>
                <span className="text-gray-500">Spot</span>
                <div className="text-gray-300 tabular-nums font-mono">
                  ${fmt(result.spotPrice, 2)}
                </div>
              </div>
              <div>
                <span className="text-gray-500">Strike</span>
                <div className="text-gray-300 tabular-nums font-mono">${fmt(result.strike, 2)}</div>
              </div>
              <div>
                <span className="text-gray-500">Impl. Vol</span>
                <div className="text-gray-300 tabular-nums font-mono">{pct(result.impliedVol)}</div>
              </div>
            </div>
          </div>

          {/* Greeks */}
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Greeks</div>
            <div className="bg-gray-900 rounded p-3">
              <GreekRow
                label="Δ Delta"
                value={fmt(result.greeks.delta)}
                title="Rate of price change vs spot"
              />
              <GreekRow
                label="Γ Gamma"
                value={fmt(result.greeks.gamma, 6)}
                title="Rate of delta change vs spot"
              />
              <GreekRow
                label="Θ Theta (daily)"
                value={`-${fmt(Math.abs(result.greeks.theta), 4)}`}
                title="Daily time decay"
              />
              <GreekRow
                label="ν Vega (per 1%)"
                value={fmt(result.greeks.vega, 4)}
                title="Price change per 1pp vol move"
              />
              <GreekRow
                label="ρ Rho (per 1%)"
                value={fmt(result.greeks.rho, 4)}
                title="Price change per 1pp rate move"
              />
            </div>
          </div>

          <div className="text-[9px] text-gray-700 text-right">
            Computed {new Date(result.computedAt).toLocaleTimeString()}
          </div>
        </div>
      )}

      {!result && (
        <div className="flex-1 flex items-center justify-center text-gray-700 text-[11px]">
          Enter parameters and click Price Option
        </div>
      )}
    </div>
  );
}
