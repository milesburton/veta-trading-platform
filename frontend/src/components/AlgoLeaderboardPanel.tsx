import { useEffect, useMemo, useRef, useState } from "react";
import { useAppSelector } from "../store/hooks.ts";
import type { OrderRecord } from "../types.ts";

interface StrategyMetrics {
  strategy: string;
  orders: number;
  fillRate: number | null;
  avgSlippageBps: number | null;
  totalFilledQty: number;
}

interface StratAcc {
  count: number;
  filled: number;
  expired: number;
  slippageSum: number;
  slippageSamples: number;
  totalFilledQty: number;
}

function computeMetrics(orders: OrderRecord[], windowMs: number): StrategyMetrics[] {
  const cutoff = Date.now() - windowMs;
  const byStrategy = new Map<string, StratAcc>();

  for (const o of orders) {
    if (o.submittedAt <= cutoff) continue;
    let acc = byStrategy.get(o.strategy);
    if (!acc) {
      acc = {
        count: 0,
        filled: 0,
        expired: 0,
        slippageSum: 0,
        slippageSamples: 0,
        totalFilledQty: 0,
      };
      byStrategy.set(o.strategy, acc);
    }
    acc.count++;
    acc.totalFilledQty += o.filled;
    if (o.status === "filled") {
      acc.filled++;
      if (o.avgFillPrice !== undefined && o.limitPrice > 0) {
        acc.slippageSum += Math.abs((o.avgFillPrice - o.limitPrice) / o.limitPrice) * 10_000;
        acc.slippageSamples++;
      }
    } else if (o.status === "expired") {
      acc.expired++;
    }
  }

  const metrics: StrategyMetrics[] = [];
  for (const [strategy, acc] of byStrategy.entries()) {
    const completedCount = acc.filled + acc.expired;
    metrics.push({
      strategy,
      orders: acc.count,
      fillRate: completedCount > 0 ? acc.filled / completedCount : null,
      avgSlippageBps: acc.slippageSamples > 0 ? acc.slippageSum / acc.slippageSamples : null,
      totalFilledQty: acc.totalFilledQty,
    });
  }

  metrics.sort((a, b) => {
    if (a.fillRate === null && b.fillRate === null) return 0;
    if (a.fillRate === null) return 1;
    if (b.fillRate === null) return -1;
    return b.fillRate - a.fillRate;
  });

  return metrics;
}

function FillRateBar({ rate }: { rate: number | null }) {
  if (rate === null) {
    return <span className="text-gray-600 text-[10px]">—</span>;
  }

  const pct = Math.round(rate * 100);
  const barColour = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  const textColour = pct >= 80 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-red-400";

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-gray-800 overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${barColour}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] tabular-nums font-medium ${textColour}`}>{pct}%</span>
    </div>
  );
}

function SlippageCell({ bps }: { bps: number | null }) {
  if (bps === null) {
    return <span className="text-gray-600 text-[10px]">—</span>;
  }

  const colourClass =
    bps <= 10 ? "text-emerald-400" : bps <= 50 ? "text-amber-400" : "text-red-400";

  return (
    <span className={`text-[10px] tabular-nums font-medium ${colourClass}`}>
      {bps.toFixed(1)}bp
    </span>
  );
}

export function AlgoLeaderboardPanel() {
  const allOrders = useAppSelector((s) => s.orders.orders);
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is intentional for timed refresh
  const metrics = useMemo(() => computeMetrics(allOrders, 300_000), [allOrders, tick]);

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-300 text-xs">
      <div className="px-4 py-2.5 border-b border-gray-800 shrink-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold text-gray-200 uppercase tracking-wide">
            Algo Leaderboard (last 5 min)
          </span>
          <span className="text-[10px] text-gray-600">Updates from live order flow</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {metrics.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-600 text-[11px]">
            No order data in last 5 minutes
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-gray-950 z-10">
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-1.5 text-[10px] text-gray-600 uppercase tracking-wide font-medium">
                  Strategy
                </th>
                <th className="text-right px-4 py-1.5 text-[10px] text-gray-600 uppercase tracking-wide font-medium">
                  Orders (5m)
                </th>
                <th className="px-4 py-1.5 text-[10px] text-gray-600 uppercase tracking-wide font-medium">
                  Fill Rate
                </th>
                <th className="text-right px-4 py-1.5 text-[10px] text-gray-600 uppercase tracking-wide font-medium">
                  Avg Slippage
                </th>
                <th className="text-right px-4 py-1.5 text-[10px] text-gray-600 uppercase tracking-wide font-medium">
                  Total Filled Qty
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m, idx) => (
                <tr
                  key={m.strategy}
                  className={`border-b border-gray-900 hover:bg-gray-900/40 transition-colors ${
                    idx % 2 !== 0 ? "bg-gray-900/20" : ""
                  }`}
                >
                  <td className="px-4 py-2">
                    <span className="font-mono text-[11px] text-gray-200 font-medium">
                      {m.strategy}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-[11px] text-gray-300">
                    {m.orders}
                  </td>
                  <td className="px-4 py-2">
                    <FillRateBar rate={m.fillRate} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <SlippageCell bps={m.avgSlippageBps} />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-[11px] text-gray-300">
                    {m.totalFilledQty.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
