import { useMemo, useState } from "react";
import { useGetScenarioMutation } from "../store/analyticsApi.ts";
import { useAppSelector } from "../store/hooks.ts";
import type { OptionType, ScenarioCell, ScenarioResponse } from "../types/analytics.ts";

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

function buildShocks(rangePercent: number): number[] {
  const r = rangePercent / 100;
  return [-r, -(r * 0.5), -(r * 0.25), 0, r * 0.25, r * 0.5, r];
}

function buildVolShocks(rangePercent: number): number[] {
  const r = rangePercent / 100;
  return [-r, -(r * 0.5), 0, r * 0.5, r];
}

function divergingColor(val: number, min: number, max: number): string {
  if (max === min) return "#374151";
  const t = Math.max(0, Math.min(1, (val - min) / (max - min)));
  if (t < 0.5) {
    const p = t / 0.5;
    const r = Math.round(239 + (55 - 239) * p);
    const g = Math.round(68 + (65 - 68) * p);
    const b = Math.round(68 + (81 - 68) * p);
    return `rgb(${r},${g},${b})`;
  }
  const p = (t - 0.5) / 0.5;
  const r = Math.round(55 + (34 - 55) * p);
  const g = Math.round(65 + (197 - 65) * p);
  const b = Math.round(81 + (94 - 81) * p);
  return `rgb(${r},${g},${b})`;
}

function priceColor(): string {
  return "#1e3a5f";
}

function cellValue(cell: ScenarioCell, metric: CellMetric): number {
  return cell[metric];
}

function fmtCell(val: number, metric: CellMetric): string {
  if (metric === "pnlPct") return `${val >= 0 ? "+" : ""}${(val * 100).toFixed(1)}%`;
  if (metric === "pnl") return `${val >= 0 ? "+" : ""}${val.toFixed(2)}`;
  return val.toFixed(2);
}

interface CellTooltipProps {
  cell: ScenarioCell | null;
  x: number;
  y: number;
}

