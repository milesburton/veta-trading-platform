import { useSignal } from "@preact/signals-react";
import { useEffect, useRef } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { alertAdded } from "../store/alertsSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";

interface SparkPoint {
  t: number;
  count: number;
}

interface Metrics {
  ordersPerMin: number;
  fillsPerMin: number;
  fillRate: number;
  fillRateRecentChildren: number;
  activeStrategies: number;
  busEventsPerMin: number;
}

const WINDOW_MS = 60_000;

// Thresholds
const FILL_RATE_WARN = 50; // below → WARNING
const FILL_RATE_CRIT = 30; // below → red card
const FILL_RATE_OK = 60; // above → recovery
const ORDER_FLOOD = 200; // above → WARNING
const ORDER_OK = 150; // below → recovery

interface SlimChild {
  status: string;
  submittedAt: number;
}

interface SlimOrder {
  status: string;
  submittedAt: number;
  strategy: string;
  children: SlimChild[];
}

function computeMetrics(orders: SlimOrder[], events: { type: string; ts?: number }[]): Metrics {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let ordersPerMin = 0;
  let recentChildCount = 0;
  let filledChildCount = 0;
  const activeStratSet = new Set<string>();

  for (const o of orders) {
    if (o.submittedAt > cutoff) ordersPerMin++;
    if (o.status !== "expired" && o.status !== "filled" && o.status !== "cancelled") {
      activeStratSet.add(o.strategy);
    }
    for (const c of o.children) {
      if (c.submittedAt > cutoff) {
        recentChildCount++;
        if (c.status === "filled") filledChildCount++;
      }
    }
  }

  return {
    ordersPerMin,
    fillsPerMin: filledChildCount,
    fillRate: recentChildCount > 0 ? Math.round((filledChildCount / recentChildCount) * 100) : 0,
    fillRateRecentChildren: recentChildCount,
    activeStrategies: activeStratSet.size,
    busEventsPerMin: events.filter((e) => (e.ts ?? 0) > cutoff).length,
  };
}

function buildSparkline(orders: { submittedAt: number }[], buckets = 60): SparkPoint[] {
  const now = Date.now();
  const counts = new Array<number>(buckets).fill(0);
  for (const o of orders) {
    const idx = Math.floor((now - o.submittedAt) / 1_000);
    if (idx >= 0 && idx < buckets) counts[buckets - 1 - idx]++;
  }
  return counts.map((count, t) => ({ t, count }));
}

interface MetricCardProps {
  label: string;
  value: string | number;
  borderClass: string;
  textClass: string;
}

