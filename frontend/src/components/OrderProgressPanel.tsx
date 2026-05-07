import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChannelIn } from "../hooks/useChannelIn.ts";
import { useAppSelector } from "../store/hooks.ts";
import { COLOR } from "../tokens.ts";
import type { OrderRecord } from "../types.ts";

function strategyColour(strategy: string): string {
  switch (strategy) {
    case "LIMIT":
      return COLOR.LIMIT;
    case "TWAP":
      return COLOR.TWAP;
    case "POV":
      return COLOR.POV;
    case "VWAP":
      return COLOR.VWAP;
    default:
      return COLOR.NEUTRAL;
  }
}

function fillPct(order: OrderRecord): number {
  if (order.quantity === 0) return 0;
  return Math.min(1, order.filled / order.quantity);
}

interface PieEntry {
  name: string;
  value: number;
  colour: string;
}

interface BarEntry {
  name: string;
  value: number;
  colour: string;
}

function buildPieSlices(order: OrderRecord): PieEntry[] {
  const pct = fillPct(order);
  return [
    { name: "Filled", value: Math.round(pct * 100), colour: COLOR.FILL },
    {
      name: "Remaining",
      value: Math.round((1 - pct) * 100),
      colour: COLOR.REMAINING,
    },
  ];
}

function buildChildBars(order: OrderRecord): BarEntry[] {
  return order.children
    .filter((c) => c.status === "filled" && c.filled > 0)
    .map((c) => ({
      name: c.id.slice(0, 6).toUpperCase(),
      value: c.filled,
      colour: strategyColour(order.strategy),
    }));
}

interface PieTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number }[];
}

function PieTooltipContent({ active, payload }: PieTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  if (item.name === "Remaining") return null;
  return (
    <div className="bg-surface border border-divider rounded px-2 py-1 text-xs text-secondary">
      {item.value}% filled
    </div>
  );
}

interface BarTooltipProps {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}

function BarTooltipContent({ active, payload, label }: BarTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-divider rounded px-2 py-1 text-xs text-secondary">
      Slice {label}: {payload[0].value} shares
    </div>
  );
}

export function OrderProgressPanel() {
  const orders = useAppSelector((s) => s.orders.orders);
  const channelIn = useChannelIn();
  const selectedOrderId = channelIn.selectedOrderId;

  const order = selectedOrderId ? orders.find((o) => o.id === selectedOrderId) : null;

  if (!selectedOrderId || !order) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-subtle bg-page">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="28"
          height="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" strokeLinecap="round" />
        </svg>
        <span className="text-xs">Select an order in the blotter</span>
      </div>
    );
  }

  const pct = fillPct(order);
  const pctDisplay = Math.round(pct * 100);
  const pieSlices = buildPieSlices(order);
  const childBars = buildChildBars(order);
  const stratColour = strategyColour(order.strategy);

  return (
    <div
      className="flex flex-col h-full bg-page overflow-y-auto"
      data-testid="order-progress-panel"
    >
      <div className="px-3 pt-2.5 pb-2 border-b border-panel shrink-0 flex items-center gap-2">
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums font-mono"
          style={{ color: stratColour, background: `${stratColour}22` }}
        >
          {order.strategy}
        </span>
        <span className="text-[11px] text-default font-semibold">
          {order.side} {order.quantity.toLocaleString()} {order.asset}
        </span>
        <span className="ml-auto text-[10px] text-subtle font-mono">{order.id.slice(0, 8)}</span>
      </div>

      <div className="flex items-center gap-4 px-4 pt-4 pb-2">
        <div className="shrink-0">
          <ResponsiveContainer width={120} height={120}>
            <PieChart>
              <Pie
                data={pieSlices}
                dataKey="value"
                innerRadius={34}
                outerRadius={52}
                startAngle={90}
                endAngle={-270}
                strokeWidth={0}
              >
                {pieSlices.map((slice) => (
                  <Cell key={slice.name} fill={slice.colour} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltipContent />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col gap-2 min-w-0">
          <div>
            <span
              className="text-4xl font-bold tabular-nums"
              data-testid="fill-percentage"
              style={{ color: pct === 1 ? COLOR.FILL : "rgb(var(--gray-200))" }}
            >
              {pctDisplay}%
            </span>
            <span className="text-xs text-muted ml-1">filled</span>
          </div>
          <div className="text-xs text-muted leading-relaxed">
            <div>
              <span className="text-label">{order.filled.toLocaleString()}</span>
              <span className="text-subtle">/ {order.quantity.toLocaleString()} shares</span>
            </div>
            {order.avgFillPrice != null && (
              <div>
                avg <span className="text-label">${order.avgFillPrice.toFixed(2)}</span>
              </div>
            )}
            {order.totalCommissionUSD != null && order.totalCommissionUSD > 0 && (
              <div>
                comm <span className="text-label">${order.totalCommissionUSD.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {childBars.length > 0 && (
        <>
          <div className="px-3 pt-2 pb-1 border-t border-panel mt-1 shrink-0">
            <span className="text-[11px] text-muted uppercase tracking-wider">
              Slice fills ({childBars.length})
            </span>
          </div>
          <div className="px-2 pb-4" style={{ height: 110 }} data-testid="child-orders-list">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={childBars} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 8, fill: COLOR.CHART_AXIS }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: COLOR.CHART_AXIS }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<BarTooltipContent />} cursor={{ fill: COLOR.CHART_CURSOR }} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {childBars.map((row) => (
                    <Cell key={row.name} fill={row.colour} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
