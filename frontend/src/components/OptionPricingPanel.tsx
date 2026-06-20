import { useSignal } from "@preact/signals-react";
import { useGetQuoteMutation } from "@veta/frontend/store/analyticsApi.ts";
import { useAppDispatch, useAppSelector } from "@veta/frontend/store/hooks.ts";
import { selectSymbols } from "@veta/frontend/store/selectors.ts";
import { setOptionPrefill } from "@veta/frontend/store/uiSlice.ts";
import { COLOR } from "@veta/frontend/tokens.ts";
import type { OptionQuoteResponse, OptionType } from "@veta/frontend/types/analytics.ts";
import { formatUtcTime } from "@veta/frontend/utils/clock.ts";
import { useEffect, useMemo } from "react";
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
      className="flex justify-between items-center py-1 border-b border-panel last:border-0"
      title={title}
    >
      <span className="text-muted text-[11px]">{label}</span>
      <span className="text-secondary text-[11px] tabular-nums font-mono">{value}</span>
    </div>
  );
}

const CHART_TOOLTIP_STYLE = {
  backgroundColor: COLOR.CHART_TOOLTIP_BG,
  border: "1px solid #374151",
  fontSize: 9,
  padding: "4px 8px",
};

export function OptionPricingPanel() {
  const symbols = useAppSelector(selectSymbols);
  const symbol = useSignal(symbols[0] ?? "AAPL");
  const optionType = useSignal<OptionType>("call");
  const strike = useSignal("");
  const expirySecs = useSignal(30 * 86400);
  const customDate = useSignal("");
  const result = useSignal<OptionQuoteResponse | null>(null);

  const [getQuote, { isLoading, error }] = useGetQuoteMutation();
  const dispatch = useAppDispatch();

  const currentPrice = useAppSelector((s) => s.market.prices[symbol.value]);
  useEffect(() => {
    if (currentPrice && currentPrice > 0) {
      strike.value = currentPrice.toFixed(2);
    }
  }, [currentPrice, strike]);

  const optionPrefill = useAppSelector((s) => s.ui.optionPrefill);
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — consume once and clear
  useEffect(() => {
    if (optionPrefill) {
      strike.value = optionPrefill.strike.toFixed(2);
      expirySecs.value = optionPrefill.expirySecs;
      customDate.value = "";
      dispatch(setOptionPrefill(null));
    }
  }, [optionPrefill]);

  function handleCustomDate(dateStr: string) {
    customDate.value = dateStr;
    if (!dateStr) return;
    const days = Math.max(1, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000));
    expirySecs.value = days * 86400;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const k = Number(strike.value);
    if (!k || k <= 0) return;
    try {
      const res = await getQuote({
        symbol: symbol.value,
        optionType: optionType.value,
        strike: k,
        expirySecs: expirySecs.value,
      }).unwrap();
      result.value = res;
    } catch {
      /* error shown below */
    }
  }

  const sensitivityData = useMemo(() => {
    const r0 = result.value;
    if (!r0) return [];
    const T = r0.expirySecs / (365 * 86400);
    const r = 0.05;
    return Array.from({ length: 25 }, (_, i) => {
      const S = r0.spotPrice * (0.7 + i * (0.6 / 24));
      const { delta, gamma, theta, vega } = bsGreeks(
        r0.optionType,
        S,
        r0.strike,
        T,
        r,
        r0.impliedVol
      );
      return {
        spot: S.toFixed(1),
        delta: +delta.toFixed(4),
        "gamma×100": +(gamma * 100).toFixed(5),
        theta: +theta.toFixed(5),
        vega: +vega.toFixed(4),
      };
    });
  }, [result.value]);

  return (
    <div
      className="flex flex-col h-full bg-page text-default text-xs"
      data-testid="option-pricing-panel"
    >
      <div className="px-4 py-2.5 border-b border-panel shrink-0">
        <span className="text-[11px] font-semibold text-label uppercase tracking-wide">
          Option Pricing — Black-Scholes
        </span>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 px-4 py-3 border-b border-panel shrink-0"
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="op-symbol" className="text-[10px] text-muted uppercase tracking-wide">
              Symbol
            </label>
            <select
              id="op-symbol"
              value={symbol.value}
              onChange={(e) => {
                symbol.value = e.target.value;
              }}
              className="bg-panel border border-divider rounded px-2 py-1 text-[11px] text-secondary"
            >
              {symbols.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted uppercase tracking-wide">Type</span>
            <div className="flex gap-1">
              {(["call", "put"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  data-testid={t === "call" ? "call-btn" : "put-btn"}
                  onClick={() => {
                    optionType.value = t;
                  }}
                  className={`flex-1 py-1 rounded text-[11px] font-semibold transition-colors ${
                    optionType.value === t
                      ? t === "call"
                        ? "bg-emerald-800 text-emerald-200"
                        : "bg-red-900 text-red-200"
                      : "bg-panel text-muted hover:text-default"
                  }`}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="op-strike" className="text-[10px] text-muted uppercase tracking-wide">
              Strike ($){" "}
              {currentPrice ? (
                <span className="text-subtle normal-case">(spot {currentPrice.toFixed(2)})</span>
              ) : null}
            </label>
            <input
              id="op-strike"
              type="number"
              min="0.01"
              step="0.01"
              value={strike.value}
              onChange={(e) => {
                strike.value = e.target.value;
              }}
              placeholder="e.g. 150"
              data-testid="strike-input"
              className="bg-panel border border-divider rounded px-2 py-1 text-[11px] text-secondary placeholder:text-subtle"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="op-expiry-date"
              className="text-[10px] text-muted uppercase tracking-wide"
            >
              Expiry
            </label>
            <div className="flex gap-1 flex-wrap">
              {EXPIRY_OPTIONS.map((o) => (
                <button
                  key={o.secs}
                  type="button"
                  onClick={() => {
                    expirySecs.value = o.secs;
                    customDate.value = "";
                  }}
                  className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                    expirySecs.value === o.secs && !customDate.value
                      ? "bg-blue-700 text-white"
                      : "bg-panel text-muted hover:text-default"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <input
              id="op-expiry-date"
              type="date"
              value={customDate.value}
              onChange={(e) => handleCustomDate(e.target.value)}
              data-testid="expiry-input"
              className="bg-panel border border-divider rounded px-2 py-0.5 text-[10px] text-secondary mt-0.5"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || !strike.value}
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

      {result.value && (
        <div
          className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4"
          data-testid="quote-result"
        >
          <div className="bg-surface rounded p-3">
            <div className="flex justify-between mb-2">
              <span className="text-[10px] text-muted">Theoretical Price</span>
              <span className="text-lg font-bold text-primary tabular-nums font-mono">
                ${fmt(result.value.price, 4)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[10px]">
              <div>
                <span className="text-muted">Spot</span>
                <div className="text-default tabular-nums font-mono">
                  ${fmt(result.value.spotPrice, 2)}
                </div>
              </div>
              <div>
                <span className="text-muted">Strike</span>
                <div className="text-default tabular-nums font-mono">
                  ${fmt(result.value.strike, 2)}
                </div>
              </div>
              <div>
                <span className="text-muted">Impl. Vol</span>
                <div className="text-default tabular-nums font-mono">
                  {pct(result.value.impliedVol)}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-[10px] text-muted uppercase tracking-wide mb-2">Greeks</div>
            <div className="bg-surface rounded p-3">
              <GreekRow
                label="Δ Delta"
                value={fmt(result.value.greeks.delta)}
                title="Rate of price change vs spot"
              />
              <GreekRow
                label="Γ Gamma"
                value={fmt(result.value.greeks.gamma, 6)}
                title="Rate of delta change vs spot"
              />
              <GreekRow
                label="Θ Theta (daily)"
                value={`-${fmt(Math.abs(result.value.greeks.theta), 4)}`}
                title="Daily time decay"
              />
              <GreekRow
                label="ν Vega (per 1%)"
                value={fmt(result.value.greeks.vega, 4)}
                title="Price change per 1pp vol move"
              />
              <GreekRow
                label="ρ Rho (per 1%)"
                value={fmt(result.value.greeks.rho, 4)}
                title="Price change per 1pp rate move"
              />
            </div>
          </div>

          {sensitivityData.length > 0 && (
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wide mb-1">
                Greeks vs Spot (±30%)
              </div>
              <ResponsiveContainer width="100%" height={170}>
                <LineChart
                  data={sensitivityData}
                  margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={COLOR.CHART_GRID} />
                  <XAxis
                    dataKey="spot"
                    tick={{ fontSize: 8, fill: COLOR.CHART_AXIS }}
                    interval={4}
                  />
                  <YAxis tick={{ fontSize: 8, fill: COLOR.CHART_AXIS }} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(val: number, name: string) => [val.toFixed(5), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 8, paddingTop: 4 }} />
                  <Line
                    type="monotone"
                    dataKey="delta"
                    stroke={COLOR.UP}
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
                    stroke={COLOR.DOWN}
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

          <div className="text-[9px] text-divider text-right">
            Computed {formatUtcTime(result.value.computedAt)} · EWMA vol
          </div>
        </div>
      )}

      {!result.value && (
        <div className="flex-1 flex items-center justify-center text-divider text-[11px]">
          Enter parameters and click Price Option
        </div>
      )}
    </div>
  );
}
