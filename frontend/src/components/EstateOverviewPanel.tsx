import { useEffect, useRef, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import {
  alertAdded,
  alertDismissed,
  purgeServiceAlerts,
  selectActiveAlerts,
} from "../store/alertsSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { SERVICES, useGetServiceHealthQuery } from "../store/servicesApi.ts";
import type { ObsEvent } from "../types.ts";

// ── Constants ────────────────────────────────────────────────────────────────

const WINDOW_MS = 60_000;

const REQUIRED_SERVICES = new Set([
  "Market Sim",
  "EMS",
  "OMS",
  "Limit Algo",
  "TWAP Algo",
  "POV Algo",
  "VWAP Algo",
]);

const FILL_RATE_WARN = 50;
const FILL_RATE_CRIT = 30;
const FILL_RATE_OK = 60;
const ORDER_FLOOD = 200;
const ORDER_OK = 150;

// ── Service health zone ───────────────────────────────────────────────────────

interface ServiceChipProps {
  svc: (typeof SERVICES)[number];
  dispatch: ReturnType<typeof useAppDispatch>;
}

function ServiceChip({ svc, dispatch }: ServiceChipProps) {
  const { data, isError } = useGetServiceHealthQuery(svc, { pollingInterval: 10_000 });
  const prevRef = useRef<"ok" | "error" | null>(null);

  const state: "ok" | "error" | "unknown" = data?.state ?? (isError ? "error" : "unknown");

  useEffect(() => {
    if (state === "error" && prevRef.current !== "error") {
      prevRef.current = "error";
      dispatch(
        alertAdded({
          severity: REQUIRED_SERVICES.has(svc.name) ? "CRITICAL" : "WARNING",
          source: "service",
          message: `${svc.name}: service down`,
          detail: svc.url,
          ts: Date.now(),
        })
      );
    } else if (state === "ok" && prevRef.current === "error") {
      prevRef.current = "ok";
      dispatch(purgeServiceAlerts());
      dispatch(
        alertAdded({
          severity: "INFO",
          source: "service",
          message: `${svc.name}: recovered`,
          ts: Date.now(),
        })
      );
    } else if (state === "ok" && prevRef.current === null) {
      prevRef.current = "ok";
    }
  }, [state, svc, dispatch]);

  const dot = state === "ok" ? "bg-green-400" : state === "error" ? "bg-red-400" : "bg-gray-600";
  const text =
    state === "ok"
      ? "text-gray-300"
      : state === "error"
        ? "text-red-400 font-semibold"
        : "text-gray-600";

  return (
    <span className={`flex items-center gap-1 text-[10px] font-mono whitespace-nowrap ${text}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {svc.name}
    </span>
  );
}

function ServiceHealthBar() {
  const dispatch = useAppDispatch();
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-gray-800 bg-gray-900/60 flex-wrap shrink-0">
      <span className="text-[9px] text-gray-600 uppercase tracking-widest mr-1">Services</span>
      {SERVICES.map((svc) => (
        <ServiceChip key={svc.name} svc={svc} dispatch={dispatch} />
      ))}
    </div>
  );
}

// ── Throughput gauges zone ────────────────────────────────────────────────────

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

interface Metrics {
  ordersPerMin: number;
  fillsPerMin: number;
  fillRate: number;
  fillRateRecentChildren: number;
  activeStrategies: number;
}

function computeMetrics(orders: SlimOrder[]): Metrics {
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
  };
}

interface SparkPoint {
  t: number;
  count: number;
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

function MiniMetricCard({
  label,
  value,
  textClass,
  borderClass,
}: {
  label: string;
  value: string | number;
  textClass: string;
  borderClass: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded bg-gray-900 border ${borderClass} px-2 py-2 min-w-0`}
    >
      <span className={`text-lg font-bold font-mono tabular-nums leading-none ${textClass}`}>
        {value}
      </span>
      <span className="mt-0.5 text-[9px] text-gray-500 text-center leading-tight">{label}</span>
    </div>
  );
}

function ThroughputZone({ metrics, sparkline }: { metrics: Metrics; sparkline: SparkPoint[] }) {
  const fillRateBorder =
    metrics.fillRate < FILL_RATE_CRIT && metrics.fillRateRecentChildren >= 5
      ? "border-red-700/60"
      : metrics.fillRate < FILL_RATE_WARN && metrics.fillRateRecentChildren >= 5
        ? "border-yellow-700/60"
        : "border-yellow-700/60";
  const fillRateText =
    metrics.fillRate < FILL_RATE_CRIT && metrics.fillRateRecentChildren >= 5
      ? "text-red-400"
      : metrics.fillRate < FILL_RATE_WARN && metrics.fillRateRecentChildren >= 5
        ? "text-yellow-300"
        : "text-yellow-400";
  const ordersBorder =
    metrics.ordersPerMin > ORDER_FLOOD ? "border-red-700/60" : "border-blue-700/60";
  const ordersText = metrics.ordersPerMin > ORDER_FLOOD ? "text-red-400" : "text-blue-400";

  const cards = [
    {
      label: "Orders/min",
      value: metrics.ordersPerMin,
      borderClass: ordersBorder,
      textClass: ordersText,
    },
    {
      label: "Fills/min",
      value: metrics.fillsPerMin,
      borderClass: "border-green-700/60",
      textClass: "text-green-400",
    },
    {
      label: "Fill rate",
      value: `${metrics.fillRate}%`,
      borderClass: fillRateBorder,
      textClass: fillRateText,
    },
    {
      label: "Strategies",
      value: metrics.activeStrategies,
      borderClass: "border-purple-700/60",
      textClass: "text-purple-400",
    },
  ];

  return (
    <div className="flex flex-col gap-2 p-2 overflow-hidden">
      <div className="text-[9px] text-gray-600 uppercase tracking-wider">Throughput · 60s</div>
      <div className="grid grid-cols-2 gap-1.5">
        {cards.map((c) => (
          <MiniMetricCard key={c.label} {...c} />
        ))}
      </div>
      <div className="flex-1 min-h-[48px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkline} margin={{ top: 2, right: 2, left: -24, bottom: 0 }}>
            <XAxis dataKey="t" hide />
            <Tooltip
              contentStyle={{
                background: "#111827",
                border: "1px solid #374151",
                borderRadius: 4,
                fontSize: 9,
                color: "#d1d5db",
              }}
              labelFormatter={(v) => `${v}s ago`}
              formatter={(v: number) => [v, "orders"]}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke={metrics.ordersPerMin > ORDER_FLOOD ? "#f87171" : "#3b82f6"}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Event timeline zone ───────────────────────────────────────────────────────

const EVENT_TYPE_STYLES: Record<string, { dot: string; label: string }> = {
  "order.new": { dot: "bg-sky-400", label: "text-sky-400" },
  "order.routed": { dot: "bg-blue-400", label: "text-blue-400" },
  "order.filled": { dot: "bg-emerald-400", label: "text-emerald-400" },
  "order.expired": { dot: "bg-gray-500", label: "text-gray-500" },
  "order.rejected": { dot: "bg-red-500", label: "text-red-400" },
  "order.child": { dot: "bg-violet-400", label: "text-violet-400" },
  "algo.started": { dot: "bg-amber-400", label: "text-amber-400" },
  "algo.completed": { dot: "bg-emerald-400", label: "text-emerald-400" },
  "client.error": { dot: "bg-red-500", label: "text-red-400" },
};

function eventStyle(type: string) {
  return EVENT_TYPE_STYLES[type] ?? { dot: "bg-gray-600", label: "text-gray-500" };
}

function formatTs(ts: number | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function EventRow({ ev }: { ev: ObsEvent }) {
  const { dot, label } = eventStyle(ev.type);
  const symbol = ev.payload?.symbol as string | undefined;
  const status = ev.payload?.status as string | undefined;
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-gray-900/50">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <span className={`text-[10px] font-mono ${label} shrink-0`}>{ev.type}</span>
      {symbol && <span className="text-[10px] text-gray-400 shrink-0">{symbol}</span>}
      {status && <span className="text-[10px] text-gray-600 shrink-0">{status}</span>}
      <span className="ml-auto text-[9px] text-gray-700 tabular-nums shrink-0">
        {formatTs(ev.ts)}
      </span>
    </div>
  );
}

function TimelineZone() {
  const events = useAppSelector((s) => s.observability.events);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="text-[9px] text-gray-600 uppercase tracking-wider px-2 pt-2 pb-1 shrink-0">
        Event Timeline
      </div>
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
        {events.length === 0 ? (
          <div className="px-2 py-3 text-[10px] text-gray-700">No events yet…</div>
        ) : (
          events.slice(0, 200).map((ev, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: events have no stable id; key includes ts+type for stability
            <EventRow key={`${ev.ts ?? 0}-${ev.type}-${i}`} ev={ev} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Alert feed zone ───────────────────────────────────────────────────────────

const SEVERITY_STYLES = {
  CRITICAL: { border: "border-l-red-500", badge: "bg-red-900/50 text-red-400", label: "CRIT" },
  WARNING: {
    border: "border-l-yellow-500",
    badge: "bg-yellow-900/50 text-yellow-400",
    label: "WARN",
  },
  INFO: { border: "border-l-blue-500", badge: "bg-blue-900/50 text-blue-400", label: "INFO" },
};

const SOURCE_LABELS: Record<string, string> = {
  "kill-switch": "KS",
  service: "SVC",
  order: "ORD",
  algo: "ALGO",
  workspace: "WS",
};

function AlertFeedZone() {
  const dispatch = useAppDispatch();
  const activeAlerts = useAppSelector(selectActiveAlerts);
  const shown = activeAlerts.slice(0, 6);
  const overflow = activeAlerts.length - shown.length;

  if (activeAlerts.length === 0) {
    return (
      <div className="px-3 py-2 border-t border-gray-800 shrink-0">
        <span className="text-[10px] text-gray-700">No active alerts</span>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-800 shrink-0">
      <div className="text-[9px] text-gray-600 uppercase tracking-wider px-3 pt-1.5 pb-0.5">
        Alerts{overflow > 0 ? ` (showing 6 of ${activeAlerts.length})` : ""}
      </div>
      {shown.map((alert) => {
        const s = SEVERITY_STYLES[alert.severity];
        return (
          <div
            key={alert.id}
            className={`flex items-center gap-2 px-3 py-1 border-l-2 ${s.border} border-b border-gray-900 last:border-b-0`}
          >
            <span className={`text-[8px] px-1 py-0.5 rounded font-mono ${s.badge} shrink-0`}>
              {s.label}
            </span>
            <span className="text-[9px] text-gray-500 font-mono shrink-0">
              {SOURCE_LABELS[alert.source] ?? alert.source}
            </span>
            <span className="text-[10px] text-gray-300 flex-1 truncate">{alert.message}</span>
            <span className="text-[9px] text-gray-600 tabular-nums shrink-0">
              {Math.floor((Date.now() - alert.ts) / 60_000)}m
            </span>
            <button
              type="button"
              onClick={() => dispatch(alertDismissed(alert.id))}
              className="text-[9px] text-gray-600 hover:text-gray-400 shrink-0 leading-none"
              aria-label="dismiss"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function EstateOverviewPanel() {
  const dispatch = useAppDispatch();
  const orders = useAppSelector((s) => s.orders.orders);

  const [metrics, setMetrics] = useState<Metrics>({
    ordersPerMin: 0,
    fillsPerMin: 0,
    fillRate: 0,
    fillRateRecentChildren: 0,
    activeStrategies: 0,
  });
  const [sparkline, setSparkline] = useState<SparkPoint[]>([]);
  const threshRef = useRef({ fillRateLow: false, orderFlood: false });

  useEffect(() => {
    function refresh() {
      const m = computeMetrics(orders);
      setMetrics(m);
      setSparkline(buildSparkline(orders));

      // Threshold transitions
      const hasFillData = m.fillRateRecentChildren >= 5;
      const isFillLow = hasFillData && m.fillRate < FILL_RATE_WARN;
      if (isFillLow && !threshRef.current.fillRateLow) {
        threshRef.current.fillRateLow = true;
        dispatch(
          alertAdded({
            severity: "WARNING",
            source: "order",
            message: `Fill rate degraded: ${m.fillRate}%`,
            ts: Date.now(),
          })
        );
      } else if (!isFillLow && threshRef.current.fillRateLow && m.fillRate >= FILL_RATE_OK) {
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

      const isFlood = m.ordersPerMin > ORDER_FLOOD;
      if (isFlood && !threshRef.current.orderFlood) {
        threshRef.current.orderFlood = true;
        dispatch(
          alertAdded({
            severity: "WARNING",
            source: "order",
            message: `Order flood detected: ${m.ordersPerMin}/min`,
            ts: Date.now(),
          })
        );
      } else if (!isFlood && threshRef.current.orderFlood && m.ordersPerMin < ORDER_OK) {
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
  }, [orders, dispatch]);

  return (
    <div className="h-full flex flex-col bg-gray-950 text-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 shrink-0">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          Estate Overview
        </span>
      </div>

      {/* Zone 1: Service health bar */}
      <ServiceHealthBar />

      {/* Zones 2+3: Throughput left, Timeline right */}
      <div className="flex flex-1 min-h-0 divide-x divide-gray-800">
        <div className="w-[42%] flex flex-col overflow-hidden">
          <ThroughputZone metrics={metrics} sparkline={sparkline} />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <TimelineZone />
        </div>
      </div>

      {/* Zone 4: Alert feed */}
      <AlertFeedZone />
    </div>
  );
}
