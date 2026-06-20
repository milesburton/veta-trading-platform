import { useSignal } from "@preact/signals-react";
import { useChannelContext } from "@veta/frontend/contexts/ChannelContext.tsx";
import { useChannelIn } from "@veta/frontend/hooks/useChannelIn.ts";
import { useColumnLayout } from "@veta/frontend/hooks/useColumnLayout.ts";
import { useContainerLimit, useGridQuery } from "@veta/frontend/hooks/useGridQuery.ts";
import { useAppSelector } from "@veta/frontend/store/hooks.ts";
import { COLOR } from "@veta/frontend/tokens.ts";
import type { ColDef } from "@veta/frontend/types/gridPrefs.ts";
import type { LiquidityFlag, OrderRecord } from "@veta/frontend/types.ts";
import { ORDER_STATUS_DESCRIPTIONS } from "@veta/frontend/types.ts";
import { formatBps, formatTime } from "@veta/frontend/utils/format.ts";
import { applyCfRules } from "@veta/frontend/utils/gridFilter.ts";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CfRuleEditor } from "./grid/CfRuleEditor.tsx";
import { FilterBar } from "./grid/FilterBar.tsx";
import { ResizableHeader } from "./grid/ResizableHeader.tsx";
import { PopOutButton } from "./PopOutButton.tsx";

const LIQ_COLORS: Record<LiquidityFlag, string> = {
  MAKER: COLOR.MAKER,
  TAKER: COLOR.TAKER,
  CROSS: COLOR.CROSS,
};

const EXEC_COLS: ColDef[] = [
  { key: "submittedAt", label: "Time", type: "string", defaultWidth: 80 },
  { key: "asset", label: "Asset", type: "string", defaultWidth: 72 },
  {
    key: "side",
    label: "Side",
    type: "enum",
    options: ["BUY", "SELL"],
    defaultWidth: 52,
  },
  {
    key: "strategy",
    label: "Strategy",
    type: "enum",
    options: ["LIMIT", "TWAP", "POV", "VWAP"],
    defaultWidth: 72,
  },
  {
    key: "status",
    label: "Status",
    type: "enum",
    options: ["pending", "working", "filled", "expired", "rejected", "cancelled", "held"],
    defaultWidth: 72,
  },
  {
    key: "fillPct",
    label: "Fill%",
    type: "number",
    defaultWidth: 56,
    align: "right",
  },
  {
    key: "impact",
    label: "Impact",
    type: "number",
    defaultWidth: 56,
    align: "right",
  },
  {
    key: "commission",
    label: "Comm",
    type: "number",
    defaultWidth: 64,
    align: "right",
  },
  {
    key: "slices",
    label: "Slices",
    type: "number",
    defaultWidth: 52,
    align: "right",
  },
  { key: "_expand", label: "", type: "string", defaultWidth: 24 },
];

function buildFillTimeline(order: OrderRecord) {
  if (order.children.length === 0) return [];
  const sorted = order.children
    .filter((c) => c.status === "filled" && c.filled > 0)
    .sort((a, b) => a.submittedAt - b.submittedAt);
  if (sorted.length === 0) return [];

  let cumFilled = 0;
  return sorted.map((c) => {
    cumFilled += c.filled;
    return {
      time: formatTime(c.submittedAt),
      cumFilled,
      fillPx: c.avgFillPrice ?? c.limitPrice,
      pct: order.quantity > 0 ? (cumFilled / order.quantity) * 100 : 0,
    };
  });
}