function MetricCard({ label, value, borderClass, textClass }: MetricCardProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded bg-gray-900 border ${borderClass} px-3 py-3 min-w-0`}
    >
      <span className={`text-2xl font-bold font-mono tabular-nums leading-none ${textClass}`}>
        {value}
      </span>
      <span className="mt-1 text-[10px] text-gray-400 text-center leading-tight">{label}</span>
    </div>
  );
}

export function ThroughputGaugesPanel() {
  const dispatch = useAppDispatch();
  const orders = useAppSelector((s) => s.orders.orders);
  const events = useAppSelector((s) => s.observability.events);

  const metrics = useSignal<Metrics>({
    ordersPerMin: 0,
    fillsPerMin: 0,
    fillRate: 0,
    fillRateRecentChildren: 0,
    activeStrategies: 0,
    busEventsPerMin: 0,
  });
  const sparkline = useSignal<SparkPoint[]>([]);

  // Track threshold state for transition detection
  const threshRef = useRef({ fillRateLow: false, orderFlood: false });

  useEffect(() => {
    function refresh() {
      const m = computeMetrics(orders, events);
      metrics.value = m;
      sparkline.value = buildSparkline(orders);

      // Fill rate threshold transitions
      const hasFillData = m.fillRateRecentChildren >= 5;
      const isFillLow = hasFillData && m.fillRate < FILL_RATE_WARN;
      const wasFillLow = threshRef.current.fillRateLow;
      if (isFillLow && !wasFillLow) {
        threshRef.current.fillRateLow = true;
        dispatch(
          alertAdded({
            severity: "WARNING",
            source: "order",
            message: `Fill rate degraded: ${m.fillRate}%`,
            ts: Date.now(),
          })
        );
      } else if (!isFillLow && wasFillLow && m.fillRate >= FILL_RATE_OK) {
        threshRef.current.fillRateLow = false;
        dispatch(
          alertAdded({
            severity: "INFO",
            source: "order",
            message: `Fill rate recovered: ${m.fillRate}%`,
            ts: Date.now(),
          })
        );
      }

      // Order flood threshold transitions
      const isFlood = m.ordersPerMin > ORDER_FLOOD;
      const wasFlood = threshRef.current.orderFlood;
      if (isFlood && !wasFlood) {
        threshRef.current.orderFlood = true;
        dispatch(
          alertAdded({
            severity: "WARNING",
            source: "order",
            message: `Order flood detected: ${m.ordersPerMin}/min`,
            ts: Date.now(),
          })
        );
      } else if (!isFlood && wasFlood && m.ordersPerMin < ORDER_OK) {
        threshRef.current.orderFlood = false;
        dispatch(
          alertAdded({
            severity: "INFO",
            source: "order",
            message: "Order rate normalised",
            ts: Date.now(),
          })
        );
      }
    }

    refresh();
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [orders, events, dispatch, metrics, sparkline]);

  // Fill rate card colouring
  const fillRateBorder =
    metrics.value.fillRate < FILL_RATE_CRIT && metrics.value.fillRateRecentChildren >= 5
      ? "border-red-700/60"
      : metrics.value.fillRate < FILL_RATE_WARN && metrics.value.fillRateRecentChildren >= 5
        ? "border-yellow-700/60"
        : "border-yellow-700/60";
  const fillRateText =
    metrics.value.fillRate < FILL_RATE_CRIT && metrics.value.fillRateRecentChildren >= 5
      ? "text-red-400"
      : metrics.value.fillRate < FILL_RATE_WARN && metrics.value.fillRateRecentChildren >= 5
        ? "text-yellow-300"
        : "text-yellow-400";

  const ordersBorder =
    metrics.value.ordersPerMin > ORDER_FLOOD ? "border-red-700/60" : "border-blue-700/60";
  const ordersText = metrics.value.ordersPerMin > ORDER_FLOOD ? "text-red-400" : "text-blue-400";

  const cards: MetricCardProps[] = [
    {
      label: "Orders / min",
      value: metrics.value.ordersPerMin,
      borderClass: ordersBorder,
      textClass: ordersText,
    },
    {
      label: "Fills / min",
      value: metrics.value.fillsPerMin,
      borderClass: "border-green-700/60",
      textClass: "text-green-400",
    },
    {
      label: "Fill rate",
      value: `${metrics.value.fillRate}%`,
      borderClass: fillRateBorder,
      textClass: fillRateText,
    },
    {
      label: "Active strategies",
      value: metrics.value.activeStrategies,
      borderClass: "border-purple-700/60",
      textClass: "text-purple-400",
    },
    {
      label: "Bus events / min",
      value: metrics.value.busEventsPerMin,
      borderClass: "border-orange-700/60",
      textClass: "text-orange-400",
    },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-950 text-gray-200 overflow-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-100 tracking-wide uppercase">
          Throughput Gauges
        </span>
        <span className="text-[10px] font-mono text-gray-500">last 60 s</span>
      </div>

      <div className="flex-shrink-0 p-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {cards.map((card) => (
            <MetricCard key={card.label} {...card} />
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 px-3 pb-3 flex flex-col">
        <div className="text-[10px] text-gray-500 mb-1 font-mono">
          Orders rate (per-second, last 60 s)
        </div>
        <div className="flex-1 min-h-[60px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkline.value} margin={{ top: 2, right: 4, left: 0, bottom: 2 }}>
              <XAxis dataKey="t" hide />
              <Tooltip
                contentStyle={{
                  background: "#111827",
                  border: "1px solid #374151",
                  borderRadius: 4,
                  fontSize: 10,
                  color: "#d1d5db",
                }}
                labelFormatter={(v) => `${v}s ago`}
                formatter={(v: number) => [v, "orders"]}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke={metrics.value.ordersPerMin > ORDER_FLOOD ? "#f87171" : "#3b82f6"}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