function CellTooltip({ cell, x, y }: CellTooltipProps) {
  if (!cell) return null;
  return (
    <div
      className="fixed z-50 pointer-events-none bg-gray-900 border border-gray-700 rounded p-2 text-[10px] shadow-lg"
      style={{ left: x + 12, top: y - 8 }}
    >
      <div className="text-gray-400 mb-1">
        Spot {pctLabel(cell.spotPct)} · Vol {pctLabel(cell.volPct)}
      </div>
      <div
        className={`font-mono tabular-nums ${cell.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
      >
        P&L: {cell.pnl >= 0 ? "+" : ""}
        {cell.pnl.toFixed(3)}
      </div>
      <div className="text-gray-400">P&L %: {(cell.pnlPct * 100).toFixed(1)}%</div>
      <div className="text-gray-400">Price: ${cell.optionPrice.toFixed(3)}</div>
      <div className="text-gray-400">MC Mean: ${cell.mean.toFixed(3)}</div>
      <div className="text-gray-400">MC p95: ${cell.p95.toFixed(3)}</div>
    </div>
  );
}

export function ScenarioMatrixPanel() {
  const symbols = useAppSelector((s) => s.market.assets.map((a) => a.symbol));
  const currentPrice = useAppSelector((s) =>
    symbols.length > 0 ? s.market.prices[symbols[0]] : undefined
  );
  const [symbol, setSymbol] = useState(symbols[0] ?? "AAPL");
  const [optionType, setOptionType] = useState<OptionType>("call");
  const [strike, setStrike] = useState(() => (currentPrice ? currentPrice.toFixed(2) : ""));
  const [expirySecs, setExpirySecs] = useState(30 * 86400);
  const [metric, setMetric] = useState<CellMetric>("pnl");
  const [result, setResult] = useState<ScenarioResponse | null>(null);
  const [spotRange, setSpotRange] = useState(20);
  const [volRange, setVolRange] = useState(20);
  const [showRanges, setShowRanges] = useState(false);
  const [hovered, setHovered] = useState<{ cell: ScenarioCell; x: number; y: number } | null>(null);

  const [getScenario, { isLoading, error }] = useGetScenarioMutation();

  const spotShocks = useMemo(() => buildShocks(spotRange), [spotRange]);
  const volShocks = useMemo(() => buildVolShocks(volRange), [volRange]);

  const [minVal, maxVal] = useMemo(() => {
    if (!result) return [0, 0];
    const vals = result.cells.flatMap((row) => row.map((c) => cellValue(c, metric)));
    return [Math.min(...vals), Math.max(...vals)];
  }, [result, metric]);

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
        spotShocks,
        volShocks,
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

        <button
          type="button"
          onClick={() => setShowRanges((v) => !v)}
          className="px-2 py-1.5 rounded bg-gray-800 text-gray-500 hover:text-gray-300 text-[10px] transition-colors"
        >
          {showRanges ? "▲ Ranges" : "▼ Ranges"}
        </button>

        {error && (
          <span className="text-red-400 text-[10px]">
            {("data" in error ? (error.data as { error?: string })?.error : null) ?? "Error"}
          </span>
        )}
      </form>

      {showRanges && (
        <div className="flex gap-4 px-4 py-2 border-b border-gray-800 shrink-0">
          <div className="flex flex-col gap-1 flex-1">
            <label htmlFor="spot-range" className="text-[9px] text-gray-600 uppercase">
              Spot shock ±{spotRange}%
            </label>
            <input
              id="spot-range"
              type="range"
              min={5}
              max={50}
              step={5}
              value={spotRange}
              onChange={(e) => setSpotRange(Number(e.target.value))}
              className="w-full accent-blue-500 h-1"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label htmlFor="vol-range" className="text-[9px] text-gray-600 uppercase">
              Vol shock ±{volRange}%
            </label>
            <input
              id="vol-range"
              type="range"
              min={5}
              max={50}
              step={5}
              value={volRange}
              onChange={(e) => setVolRange(Number(e.target.value))}
              className="w-full accent-purple-500 h-1"
            />
          </div>
        </div>
      )}

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

          {/* Heatmap grid */}
          <div className="flex-1 overflow-auto p-3">
            <div className="text-[9px] text-gray-600 mb-2">
              Spot ${result.spotPrice.toFixed(2)} · Vol {(result.impliedVol * 100).toFixed(1)}% ·
              Base ${result.baselinePrice.toFixed(4)} · Hover for all metrics
            </div>
            <table
              className="border-collapse text-[10px] w-full"
              data-testid="scenario-table"
              onMouseLeave={() => setHovered(null)}
            >
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
                        const isPnl = metric === "pnl" || metric === "pnlPct";
                        const bg = isPnl ? divergingColor(val, minVal, maxVal) : priceColor();
                        const textColor = isPnl
                          ? val > (minVal + maxVal) / 2
                            ? "#d1fae5"
                            : "#fee2e2"
                          : "#93c5fd";
                        return (
                          <td
                            key={cell.volPct}
                            className="text-center px-1 py-0.5 rounded-sm text-[10px] tabular-nums font-mono cursor-default"
                            style={{ backgroundColor: bg, color: textColor }}
                            onMouseEnter={(e) =>
                              setHovered({
                                cell,
                                x: e.clientX,
                                y: e.clientY,
                              })
                            }
                            onMouseMove={(e) =>
                              setHovered((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : null))
                            }
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

            {/* Colour scale legend */}
            {(metric === "pnl" || metric === "pnlPct") && (
              <div className="flex items-center gap-2 mt-3">
                <span className="text-[9px] text-red-400">Loss</span>
                <div
                  className="flex-1 h-2 rounded"
                  style={{
                    background:
                      "linear-gradient(to right, rgb(239,68,68), rgb(55,65,81), rgb(34,197,94))",
                  }}
                />
                <span className="text-[9px] text-emerald-400">Gain</span>
              </div>
            )}

            <div className="text-[9px] text-gray-700 mt-2 text-right">
              {new Date(result.computedAt).toLocaleTimeString()} · 1000 MC paths/cell
            </div>
          </div>
        </>
      )}

      {hovered && <CellTooltip cell={hovered.cell} x={hovered.x} y={hovered.y} />}

      {!result && (
        <div className="flex-1 flex items-center justify-center text-gray-700 text-[11px]">
          Configure parameters and click Run Scenario
        </div>
      )}
    </div>
  );
}
