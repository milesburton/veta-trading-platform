import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useGetQuoteMutation } from "../store/analyticsApi.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { setOptionPrefill } from "../store/uiSlice.ts";
import type { OptionQuoteResponse, OptionType } from "../types/analytics.ts";

function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + 0.3275911 * Math.abs(x));
  const y =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return 0.5 * (1.0 + sign * (1.0 - y * Math.exp(-x * x)));
}

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function bsGreeks(
  type: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number
): { delta: number; gamma: number; theta: number; vega: number } {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const nd1 = normPdf(d1);
  const discount = Math.exp(-r * T);

  const delta = type === "call" ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = nd1 / (S * sigma * sqrtT);
  const theta =
    (-(S * nd1 * sigma) / (2 * sqrtT) -
      r * K * discount * (type === "call" ? normCdf(d2) : 1 - normCdf(d2))) /
    365;
  const vega = (S * sqrtT * nd1) / 100;
  return { delta, gamma, theta, vega };
}

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

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  fontSize: 9,
  padding: "4px 8px",
};

export function OptionPricingPanel() {
  const symbols = useAppSelector((s) => s.market.assets.map((a) => a.symbol));
  const [symbol, setSymbol] = useState(symbols[0] ?? "AAPL");
  const [optionType, setOptionType] = useState<OptionType>("call");
  const [strike, setStrike] = useState("");
  const [expirySecs, setExpirySecs] = useState(30 * 86400);
  const [customDate, setCustomDate] = useState("");
  const [result, setResult] = useState<OptionQuoteResponse | null>(null);

  const [getQuote, { isLoading, error }] = useGetQuoteMutation();
  const dispatch = useAppDispatch();

  const currentPrice = useAppSelector((s) => s.market.prices[symbol]);
  useEffect(() => {
    if (currentPrice && currentPrice > 0) {
      setStrike(currentPrice.toFixed(2));
    }
  }, [currentPrice]);

  const optionPrefill = useAppSelector((s) => s.ui.optionPrefill);
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — consume once and clear
  useEffect(() => {
    if (optionPrefill) {
      setStrike(optionPrefill.strike.toFixed(2));
      setExpirySecs(optionPrefill.expirySecs);
      setCustomDate("");
      dispatch(setOptionPrefill(null));
    }
  }, [optionPrefill]);

  function handleCustomDate(dateStr: string) {
    setCustomDate(dateStr);
    if (!dateStr) return;
    const days = Math.max(1, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000));
    setExpirySecs(days * 86400);
  }

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

  const sensitivityData = useMemo(() => {
    if (!result) return [];
    const T = result.expirySecs / (365 * 86400);
    const r = 0.05;
    return Array.from({ length: 25 }, (_, i) => {
      const S = result.spotPrice * (0.7 + i * (0.6 / 24));
      const { delta, gamma, theta, vega } = bsGreeks(
        result.optionType,
        S,
        result.strike,
        T,
        r,
        result.impliedVol
      );
      return {
        spot: S.toFixed(1),
        delta: +delta.toFixed(4),
        "gamma×100": +(gamma * 100).toFixed(5),
        theta: +theta.toFixed(5),
        vega: +vega.toFixed(4),
      };
    });
  }, [result]);

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

          <div className="flex flex-col gap-1">
            <label
              htmlFor="op-strike"
              className="text-[10px] text-gray-500 uppercase tracking-wide"
            >
              Strike ($){" "}
              {currentPrice ? (
                <span className="text-gray-600 normal-case">(spot {currentPrice.toFixed(2)})</span>
              ) : null}
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

          <div className="flex flex-col gap-1">
            <label
              htmlFor="op-expiry-date"
              className="text-[10px] text-gray-500 uppercase tracking-wide"
            >
              Expiry
            </label>
            <div className="flex gap-1 flex-wrap">
              {EXPIRY_OPTIONS.map((o) => (
                <button
                  key={o.secs}
                  type="button"
                  onClick={() => {
                    setExpirySecs(o.secs);
                    setCustomDate("");
                  }}
                  className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                    expirySecs === o.secs && !customDate
                      ? "bg-blue-700 text-white"
                      : "bg-gray-800 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <input
              id="op-expiry-date"
              type="date"
              value={customDate}
              onChange={(e) => handleCustomDate(e.target.value)}
              data-testid="expiry-input"
              className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-gray-200 mt-0.5"
            />
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

          {sensitivityData.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">
                Greeks vs Spot (±30%)
              </div>
              <ResponsiveContainer width="100%" height={170}>
                <LineChart
                  data={sensitivityData}
                  margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="spot" tick={{ fontSize: 8, fill: "#6b7280" }} interval={4} />
                  <YAxis tick={{ fontSize: 8, fill: "#6b7280" }} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(val: number, name: string) => [val.toFixed(5), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 8, paddingTop: 4 }} />
                  <Line
                    type="monotone"
                    dataKey="delta"
                    stroke="#34d399"
                    dot={false}
                    strokeWidth={1.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="gamma×100"
                    stroke="#60a5fa"
                    dot={false}
                    strokeWidth={1.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="theta"
                    stroke="#f87171"
                    dot={false}
                    strokeWidth={1.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="vega"
                    stroke="#a78bfa"
                    dot={false}
                    strokeWidth={1.5}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="text-[9px] text-gray-700 text-right">
            Computed {new Date(result.computedAt).toLocaleTimeString()} · EWMA vol
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