function TradeRow({
  order,
  cols,
  getWidth,
  getStickyProps,
}: {
  order: OrderRecord;
  cols: ColDef[];
  getWidth: (key: string) => number;
  getStickyProps: (key: string) => { style: React.CSSProperties; isLastFrozen: boolean } | null;
}) {
  const expanded = useSignal(false);
  const cfRules = useAppSelector((s) => s.gridPrefs.executions.cfRules);

  const filledChildren = order.children.filter((c) => c.status === "filled" && c.filled > 0);
  const totalFilledQty = filledChildren.reduce((s, c) => s + c.filled, 0);
  const totalVal = filledChildren.reduce(
    (s, c) => s + (c.avgFillPrice ?? c.limitPrice) * c.filled,
    0
  );
  const avgPx = totalFilledQty > 0 ? totalVal / totalFilledQty : 0;
  const totalComm = filledChildren.reduce((s, c) => s + (c.commissionUSD ?? 0), 0);

  const impactBps =
    totalFilledQty > 0
      ? order.side === "BUY"
        ? ((avgPx - order.limitPrice) / order.limitPrice) * 10_000
        : ((order.limitPrice - avgPx) / order.limitPrice) * 10_000
      : 0;

  const fillPct = order.quantity > 0 ? (order.filled / order.quantity) * 100 : 0;
  const timeline = buildFillTimeline(order);

  const impactColor =
    impactBps > 5 ? "text-red-400" : impactBps < -2 ? "text-emerald-400" : "text-label";
  const commColor = totalComm < 0 ? "text-emerald-400" : "text-amber-400";
  const statusColor =
    order.status === "filled"
      ? "text-emerald-500"
      : order.status === "expired"
        ? "text-muted"
        : "text-sky-400";

  const liqTotals = filledChildren.reduce(
    (acc, c) => {
      if (c.liquidityFlag === "MAKER") acc.maker += c.filled;
      else if (c.liquidityFlag === "TAKER") acc.taker += c.filled;
      else if (c.liquidityFlag === "CROSS") acc.cross += c.filled;
      return acc;
    },
    { maker: 0, taker: 0, cross: 0 }
  );

  const { rowClasses, cellClasses } = applyCfRules(order, cfRules);

  return (
    <>
      <tr
        data-testid="execution-row"
        className={`border-b border-panel/40 cursor-pointer hover:bg-panel/20 transition-colors ${rowClasses}`}
        onClick={() => {
          expanded.value = !expanded.value;
        }}
      >
        {cols.map((col) => {
          const cellCls = cellClasses[col.key] ?? "";
          const w = getWidth(col.key);
          const sp = getStickyProps(col.key);
          const stickyStyle = sp ? { width: w, ...sp.style } : { width: w };
          const stickyClass = sp
            ? `bg-page${sp.isLastFrozen ? " border-r-2 border-r-divider" : ""}`
            : "";
          switch (col.key) {
            case "submittedAt":
              return (
                <td
                  key={col.key}
                  style={stickyStyle}
                  className={`px-3 py-1.5 text-muted tabular-nums whitespace-nowrap text-[10px] ${cellCls} ${stickyClass}`}
                >
                  {formatTime(order.submittedAt)}
                </td>
              );
            case "asset":
              return (
                <td
                  key={col.key}
                  style={stickyStyle}
                  className={`px-3 py-1.5 font-semibold text-secondary ${cellCls} ${stickyClass}`}
                >
                  {order.asset}
                </td>
              );
            case "side":
              return (
                <td
                  key={col.key}
                  style={stickyStyle}
                  className={`px-3 py-1.5 font-semibold ${
                    order.side === "BUY" ? "text-emerald-400" : "text-red-400"
                  } ${cellCls} ${stickyClass}`}
                >
                  {order.side}
                </td>
              );
            case "strategy":
              return (
                <td
                  key={col.key}
                  style={stickyStyle}
                  className={`px-3 py-1.5 text-label ${cellCls} ${stickyClass}`}
                >
                  {order.strategy}
                </td>
              );
            case "status":
              return (
                <td
                  key={col.key}
                  style={stickyStyle}
                  className={`px-3 py-1.5 font-semibold ${statusColor} ${cellCls} ${stickyClass}`}
                  title={ORDER_STATUS_DESCRIPTIONS[order.status]}
                >
                  {order.status}
                </td>
              );
            case "fillPct":
              return (
                <td
                  key={col.key}
                  style={stickyStyle}
                  className={`px-3 py-1.5 text-right tabular-nums text-default ${stickyClass}`}
                >
                  {fillPct.toFixed(0)}%
                </td>
              );
            case "impact":
              return (
                <td
                  key={col.key}
                  style={stickyStyle}
                  className={`px-3 py-1.5 text-right tabular-nums text-[10px] ${impactColor} ${stickyClass}`}
                >
                  {totalFilledQty > 0 ? formatBps(impactBps) : "—"}
                </td>
              );
            case "commission":
              return (
                <td
                  key={col.key}
                  style={stickyStyle}
                  className={`px-3 py-1.5 text-right tabular-nums text-[10px] ${commColor} ${stickyClass}`}
                >
                  {totalFilledQty > 0 ? `$${totalComm.toFixed(2)}` : "—"}
                </td>
              );
            case "slices":
              return (
                <td
                  key={col.key}
                  style={stickyStyle}
                  className={`px-3 py-1.5 text-right tabular-nums text-muted text-[10px] ${stickyClass}`}
                >
                  {filledChildren.length}
                </td>
              );
            case "_expand":
              return (
                <td
                  key={col.key}
                  style={stickyStyle}
                  className={`px-3 py-1.5 text-muted text-[10px] ${stickyClass}`}
                >
                  {expanded.value ? "▾" : "▸"}
                </td>
              );
            default:
              return (
                <td
                  key={col.key}
                  style={stickyStyle}
                  className={`px-3 py-1.5 text-muted ${stickyClass}`}
                />
              );
          }
        })}
      </tr>

      {expanded.value && (
        <tr>
          <td colSpan={cols.length} className="p-0">
            <div className="bg-surface/40 border-b border-panel/40 px-4 py-3 flex flex-col gap-3">
              {totalFilledQty > 0 && (
                <div className="flex items-center gap-4 text-[10px]">
                  <span className="text-muted">
                    Avg px <span className="text-default font-mono">{avgPx.toFixed(4)}</span>
                  </span>
                  <span className="text-muted">
                    Limit{" "}
                    <span className="text-default font-mono">{order.limitPrice.toFixed(4)}</span>
                  </span>
                  {liqTotals.maker + liqTotals.taker + liqTotals.cross > 0 && (
                    <div className="flex gap-2">
                      {liqTotals.maker > 0 && (
                        <span style={{ color: LIQ_COLORS.MAKER }}>
                          MAKER {((liqTotals.maker / totalFilledQty) * 100).toFixed(0)}%
                        </span>
                      )}
                      {liqTotals.taker > 0 && (
                        <span style={{ color: LIQ_COLORS.TAKER }}>
                          TAKER {((liqTotals.taker / totalFilledQty) * 100).toFixed(0)}%
                        </span>
                      )}
                      {liqTotals.cross > 0 && (
                        <span style={{ color: LIQ_COLORS.CROSS }}>
                          CROSS {((liqTotals.cross / totalFilledQty) * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {timeline.length >= 2 ? (
                <div>
                  <div className="text-[10px] text-muted mb-1">
                    Fill progression — {order.asset} {order.side} {order.quantity.toLocaleString()}{" "}
                    @ limit {order.limitPrice.toFixed(2)}
                  </div>
                  <ResponsiveContainer width="100%" height={90}>
                    <LineChart data={timeline} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke={COLOR.CHART_GRID} strokeDasharray="3 3" />
                      <XAxis dataKey="time" tick={{ fontSize: 9, fill: COLOR.CHART_AXIS }} />
                      <YAxis
                        yAxisId="pct"
                        domain={[0, 100]}
                        tick={{ fontSize: 9, fill: COLOR.CHART_AXIS }}
                        unit="%"
                        width={30}
                      />
                      <YAxis
                        yAxisId="px"
                        orientation="right"
                        tick={{ fontSize: 9, fill: COLOR.CHART_AXIS }}
                        width={50}
                        domain={["auto", "auto"]}
                      />
                      <Tooltip
                        contentStyle={{
                          background: COLOR.CHART_TOOLTIP_BG,
                          border: "1px solid #374151",
                          fontSize: 10,
                        }}
                        formatter={(v: unknown, name: string) =>
                          name === "pct"
                            ? [`${Number(v).toFixed(1)}%`, "Fill %"]
                            : [Number(v).toFixed(4), "Fill Px"]
                        }
                      />
                      <ReferenceLine
                        yAxisId="pct"
                        y={100}
                        stroke={COLOR.MAKER}
                        strokeDasharray="4 2"
                        strokeWidth={1}
                      />
                      <Line
                        yAxisId="pct"
                        type="monotone"
                        dataKey="pct"
                        stroke={COLOR.CROSS}
                        strokeWidth={1.5}
                        dot={false}
                        name="pct"
                      />
                      <Line
                        yAxisId="px"
                        type="monotone"
                        dataKey="fillPx"
                        stroke={COLOR.TAKER}
                        strokeWidth={1}
                        dot={false}
                        strokeDasharray="3 2"
                        name="fillPx"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-muted text-[10px]">
                  {filledChildren.length === 0
                    ? "No fills recorded"
                    : "Need ≥2 fills to render chart"}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function ExecutionsPanel() {
  const { incoming } = useChannelContext();
  const channelIn = useChannelIn();
  const showCfEditor = useSignal(false);
  const dragKey = useSignal<string | null>(null);

  const filterOrderId = incoming !== null ? channelIn.selectedOrderId : null;
  const filterAsset = incoming !== null && !filterOrderId ? channelIn.selectedAsset : null;

  const { containerRef, limit } = useContainerLimit();
  const { rows: serverRows, total, isLoading } = useGridQuery<OrderRecord>("executions", 0, limit);

  const { orderedCols, getWidth, getStickyProps, onResize, onReorder, onToggleFreeze } =
    useColumnLayout("executions", EXEC_COLS);

  const EXEC_FIELDS = EXEC_COLS.filter(
    (c) =>
      c.key !== "fillPct" &&
      c.key !== "impact" &&
      c.key !== "commission" &&
      c.key !== "slices" &&
      c.key !== "_expand"
  ).map(({ key, label, type, options }) => ({
    key,
    label,
    type,
    options,
  }));

  const tradeOrders = useMemo(
    () =>
      serverRows.filter((o) => {
        if (filterOrderId) return o.id === filterOrderId;
        if (filterAsset) return o.asset === filterAsset;
        return true;
      }),
    [serverRows, filterOrderId, filterAsset]
  );

  const SORTABLE_COLS = new Set(["submittedAt", "asset", "side", "strategy", "status"]);

  return (
    <div className="flex flex-col h-full text-xs relative" data-testid="executions-panel">
      <div className="px-2 py-1.5 border-b border-panel flex items-center gap-2 shrink-0">
        {filterOrderId && (
          <span className="text-[10px] text-amber-400 bg-amber-900/30 font-mono px-1.5 py-0.5 rounded">
            {filterOrderId.slice(0, 8)}
          </span>
        )}
        {filterAsset && !filterOrderId && (
          <span className="text-[10px] text-muted font-mono">{filterAsset}</span>
        )}
        {!isLoading && tradeOrders.length > 0 && (
          <span className="text-[10px] text-muted ml-auto">
            {tradeOrders.length !== total ? `${tradeOrders.length} / ${total}` : tradeOrders.length}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            showCfEditor.value = !showCfEditor.value;
          }}
          title="Conditional formatting rules"
          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
            showCfEditor.value
              ? "bg-sky-900/50 text-sky-400"
              : "text-muted hover:text-label hover:bg-panel"
          }`}
        >
          Format ⚙
        </button>
        <PopOutButton panelId="executions" />
      </div>

      <FilterBar gridId="executions" fields={EXEC_FIELDS} />

      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto">
        {isLoading && tradeOrders.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-muted">Loading…</div>
        ) : tradeOrders.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-muted">
            {filterOrderId
              ? `No executions for order ${filterOrderId.slice(0, 8)}`
              : filterAsset
                ? `No executions for ${filterAsset}`
                : total > 0
                  ? "No executions match the active filters"
                  : "No executions yet"}
          </div>
        ) : (
          <table className="w-full min-w-max text-xs" data-testid="executions-table">
            <thead>
              <tr className="text-muted border-b border-panel sticky top-0 bg-page">
                {orderedCols.map((col) => {
                  const sp = getStickyProps(col.key);
                  return (
                    <ResizableHeader
                      key={col.key}
                      colKey={col.key}
                      width={getWidth(col.key)}
                      minWidth={col.minWidth}
                      gridId="executions"
                      sortable={SORTABLE_COLS.has(col.key)}
                      frozen={sp !== null}
                      isLastFrozen={sp?.isLastFrozen}
                      style={sp?.style}
                      onResize={onResize}
                      onColumnDragStart={(k) => {
                        dragKey.value = k;
                      }}
                      onColumnDrop={(target) => {
                        if (dragKey.value) onReorder(dragKey.value, target);
                        dragKey.value = null;
                      }}
                      onToggleFreeze={onToggleFreeze}
                      align={col.align}
                      className={`px-3 py-2 bg-page ${col.align === "right" ? "text-right" : "text-left"}`}
                    >
                      {col.label}
                    </ResizableHeader>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {tradeOrders.map((order) => (
                <TradeRow
                  key={order.id}
                  order={order}
                  cols={orderedCols}
                  getWidth={getWidth}
                  getStickyProps={getStickyProps}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCfEditor.value && (
        <CfRuleEditor
          gridId="executions"
          fields={EXEC_COLS}
          onClose={() => {
            showCfEditor.value = false;
          }}
        />
      )}
    </div>
  );
}
