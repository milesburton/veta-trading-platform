import { useSignal } from "@preact/signals-react";
import {
  alertAdded,
  alertDismissed,
  purgeServiceAlerts,
  selectActiveAlerts,
} from "@veta/frontend/store/alertsSlice.ts";
import { useAppDispatch, useAppSelector } from "@veta/frontend/store/hooks.ts";
import { SERVICES, useGetServiceHealthQuery } from "@veta/frontend/store/servicesApi.ts";
import { COLOR } from "@veta/frontend/tokens.ts";
import type { ObsEvent } from "@veta/frontend/types.ts";
import { formatUtcTime } from "@veta/frontend/utils/clock.ts";
import { useEffect, useRef } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

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

const CATEGORY_LABEL: Record<string, string> = {
  core: "Core",
  algo: "Algo",
  data: "Data",
  infra: "Infra",
  observability: "Obs",
};

interface ServiceRowProps {
  svc: (typeof SERVICES)[number];
  dispatch: ReturnType<typeof useAppDispatch>;
}

function ServiceRow({ svc, dispatch }: ServiceRowProps) {
  const { data, isError } = useGetServiceHealthQuery(svc, {
    pollingInterval: 10_000,
  });
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

  const dotClass = state === "ok" ? "bg-green-400" : state === "error" ? "bg-red-400" : "bg-subtle";
  const nameClass =
    state === "error"
      ? "text-red-400 font-semibold"
      : state === "ok"
        ? "text-secondary"
        : "text-subtle";
  const statusText = state === "ok" ? "OK" : state === "error" ? "DOWN" : "—";
  const statusClass =
    state === "ok"
      ? "text-green-400"
      : state === "error"
        ? "text-red-400 font-semibold"
        : "text-subtle";

  return (
    <tr className="border-b border-panel/50 hover:bg-surface/40">
      <td className="py-1 pl-3 pr-2 w-3">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass}`} />
      </td>
      <td className={`py-1 pr-3 text-[10px] font-mono whitespace-nowrap ${nameClass}`}>
        {svc.link ? (
          <a href={svc.link} target="_blank" rel="noreferrer" className="hover:underline">
            {svc.name}
          </a>
        ) : (
          svc.name
        )}
      </td>
      <td className="py-1 pr-3 text-[9px] text-subtle whitespace-nowrap">
        {CATEGORY_LABEL[svc.category] ?? svc.category}
      </td>
      <td className={`py-1 pr-3 text-[9px] font-mono tabular-nums ${statusClass}`}>{statusText}</td>
      <td className="py-1 pr-3 text-[9px] text-subtle font-mono tabular-nums">
        {data?.version ?? "—"}
      </td>
    </tr>
  );
}

function ServiceHealthTable() {
  const dispatch = useAppDispatch();
  return (
    <div className="overflow-auto shrink-0 border-b border-panel max-h-[45%]">
      <table className="w-full text-left border-collapse">
        <thead className="sticky top-0 bg-page z-10">
          <tr className="border-b border-panel">
            <th className="py-1 pl-3 pr-2 w-3" />
            <th className="py-1 pr-3 text-[9px] font-semibold text-subtle uppercase tracking-wider">
              Service
            </th>
            <th className="py-1 pr-3 text-[9px] font-semibold text-subtle uppercase tracking-wider">
              Type
            </th>
            <th className="py-1 pr-3 text-[9px] font-semibold text-subtle uppercase tracking-wider">
              Status
            </th>
            <th className="py-1 pr-3 text-[9px] font-semibold text-subtle uppercase tracking-wider">
              Version
            </th>
          </tr>
        </thead>
        <tbody>
          {SERVICES.map((svc) => (
            <ServiceRow key={svc.name} svc={svc} dispatch={dispatch} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
      className={`flex flex-col items-center justify-center rounded bg-surface border ${borderClass} px-2 py-2 min-w-0`}
    >
      <span className={`text-lg font-bold font-mono tabular-nums leading-none ${textClass}`}>
        {value}
      </span>
      <span className="mt-0.5 text-[9px] text-muted text-center leading-tight">{label}</span>
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
      <div className="text-[9px] text-subtle uppercase tracking-wider">Throughput · 60s</div>
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
                background: COLOR.CHART_TOOLTIP_BG,
                border: "1px solid #374151",
                borderRadius: 4,
                fontSize: 9,
                color: "rgb(var(--gray-300))",
              }}
              labelFormatter={(v) => `${v}s ago`}
              formatter={(v: number) => [v, "orders"]}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke={metrics.ordersPerMin > ORDER_FLOOD ? COLOR.DOWN : COLOR.LIMIT}
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

const EVENT_TYPE_STYLES: Record<string, { dot: string; label: string }> = {
  "order.new": { dot: "bg-sky-400", label: "text-sky-400" },
  "order.routed": { dot: "bg-blue-400", label: "text-blue-400" },
  "order.filled": { dot: "bg-emerald-400", label: "text-emerald-400" },
  "order.expired": { dot: "bg-muted", label: "text-muted" },
  "order.rejected": { dot: "bg-red-500", label: "text-red-400" },
  "order.child": { dot: "bg-violet-400", label: "text-violet-400" },
  "algo.started": { dot: "bg-amber-400", label: "text-amber-400" },
  "algo.completed": { dot: "bg-emerald-400", label: "text-emerald-400" },
  "client.error": { dot: "bg-red-500", label: "text-red-400" },
};

function eventStyle(type: string) {
  return EVENT_TYPE_STYLES[type] ?? { dot: "bg-subtle", label: "text-muted" };
}

function formatTs(ts: number | undefined): string {
  if (!ts) return "";
  return formatUtcTime(ts);
}

function EventRow({ ev }: { ev: ObsEvent }) {
  const { dot, label } = eventStyle(ev.type);
  const symbol = ev.payload?.symbol as string | undefined;
  const status = ev.payload?.status as string | undefined;
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-surface/50">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <span className={`text-[10px] font-mono ${label} shrink-0`}>{ev.type}</span>
      {symbol && <span className="text-[10px] text-label shrink-0">{symbol}</span>}
      {status && <span className="text-[10px] text-subtle shrink-0">{status}</span>}
      <span className="ml-auto text-[9px] text-divider tabular-nums shrink-0">
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
      <div className="text-[9px] text-subtle uppercase tracking-wider px-2 pt-2 pb-1 shrink-0">
        Event Timeline
      </div>
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
        {events.length === 0 ? (
          <div className="px-2 py-3 text-[10px] text-divider">No events yet…</div>
        ) : (
          events
            .slice(0, 200)
            .map((ev) => (
              <EventRow
                key={`${ev.ts ?? 0}-${ev.type}-${String(ev.payload?.symbol ?? "")}-${String(ev.payload?.status ?? "")}`}
                ev={ev}
              />
            ))
        )}
      </div>
    </div>
  );
}

const SEVERITY_STYLES = {
  CRITICAL: {
    border: "border-l-red-500",
    badge: "bg-red-900/50 text-red-400",
    label: "CRIT",
  },
  WARNING: {
    border: "border-l-yellow-500",
    badge: "bg-yellow-900/50 text-yellow-400",
    label: "WARN",
  },
  INFO: {
    border: "border-l-blue-500",
    badge: "bg-blue-900/50 text-blue-400",
    label: "INFO",
  },
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
      <div className="px-3 py-2 border-t border-panel shrink-0">
        <span className="text-[10px] text-divider">No active alerts</span>
      </div>
    );
  }

  return (
    <div className="border-t border-panel shrink-0">
      <div className="text-[9px] text-subtle uppercase tracking-wider px-3 pt-1.5 pb-0.5">
        Alerts{overflow > 0 ? ` (showing 6 of ${activeAlerts.length})` : ""}
      </div>
      {shown.map((alert) => {
        const s = SEVERITY_STYLES[alert.severity];
        return (
          <div
            key={alert.id}
            className={`flex items-center gap-2 px-3 py-1 border-l-2 ${s.border} border-b border-surface last:border-b-0`}
          >
            <span className={`text-[8px] px-1 py-0.5 rounded font-mono ${s.badge} shrink-0`}>
              {s.label}
            </span>
            <span className="text-[9px] text-muted font-mono shrink-0">
              {SOURCE_LABELS[alert.source] ?? alert.source}
            </span>
            <span className="text-[10px] text-default flex-1 truncate">{alert.message}</span>
            <span className="text-[9px] text-subtle tabular-nums shrink-0">
              {Math.floor((Date.now() - alert.ts) / 60_000)}m
            </span>
            <button
              type="button"
              onClick={() => dispatch(alertDismissed(alert.id))}
              className="text-[9px] text-subtle hover:text-label shrink-0 leading-none"
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

export function EstateOverviewPanel() {
  const dispatch = useAppDispatch();
  const orders = useAppSelector((s) => s.orders.orders);

  const metrics = useSignal<Metrics>({
    ordersPerMin: 0,
    fillsPerMin: 0,
    fillRate: 0,
    fillRateRecentChildren: 0,
    activeStrategies: 0,
  });
  const sparkline = useSignal<SparkPoint[]>([]);
  const threshRef = useRef({ fillRateLow: false, orderFlood: false });

  useEffect(() => {
    function refresh() {
      const m = computeMetrics(orders);
      metrics.value = m;
      sparkline.value = buildSparkline(orders);

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
  }, [orders, dispatch, metrics, sparkline]);

  return (
    <div className="h-full flex flex-col bg-page text-secondary overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-panel shrink-0">
        <span className="text-[11px] font-semibold text-label uppercase tracking-wide">
          Estate Overview
        </span>
      </div>

      {/* Zone 1: Service health table */}
      <ServiceHealthTable />

      {/* Zones 2+3: Throughput left, Timeline right */}
      <div className="flex flex-1 min-h-0 divide-x divide-panel">
        <div className="w-[42%] flex flex-col overflow-hidden">
          <ThroughputZone metrics={metrics.value} sparkline={sparkline.value} />
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
