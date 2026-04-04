/**
 * Yield Curve Panel
 *
 * Three zones:
 *  1. Nelson-Siegel spot yield curve (line chart)
 *  2. Implied forward rate chips
 *  3. Collapsible bond pricing form
 */

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useGetBondPriceMutation, useGetYieldCurveMutation } from "../store/analyticsApi.ts";
import type { BondPriceResponse, ForwardRate, YieldCurvePoint } from "../types/analytics.ts";

function ForwardChip({ fwd, prevRate }: { fwd: ForwardRate; prevRate?: number }) {
  const isInverted = prevRate !== undefined && fwd.rate < prevRate;
  const textClass = isInverted ? "text-red-400" : "text-green-400";
  const borderClass = isInverted ? "border-red-700/60" : "border-green-700/60";
  return (
    <div
      className={`flex flex-col items-center justify-center rounded bg-gray-900 border ${borderClass} px-2 py-1.5 min-w-0`}
    >
      <span className={`text-sm font-bold font-mono tabular-nums leading-none ${textClass}`}>
        {(fwd.rate * 100).toFixed(2)}%
      </span>
      <span className="mt-0.5 text-[9px] text-gray-500 text-center leading-tight">
        {fwd.label} fwd
      </span>
    </div>
  );
}

function BondMetric({
  label,
  value,
  textClass = "text-gray-200",
}: {
  label: string;
  value: string;
  textClass?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded bg-gray-900 border border-gray-700/60 px-2 py-1.5 min-w-0">
      <span className={`text-sm font-bold font-mono tabular-nums leading-none ${textClass}`}>
        {value}
      </span>
      <span className="mt-0.5 text-[9px] text-gray-500 text-center leading-tight">{label}</span>
    </div>
  );
}

export function YieldCurvePanel() {
  const [fetchCurve, { data: curveData, isLoading: curveLoading }] = useGetYieldCurveMutation();
  const [priceBond, { data: bondData, isLoading: bondLoading }] = useGetBondPriceMutation();

  // Bond form state
  const [showBond, setShowBond] = useState(false);
  const [face, setFace] = useState("1000");
  const [couponRate, setCouponRate] = useState("5");
  const [periodsPerYear, setPeriodsPerYear] = useState("2");
  const [totalPeriods, setTotalPeriods] = useState("20");
  const [yieldAnnual, setYieldAnnual] = useState("4.5");

  // Auto-fetch curve on mount
  useEffect(() => {
    fetchCurve({});
  }, [fetchCurve]);

  function handlePriceBond() {
    priceBond({
      face: Number(face),
      couponRate: Number(couponRate) / 100,
      periodsPerYear: Number(periodsPerYear),
      totalPeriods: Number(totalPeriods),
      yieldAnnual: Number(yieldAnnual) / 100,
    });
  }

  const curve: YieldCurvePoint[] = curveData?.curve ?? [];
  const fwds: ForwardRate[] = curveData?.forwardRates ?? [];
  const bond: BondPriceResponse | undefined = bondData;

  // Chart data: rate as percentage
  const chartData = curve.map((p) => ({
    label: p.tenorLabel,
    rate: +(p.spotRate * 100).toFixed(3),
  }));

  return (
    <div className="h-full flex flex-col bg-gray-950 text-gray-200 overflow-hidden text-xs">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 shrink-0 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          Yield Curve · Nelson-Siegel
        </span>
        <button
          type="button"
          onClick={() => fetchCurve({})}
          disabled={curveLoading}
          className="text-[10px] px-2 py-0.5 rounded bg-blue-900/40 border border-blue-700/50 text-blue-300 hover:bg-blue-800/50 disabled:opacity-40"
        >
          {curveLoading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Zone 1: spot yield curve chart */}
      <div className="px-2 pt-2 shrink-0" style={{ height: 180 }}>
        {curve.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-[10px]">
            {curveLoading ? "Computing curve…" : "No data"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#6b7280" }} />
              <YAxis
                tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                tick={{ fontSize: 9, fill: "#6b7280" }}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  background: "#111827",
                  border: "1px solid #374151",
                  borderRadius: 4,
                  fontSize: 9,
                  color: "#d1d5db",
                }}
                formatter={(v: number) => [`${v.toFixed(3)}%`, "Yield"]}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3, fill: "#3b82f6" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Zone 2: forward rate chips */}
      {fwds.length > 0 && (
        <div className="px-3 py-2 shrink-0">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">
            Implied Forward Rates
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {fwds.map((fwd, i) => (
              <ForwardChip
                key={fwd.label}
                fwd={fwd}
                prevRate={i > 0 ? fwds[i - 1].rate : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Zone 3: bond pricing (collapsible) */}
      <div className="border-t border-gray-800 shrink-0">
        <button
          type="button"
          onClick={() => setShowBond((v) => !v)}
          className="w-full text-left px-3 py-1.5 text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1"
        >
          <span>{showBond ? "▾" : "▸"}</span>
          Bond Pricing (price / duration / convexity / DV01)
        </button>

        {showBond && (
          <div className="px-3 pb-3">
            {/* Form inputs */}
            <div className="grid grid-cols-5 gap-1.5 mb-2">
              {[
                { label: "Face", value: face, setter: setFace },
                { label: "Coupon %", value: couponRate, setter: setCouponRate },
                {
                  label: "Freq/yr",
                  value: periodsPerYear,
                  setter: setPeriodsPerYear,
                },
                {
                  label: "Periods",
                  value: totalPeriods,
                  setter: setTotalPeriods,
                },
                {
                  label: "Yield %",
                  value: yieldAnnual,
                  setter: setYieldAnnual,
                },
              ].map(({ label, value, setter }) => {
                const id = `bond-${label.toLowerCase().replace(/[^a-z]/g, "-")}`;
                return (
                  <div key={label} className="flex flex-col gap-0.5">
                    <label htmlFor={id} className="text-[9px] text-gray-600">
                      {label}
                    </label>
                    <input
                      id={id}
                      type="number"
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-200 font-mono focus:outline-none focus:border-blue-600"
                    />
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handlePriceBond}
              disabled={bondLoading}
              className="mb-2 px-3 py-1 rounded bg-blue-900/40 border border-blue-700/50 text-blue-300 text-[10px] hover:bg-blue-800/50 disabled:opacity-40"
            >
              {bondLoading ? "Pricing…" : "Price Bond"}
            </button>

            {bond && (
              <div className="grid grid-cols-4 gap-1.5">
                <BondMetric
                  label="Price"
                  value={`$${bond.price.toFixed(2)}`}
                  textClass="text-blue-400"
                />
                <BondMetric
                  label="Mod Duration"
                  value={bond.modifiedDuration.toFixed(3)}
                  textClass="text-yellow-400"
                />
                <BondMetric
                  label="Convexity"
                  value={bond.convexity.toFixed(3)}
                  textClass="text-purple-400"
                />
                <BondMetric
                  label="DV01"
                  value={`$${bond.dv01.toFixed(4)}`}
                  textClass="text-green-400"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
