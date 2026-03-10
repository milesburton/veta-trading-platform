import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useGetDurationLadderMutation } from "../store/analyticsApi.ts";
import type { BondPosition } from "../types/analytics.ts";

interface PositionRow {
  faceValue: string;
  couponRate: string;
  totalPeriods: string;
  yieldAnnual: string;
  quantity: string;
}

const DEFAULT_POSITIONS: PositionRow[] = [
  { faceValue: "1000", couponRate: "4.75", totalPeriods: "4", yieldAnnual: "4.88", quantity: "10" },
  { faceValue: "1000", couponRate: "4.25", totalPeriods: "10", yieldAnnual: "4.35", quantity: "5" },
  { faceValue: "1000", couponRate: "4.38", totalPeriods: "20", yieldAnnual: "4.45", quantity: "8" },
  {
    faceValue: "1000",
    couponRate: "5.40",
    totalPeriods: "20",
    yieldAnnual: "5.55",
    quantity: "-3",
  },
  { faceValue: "1000", couponRate: "4.63", totalPeriods: "60", yieldAnnual: "4.68", quantity: "2" },
];

const BAR_COLORS = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#a855f7"];
const TENOR_LABELS = ["3m", "1y", "2y", "5y", "10y", "30y"];

export function DurationLadderPanel() {
  const [positions, setPositions] = useState<PositionRow[]>(DEFAULT_POSITIONS);
  const [compute, { data, isLoading, isError }] = useGetDurationLadderMutation();

  function updatePosition(idx: number, field: keyof PositionRow, value: string) {
    setPositions((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  }

  function handleCompute() {
    const bondPositions: BondPosition[] = positions.map((p) => ({
      faceValue: Number(p.faceValue),
      couponRate: Number(p.couponRate) / 100,
      totalPeriods: Number(p.totalPeriods),
      periodsPerYear: 2,
      yieldAnnual: Number(p.yieldAnnual) / 100,
      quantity: Number(p.quantity),
    }));
    compute({ positions: bondPositions });
  }

  const chartData = data
    ? TENOR_LABELS.map((tenorLabel) => {
        const bucket = data.buckets.find((b) => b.tenorLabel === tenorLabel);
        const entry: Record<string, number | string> = { tenor: tenorLabel };
        data.positions.forEach((pos, i) => {
          const contrib = pos.contributions.find((c) => c.tenorLabel === tenorLabel);
          entry[`bond${i}`] = contrib ? Number(contrib.dv01Contribution.toFixed(4)) : 0;
        });
        entry._netDv01 = bucket ? bucket.netDv01 : 0;
        return entry;
      })
    : [];

  const totalDv01 = data?.totalPortfolioDv01 ?? 0;
  const dv01Color = totalDv01 >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-xs text-gray-100">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-gray-200">Duration Ladder · DV01 by Tenor</span>
        <span className="rounded bg-purple-900/40 px-2 py-0.5 text-[10px] text-purple-300">
          Key-Rate Buckets
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="py-1 pr-2 text-left">#</th>
              <th className="py-1 pr-2 text-right">Face $</th>
              <th className="py-1 pr-2 text-right">Cpn %</th>
              <th className="py-1 pr-2 text-right">Periods</th>
              <th className="py-1 pr-2 text-right">Yld %</th>
              <th className="py-1 text-right">Qty (±)</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: positions are identified by index
              <tr key={idx} className="border-b border-gray-800">
                <td className="py-0.5 pr-2 text-gray-500">{idx + 1}</td>
                {(
                  ["faceValue", "couponRate", "totalPeriods", "yieldAnnual", "quantity"] as const
                ).map((field) => (
                  <td key={field} className="pr-1">
                    <input
                      type="number"
                      className="w-16 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-right text-[10px] focus:border-blue-500 focus:outline-none"
                      value={pos[field]}
                      step={field === "quantity" ? "1" : "0.01"}
                      onChange={(e) => updatePosition(idx, field, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={handleCompute}
        disabled={isLoading}
        className="w-full rounded bg-purple-700 py-1.5 text-xs font-semibold text-white hover:bg-purple-600 disabled:opacity-50"
      >
        {isLoading ? "Computing…" : "Compute Ladder"}
      </button>

      {isError && (
        <p className="text-center text-red-400">Failed to compute — check analytics service.</p>
      )}

      {data && (
        <>
          <div className="flex items-center justify-between rounded bg-gray-800 p-2">
            <span className="text-gray-400">Portfolio DV01</span>
            <span className={`text-lg font-bold ${dv01Color}`}>
              ${Math.abs(totalDv01).toFixed(2)}
              <span className="ml-1 text-xs text-gray-400">
                {totalDv01 >= 0 ? "long" : "short"}
              </span>
            </span>
          </div>

          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#374151" vertical={false} />
                <XAxis
                  dataKey="tenor"
                  tick={{ fill: "#9ca3af", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 9 }}
                  tickFormatter={(v: number) => `$${Math.abs(v).toFixed(2)}`}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  contentStyle={{
                    background: "#111827",
                    border: "1px solid #374151",
                    fontSize: 10,
                  }}
                  labelStyle={{ color: "#e5e7eb" }}
                  formatter={(value: number, name: string) => [
                    `$${value.toFixed(4)}`,
                    `Bond ${Number(name.replace("bond", "")) + 1}`,
                  ]}
                />
                <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
                {positions.map((_, i) => (
                  <Bar
                    // biome-ignore lint/suspicious/noArrayIndexKey: bond index is the chart series key
                    key={`bond${i}`}
                    dataKey={`bond${i}`}
                    stackId="dv01"
                    fill={BAR_COLORS[i % BAR_COLORS.length]}
                    radius={i === positions.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto rounded bg-gray-800">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="py-1 pl-2 text-left">Tenor</th>
                  <th className="py-1 pr-2 text-right">Net DV01 ($)</th>
                  <th className="py-1 pr-2 text-right">Direction</th>
                </tr>
              </thead>
              <tbody>
                {data.buckets.map((b) => (
                  <tr key={b.tenorLabel} className="border-b border-gray-700/50">
                    <td className="py-0.5 pl-2 font-mono text-gray-300">{b.tenorLabel}</td>
                    <td
                      className={`py-0.5 pr-2 text-right font-mono font-semibold ${b.netDv01 >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      ${Math.abs(b.netDv01).toFixed(4)}
                    </td>
                    <td className="py-0.5 pr-2 text-right text-gray-500">
                      {b.netDv01 > 0.0001 ? "▲ long" : b.netDv01 < -0.0001 ? "▼ short" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
