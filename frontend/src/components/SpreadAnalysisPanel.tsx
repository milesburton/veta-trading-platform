import { useState } from "react";
import { useGetSpreadAnalysisMutation } from "../store/analyticsApi.ts";

const DEFAULT_COUPON = "5.0";
const DEFAULT_PERIODS = "20";
const DEFAULT_FREQ = "2";
const DEFAULT_YIELD = "4.5";
const DEFAULT_FACE = "1000";

function spreadColor(bps: number): string {
  if (bps < 50) return "text-emerald-400";
  if (bps < 150) return "text-amber-400";
  return "text-red-400";
}

function spreadBg(bps: number): string {
  if (bps < 50) return "bg-emerald-500";
  if (bps < 150) return "bg-amber-500";
  return "bg-red-500";
}

export function SpreadAnalysisPanel() {
  const [coupon, setCoupon] = useState(DEFAULT_COUPON);
  const [periods, setPeriods] = useState(DEFAULT_PERIODS);
  const [freq, setFreq] = useState(DEFAULT_FREQ);
  const [yld, setYld] = useState(DEFAULT_YIELD);
  const [face, setFace] = useState(DEFAULT_FACE);

  const [compute, { data, isLoading, isError }] = useGetSpreadAnalysisMutation();

  function handleCompute() {
    compute({
      couponRate: Number(coupon) / 100,
      totalPeriods: Number(periods),
      periodsPerYear: Number(freq),
      yieldAnnual: Number(yld) / 100,
      face: Number(face),
    });
  }

  const maxSpread = data ? Math.max(Math.abs(data.gSpread), Math.abs(data.zSpread), 1) * 1.2 : 1;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-xs text-gray-100">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-gray-200">Spread Analysis · Z / G / OAS</span>
        <span className="rounded bg-blue-900/40 px-2 py-0.5 text-[10px] text-blue-300">
          vs Nelson-Siegel
        </span>
      </div>

      <div className="grid grid-cols-5 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-gray-400">Coupon %</span>
          <input
            type="number"
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
            value={coupon}
            step="0.25"
            min="0"
            max="20"
            onChange={(e) => setCoupon(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-400">Periods</span>
          <input
            type="number"
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
            value={periods}
            step="1"
            min="1"
            max="120"
            onChange={(e) => setPeriods(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-400">Freq/yr</span>
          <input
            type="number"
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
            value={freq}
            step="1"
            min="1"
            max="12"
            onChange={(e) => setFreq(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-400">Yield %</span>
          <input
            type="number"
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
            value={yld}
            step="0.01"
            min="0"
            max="30"
            onChange={(e) => setYld(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-400">Face $</span>
          <input
            type="number"
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
            value={face}
            step="100"
            min="100"
            onChange={(e) => setFace(e.target.value)}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={handleCompute}
        disabled={isLoading}
        className="w-full rounded bg-blue-600 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {isLoading ? "Computing…" : "Compute Spreads"}
      </button>

      {isError && (
        <p className="text-center text-red-400">Failed to compute — check analytics service.</p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded bg-gray-800 p-2">
              <p className="text-gray-400">Tenor</p>
              <p className="text-lg font-semibold text-white">
                {data.tenorYears.toFixed(1)}
                <span className="ml-1 text-xs text-gray-400">yr</span>
              </p>
            </div>
            <div className="rounded bg-gray-800 p-2">
              <p className="text-gray-400">Gov Spot Rate</p>
              <p className="text-lg font-semibold text-white">
                {(data.govSpotRate * 100).toFixed(3)}
                <span className="ml-1 text-xs text-gray-400">%</span>
              </p>
            </div>
            <div className="rounded bg-gray-800 p-2">
              <p className="text-gray-400">G-Spread</p>
              <p className={`text-lg font-semibold ${spreadColor(data.gSpread)}`}>
                {data.gSpread.toFixed(1)}
                <span className="ml-1 text-xs text-gray-400">bps</span>
              </p>
            </div>
            <div className="rounded bg-gray-800 p-2">
              <p className="text-gray-400">Z-Spread</p>
              <p className={`text-lg font-semibold ${spreadColor(data.zSpread)}`}>
                {data.zSpread.toFixed(1)}
                <span className="ml-1 text-xs text-gray-400">bps</span>
              </p>
            </div>
          </div>

          <div
            className={`rounded p-2 ${
              data.oas < 50
                ? "bg-emerald-900/30"
                : data.oas < 150
                  ? "bg-amber-900/30"
                  : "bg-red-900/30"
            }`}
          >
            <p className="text-gray-400">
              OAS (Option-Adjusted Spread)
              <span className="ml-2 text-[10px] text-gray-500">= Z-spread for vanilla bonds</span>
            </p>
            <p className={`text-2xl font-bold ${spreadColor(data.oas)}`}>
              {data.oas.toFixed(1)}
              <span className="ml-1 text-sm text-gray-400">bps</span>
            </p>
          </div>

          <div className="space-y-2 rounded bg-gray-800 p-3">
            <p className="text-gray-400">Spread Comparison</p>
            {[
              { label: "G-Spread", value: data.gSpread, color: "bg-blue-500" },
              {
                label: "Z-Spread",
                value: data.zSpread,
                color: "bg-emerald-500",
              },
              { label: "OAS", value: data.oas, color: "bg-purple-500" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-16 text-right text-gray-400">{label}</span>
                <div className="flex-1 overflow-hidden rounded bg-gray-700">
                  <div
                    className={`h-4 rounded transition-all duration-500 ${spreadBg(value)}`}
                    style={{
                      width: `${Math.max(2, (Math.abs(value) / maxSpread) * 100)}%`,
                    }}
                  />
                </div>
                <span className={`w-16 font-mono font-semibold ${spreadColor(value)}`}>
                  {value.toFixed(1)} bp
                </span>
              </div>
            ))}
          </div>

          <div className="rounded border border-gray-700 p-2 text-[10px] text-gray-500">
            Typical IG corp spread: 50–150bp · HY: 200–600bp · UST benchmark: 0bp
          </div>
        </>
      )}
    </div>
  );
}
