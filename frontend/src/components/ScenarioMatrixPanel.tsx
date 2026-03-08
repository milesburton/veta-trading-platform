import { useState } from "react";
import { useGetScenarioMutation } from "../store/analyticsApi.ts";
import { useAppSelector } from "../store/hooks.ts";
import type { OptionType, ScenarioCell, ScenarioResponse } from "../types/analytics.ts";

const SPOT_SHOCKS = [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2];
const VOL_SHOCKS = [-0.2, -0.1, 0, 0.1, 0.2];
const EXPIRY_OPTIONS = [
  { label: "7d", secs: 7 * 86400 },
  { label: "14d", secs: 14 * 86400 },
  { label: "30d", secs: 30 * 86400 },
  { label: "60d", secs: 60 * 86400 },
  { label: "90d", secs: 90 * 86400 },
];

type CellMetric = "pnl" | "pnlPct" | "optionPrice" | "mean" | "p95";

const METRIC_LABELS: Record<CellMetric, string> = {
  pnl: "P&L ($)",
  pnlPct: "P&L (%)",
  optionPrice: "Option Price ($)",
  mean: "MC Mean ($)",
  p95: "MC p95 ($)",
};

function pctLabel(n: number): string {
  return n === 0 ? "ATM" : `${n > 0 ? "+" : ""}${(n * 100).toFixed(0)}%`;
}

function cellValue(cell: ScenarioCell, metric: CellMetric): number {
  return cell[metric];
}

function cellBg(val: number, metric: CellMetric): string {
  // For P&L metrics, use green/red scale; for price metrics, use blue scale
  if (metric === "optionPrice" || metric === "mean" || metric === "p95") {
    return "bg-blue-900/30";
  }
  if (val > 0) {
    if (val > 0.5 || (metric === "pnl" && val > 5)) return "bg-emerald-800/60 text-emerald-200";
    return "bg-emerald-900/40 text-emerald-300";
  }
  if (val < 0) {
    if (val < -0.5 || (metric === "pnl" && val < -5)) return "bg-red-800/60 text-red-200";
    return "bg-red-900/40 text-red-300";
  }
  return "bg-gray-800/60 text-gray-400";
}

function fmtCell(val: number, metric: CellMetric): string {
  if (metric === "pnlPct") return `${val >= 0 ? "+" : ""}${(val * 100).toFixed(1)}%`;
  if (metric === "pnl") return `${val >= 0 ? "+" : ""}${val.toFixed(2)}`;
  return val.toFixed(2);
}

export function ScenarioMatrixPanel() {
  const symbols = useAppSelector((s) => Object.keys(s.market.assets));
  const [symbol, setSymbol] = useState(symbols[0] ?? "AAPL");
  const [optionType, setOptionType] = useState<OptionType>("call");
  const [strike, setStrike] = useState("");
  const [expirySecs, setExpirySecs] = useState(30 * 86400);
  const [metric, setMetric] = useState<CellMetric>("pnl");
  const [result, setResult] = useState<ScenarioResponse | null>(null);

  const [getScenario, { isLoading, error }] = useGetScenarioMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const k = Number(strike);
    if (!k || k <= 0) return;
    try {
      const res = await getScenario({
        symbol,
        optionType,
        strike: k,
        expirySecs,
        spotShocks: SPOT_SHOCKS,
        volShocks: VOL_SHOCKS,
        paths: 1000,
      }).unwrap();
      setResult(res);
    } catch {
      /* error shown below */
    }
  }

  return (
    <div
      className="flex flex-col h-full bg-gray-950 text-gray-300 text-xs"
      data-testid="scenario-matrix-panel"
    >
      <div className="px-4 py-2.5 border-b border-gray-800 shrink-0">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          Scenario Matrix — Spot / Vol Shocks
        </span>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap gap-2 items-end px-4 py-2 border-b border-gray-800 shrink-0"
      >
        <div className="flex flex-col gap-0.5">
          <label htmlFor="sm-symbol" className="text-[9px] text-gray-600 uppercase">
            Symbol
          </label>
          <select
            id="sm-symbol"
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

        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] text-gray-600 uppercase">Type</span>
          <div className="flex gap-1">
            {(["call", "put"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setOptionType(t)}
                className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
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

        <div className="flex flex-col gap-0.5">
          <label htmlFor="sm-strike" className="text-[9px] text-gray-600 uppercase">
            Strike ($)
          </label>
          <input
            id="sm-strike"
            type="number"
            min="0.01"
            step="0.01"
            value={strike}
            onChange={(e) => setStrike(e.target.value)}
            placeholder="e.g. 150"
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 w-24 placeholder:text-gray-600"
          />
        </div>

        <div className="flex flex-col gap-0.5">
          <label htmlFor="sm-expiry" className="text-[9px] text-gray-600 uppercase">
            Expiry
          </label>
          <select
            id="sm-expiry"
            value={expirySecs}
            onChange={(e) => setExpirySecs(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200"
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.secs} value={o.secs}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={isLoading || !strike}
          data-testid="run-scenario-btn"
          className="px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-[11px] font-semibold text-white transition-colors"
        >
          {isLoading ? "Running…" : "Run Scenario"}
        </button>

        {error && (
          <span className="text-red-400 text-[10px]">
            {("data" in error ? (error.data as { error?: string })?.error : null) ?? "Error"}
          </span>
        )}
      </form>

      {result && (
        <>
          {/* Metric picker */}
          <div className="flex gap-1 px-4 py-1.5 border-b border-gray-800 shrink-0">
            {(Object.entries(METRIC_LABELS) as [CellMetric, string][]).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMetric(k)}
                className={`text-[9px] px-2 py-0.5 rounded transition-colors ${
                  metric === k ? "bg-gray-700 text-gray-100" : "text-gray-600 hover:text-gray-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Matrix */}
          <div className="flex-1 overflow-auto p-3">
            <div className="text-[9px] text-gray-600 mb-2">
              Spot ${result.spotPrice.toFixed(2)} · Vol {(result.impliedVol * 100).toFixed(1)}% ·
              Base {result.baselinePrice.toFixed(4)}
            </div>
            <table className="border-collapse text-[10px] w-full" data-testid="scenario-table">
              <thead>
                <tr>
                  <th className="text-[9px] text-gray-600 text-left pr-2 pb-1 font-normal">
                    Spot ↓ / Vol →
                  </th>
                  {result.volShocks.map((vs) => (
                    <th
                      key={vs}
                      className="text-[9px] text-gray-500 text-center pb-1 px-1 font-semibold min-w-[60px]"
                    >
                      {pctLabel(vs)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.cells.map((row, si) => {
                  const spotPct = result.spotShocks[si];
                  return (
                    <tr key={spotPct}>
                      <td className="text-[9px] text-gray-500 pr-2 font-semibold">
                        {pctLabel(spotPct)}
                      </td>
                      {row.map((cell) => {
                        const val = cellValue(cell, metric);
                        const bg = cellBg(val, metric);
                        return (
                          <td
                            key={cell.volPct}
                            className={`text-center px-1 py-0.5 rounded-sm text-[10px] tabular-nums font-mono ${bg}`}
                          >
                            {fmtCell(val, metric)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="text-[9px] text-gray-700 mt-2 text-right">
              {new Date(result.computedAt).toLocaleTimeString()} · {1000} MC paths/cell
            </div>
          </div>
        </>
      )}

      {!result && (
        <div className="flex-1 flex items-center justify-center text-gray-700 text-[11px]">
          Configure parameters and click Run Scenario
        </div>
      )}
    </div>
  );
}
