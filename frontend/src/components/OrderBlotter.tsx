import { useSignal } from "@preact/signals-react";
import { Fragment, useEffect } from "react";
import { useChannelContext } from "../contexts/ChannelContext.tsx";
import { useChannelOut } from "../hooks/useChannelOut.ts";
import { useColumnLayout } from "../hooks/useColumnLayout.ts";
import { useContainerLimit, useGridQuery } from "../hooks/useGridQuery.ts";
import { saveGridPrefs, setSort } from "../store/gridPrefsSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { orderPatched } from "../store/ordersSlice.ts";
import type { ColDef } from "../types/gridPrefs.ts";
import type { ChildOrder, LiquidityFlag, OrderRecord, OrderStatus } from "../types.ts";
import { ORDER_STATUS_DESCRIPTIONS } from "../types.ts";
import { applyCfRules } from "../utils/gridFilter.ts";
import type { ContextMenuEntry } from "./ContextMenu.tsx";
import { ContextMenu } from "./ContextMenu.tsx";
import { CHANNEL_COLOURS } from "./DashboardLayout.tsx";
import { CfRuleEditor } from "./grid/CfRuleEditor.tsx";
import { FilterBar } from "./grid/FilterBar.tsx";
import { ResizableHeader } from "./grid/ResizableHeader.tsx";
import { PopOutButton } from "./PopOutButton.tsx";

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: "bg-amber-900/50 text-amber-300 border border-amber-700/50",
  working: "bg-sky-900/50 text-sky-300 border border-sky-700/50",
  filled: "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50",
  expired: "bg-gray-800/50 text-gray-500 border border-gray-700/50",
  rejected: "bg-red-950/60 text-red-400 border border-red-800/50",
  cancelled: "bg-orange-950/50 text-orange-400 border border-orange-800/50",
  held: "bg-yellow-950/50 text-yellow-400 border border-yellow-700/50",
};

const LIQ_STYLES: Record<LiquidityFlag, string> = {
  MAKER: "text-emerald-500",
  TAKER: "text-amber-500",
  CROSS: "text-sky-500",
};

const BLOTTER_COLS: ColDef[] = [
  { key: "submittedAt", label: "Time", type: "string", defaultWidth: 80 },
  { key: "id", label: "ID", type: "string", defaultWidth: 88 },
  { key: "asset", label: "Asset", type: "string", defaultWidth: 72 },
  { key: "side", label: "Side", type: "enum", options: ["BUY", "SELL"], defaultWidth: 52 },
  { key: "quantity", label: "Qty", type: "number", defaultWidth: 80, align: "right" },
  { key: "limitPrice", label: "Limit/Fill", type: "number", defaultWidth: 88, align: "right" },
  {
    key: "strategy",
    label: "Strat/Venue",
    type: "enum",
    options: ["LIMIT", "TWAP", "POV", "VWAP"],
    defaultWidth: 88,
  },
  {
    key: "status",
    label: "Status",
    type: "enum",
    options: ["pending", "working", "filled", "expired", "rejected", "cancelled", "held"],
    defaultWidth: 80,
  },
  { key: "userId", label: "Booked By", type: "string", defaultWidth: 80 },
  { key: "counterparty", label: "Cpty", type: "string", defaultWidth: 64 },
  { key: "liquidityFlag", label: "Liq", type: "string", defaultWidth: 44 },
  { key: "commission", label: "Comm", type: "number", defaultWidth: 64, align: "right" },
  { key: "settlementDate", label: "Settle", type: "string", defaultWidth: 64 },
];

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatPrice(asset: string, price: number) {
  return asset.includes("/") ? price.toFixed(4) : price.toFixed(2);
}

function avgFillPrice(children: ChildOrder[]): string {
  const filled = children.filter((c) => c.status === "filled" && c.filled > 0);
  if (filled.length === 0) return "—";
  const totalQty = filled.reduce((s, c) => s + c.filled, 0);
  const totalValue = filled.reduce((s, c) => s + (c.avgFillPrice ?? c.limitPrice) * c.filled, 0);
  return totalQty > 0 ? (totalValue / totalQty).toFixed(4) : "—";
}

function totalCommission(children: ChildOrder[]): string {
  const total = children.reduce((s, c) => s + (c.commissionUSD ?? 0), 0);
  if (total === 0) return "—";
  return `$${total.toFixed(2)}`;
}

function ChildRows({ rows, asset }: { rows: ChildOrder[]; asset: string }) {
  return (
    <>
      {rows.map((child) => (
        <tr key={child.id} className="border-b border-gray-800/20 bg-gray-900/40">
          <td className="pl-8 pr-3 py-1 text-gray-600 tabular-nums whitespace-nowrap">
            {formatTime(child.submittedAt)}
          </td>
          <td className="px-3 py-1 text-gray-600 font-mono">↳ {child.id.slice(0, 8)}</td>
          <td className="px-3 py-1 text-gray-500">{asset}</td>
          <td
            className={`px-3 py-1 text-xs ${child.side === "BUY" ? "text-emerald-600" : "text-red-600"}`}
          >
            {child.side}
          </td>
          <td className="px-3 py-1 text-right tabular-nums text-gray-500">
            {child.quantity.toFixed(1)}
          </td>
          <td className="px-3 py-1 text-right tabular-nums text-gray-500">
            {formatPrice(asset, child.avgFillPrice ?? child.limitPrice)}
          </td>
          <td className="px-3 py-1 text-gray-600">
            {child.venue ? (
              <span className="text-[9px] font-mono text-gray-500 bg-gray-800 rounded px-1">
                {child.venue}
              </span>
            ) : (
              "child"
            )}
          </td>
          <td className="px-3 py-1">
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${STATUS_STYLES[child.status]}`}
              title={ORDER_STATUS_DESCRIPTIONS[child.status]}
            >
              {child.status}
            </span>
          </td>
          <td className="px-3 py-1 text-gray-600 font-mono text-[9px]">
            {child.counterparty ?? "—"}
          </td>
          <td
            className={`px-3 py-1 text-[9px] font-semibold ${child.liquidityFlag ? LIQ_STYLES[child.liquidityFlag] : "text-gray-600"}`}
          >
            {child.liquidityFlag ?? "—"}
          </td>
          <td className="px-3 py-1 text-right tabular-nums text-gray-500 text-[9px]">
            {child.commissionUSD !== undefined ? `$${child.commissionUSD.toFixed(2)}` : "—"}
          </td>
          <td className="px-3 py-1 text-gray-600 font-mono text-[9px]">
            {child.settlementDate ?? "—"}
          </td>
        </tr>
      ))}
    </>
  );
}

export function OrderBlotter() {
  const { cfRules } = useAppSelector((s) => s.gridPrefs.orderBlotter);
  const { containerRef, limit } = useContainerLimit();
  const {
    rows: displayOrders,
    total,
    isLoading,
  } = useGridQuery<OrderRecord>("orderBlotter", 0, limit);
  const expanded = useSignal<Set<string>>(new Set());
  const selectedOrderId = useSignal<string | null>(null);
  const showCfEditor = useSignal(false);
  const filterField = useSignal<string | null>(null);
  const dragKey = useSignal<string | null>(null);
  const broadcast = useChannelOut();
  const dispatch = useAppDispatch();
  const ctxMenu = useSignal<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const { outgoing } = useChannelContext();
  const channelColour = outgoing !== null ? (CHANNEL_COLOURS[outgoing]?.hex ?? null) : null;

  const { orderedCols, getWidth, onResize, onReorder } = useColumnLayout(
    "orderBlotter",
    BLOTTER_COLS
  );

  const BLOTTER_FIELDS = BLOTTER_COLS.map(({ key, label, type, options }) => ({
    key,
    label,
    type,
    options,
  }));

  useEffect(() => {
    if (selectedOrderId.value === null && displayOrders.length > 0) {
      const latest = displayOrders[displayOrders.length - 1];
      selectedOrderId.value = latest.id;
      broadcast({ selectedOrderId: latest.id });
    }
  }, [displayOrders.length, displayOrders, broadcast, selectedOrderId]);

  function selectOrder(id: string) {
    const next = selectedOrderId.value === id ? null : id;
    selectedOrderId.value = next;
    broadcast({ selectedOrderId: next });
  }

  function toggleExpand(id: string) {
    const next = new Set(expanded.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded.value = next;
  }

  function openOrderCtxMenu(e: React.MouseEvent, orderId: string) {
    e.preventDefault();
    e.stopPropagation();
    const order = displayOrders.find((o) => o.id === orderId);
    if (!order) return;
    const isActive = order.status === "pending" || order.status === "working";
    const items: ContextMenuEntry[] = [
      {
        label: "Select & broadcast",
        icon: "↗",
        onClick: () => selectOrder(order.id),
      },
      {
        label: "View asset in ladder",
        icon: "↗",
        onClick: () => broadcast({ selectedAsset: order.asset }),
      },
      { separator: true },
      {
        label: "Copy order ID",
        icon: "⎘",
        onClick: () => navigator.clipboard.writeText(order.id),
      },
      { separator: true },
      {
        label: "Cancel order",
        icon: "✕",
        danger: true,
        disabled: !isActive,
        title: isActive ? "Mark order as expired/cancelled" : "Order is already complete",
        onClick: () => {
          dispatch(orderPatched({ id: order.id, patch: { status: "expired" } }));
        },
      },
    ];
    ctxMenu.value = { x: e.clientX, y: e.clientY, items };
  }

  function openHeaderCtxMenu(e: React.MouseEvent, field: string | null, label: string) {
    e.preventDefault();
    const items: ContextMenuEntry[] = [];
    if (field) {
      items.push(
        {
          label: "Sort A → Z",
          icon: "↑",
          onClick: () => {
            dispatch(setSort({ gridId: "orderBlotter", field, dir: "asc" }));
            dispatch(saveGridPrefs());
          },
        },
        {
          label: "Sort Z → A",
          icon: "↓",
          onClick: () => {
            dispatch(setSort({ gridId: "orderBlotter", field, dir: "desc" }));
            dispatch(saveGridPrefs());
          },
        }
      );
    }
    items.push(
      {
        label: "Reset sort",
        icon: "↕",
        onClick: () => {
          dispatch(setSort({ gridId: "orderBlotter", field: null, dir: null }));
          dispatch(saveGridPrefs());
        },
      },
      { separator: true },
      {
        label: `Filter by ${label}`,
        icon: "⊟",
        onClick: () => {
          filterField.value = field ?? BLOTTER_FIELDS[0].key;
        },
      }
    );
    ctxMenu.value = { x: e.clientX, y: e.clientY, items };
  }

  const SORTABLE_COLS = new Set([
    "submittedAt",
    "asset",
    "side",
    "quantity",
    "limitPrice",
    "strategy",
    "status",
    "userId",
  ]);

  return (
    <div className="flex flex-col h-full relative">
      {ctxMenu.value && (
        <ContextMenu
          items={ctxMenu.value.items}
          x={ctxMenu.value.x}
          y={ctxMenu.value.y}
          onClose={() => {
            ctxMenu.value = null;
          }}
        />
      )}
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center gap-2 shrink-0">
        {selectedOrderId.value && channelColour && (
          <span
            className="text-[10px] rounded px-1.5 py-0.5 font-mono tabular-nums shrink-0"
            style={{ color: channelColour, background: `${channelColour}22` }}
            title="Broadcasting selected order to linked panels"
          >
            ↗ {selectedOrderId.value.slice(0, 8)}
          </span>
        )}
        <span className="text-[10px] text-gray-600 ml-auto">
          {isLoading
            ? "…"
            : displayOrders.length !== total
              ? `${displayOrders.length} / ${total}`
              : `${total} order${total !== 1 ? "s" : ""}`}
        </span>
        <button
          type="button"
          onClick={() => {
            showCfEditor.value = !showCfEditor.value;
          }}
          title="Conditional formatting rules"
          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
            showCfEditor.value
              ? "bg-sky-900/50 text-sky-400"
              : "text-gray-600 hover:text-gray-400 hover:bg-gray-800"
          }`}
        >
          Format ⚙
        </button>
        <PopOutButton panelId="order-blotter" />
      </div>

      <FilterBar gridId="orderBlotter" fields={BLOTTER_FIELDS} openFieldSignal={filterField} />

      <div ref={containerRef} className="overflow-auto flex-1">
        {isLoading && displayOrders.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-600 text-xs">
            Loading…
          </div>
        ) : total === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-600 text-xs">
            No orders submitted yet
          </div>
        ) : displayOrders.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-600 text-xs">
            No orders match the active filters
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800 sticky top-0 bg-gray-950">
                {orderedCols.map((col) => (
                  <ResizableHeader
                    key={col.key}
                    colKey={col.key}
                    width={getWidth(col.key)}
                    minWidth={col.minWidth}
                    gridId="orderBlotter"
                    sortable={SORTABLE_COLS.has(col.key)}
                    onResize={onResize}
                    onColumnDragStart={(k) => {
                      dragKey.value = k;
                    }}
                    onColumnDrop={(target) => {
                      if (dragKey.value) onReorder(dragKey.value, target);
                      dragKey.value = null;
                    }}
                    onContextMenu={(e) => openHeaderCtxMenu(e, col.key, col.label)}
                    align={col.align}
                    className={`px-3 py-2 ${col.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {col.label}
                  </ResizableHeader>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayOrders.map((order) => {
                const { rowClasses, cellClasses } = applyCfRules(order, cfRules);
                return (
                  <Fragment key={order.id}>
                    <tr
                      onClick={() => selectOrder(order.id)}
                      onContextMenu={(e) => openOrderCtxMenu(e, order.id)}
                      aria-selected={selectedOrderId.value === order.id}
                      title={`${order.side} ${order.quantity.toLocaleString()} ${order.asset} @ ${formatPrice(order.asset, order.limitPrice)} — ${order.status}. Right-click for actions.`}
                      style={
                        selectedOrderId.value === order.id && channelColour
                          ? {
                              borderLeft: `3px solid ${channelColour}`,
                              background: `${channelColour}18`,
                            }
                          : { borderLeft: "3px solid transparent" }
                      }
                      className={`border-b border-gray-800/40 cursor-pointer transition-colors ${rowClasses} ${
                        selectedOrderId.value === order.id && !channelColour
                          ? "bg-sky-900/20 border-l-2 border-l-sky-500"
                          : selectedOrderId.value !== order.id
                            ? "hover:bg-gray-800/20"
                            : ""
                      }`}
                    >
                      {orderedCols.map((col) => {
                        const cellCls = cellClasses[col.key] ?? "";
                        switch (col.key) {
                          case "submittedAt":
                            return (
                              <td
                                key={col.key}
                                className={`px-3 py-1.5 text-gray-500 tabular-nums whitespace-nowrap ${cellCls}`}
                              >
                                {formatTime(order.submittedAt)}
                              </td>
                            );
                          case "id":
                            return (
                              <td
                                key={col.key}
                                className={`px-3 py-1.5 text-gray-500 font-mono ${cellCls}`}
                              >
                                {order.children.length > 0 ? (
                                  <button
                                    type="button"
                                    aria-expanded={expanded.value.has(order.id)}
                                    aria-label={`${expanded.value.has(order.id) ? "Collapse" : "Expand"} ${order.children.length} child executions`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleExpand(order.id);
                                    }}
                                    className="flex items-center gap-1 hover:text-gray-300 transition-colors"
                                  >
                                    <span>{expanded.value.has(order.id) ? "▾" : "▸"}</span>
                                    {order.id.slice(0, 8)}
                                    <span className="text-gray-700 ml-0.5">
                                      ({order.children.length})
                                    </span>
                                  </button>
                                ) : (
                                  order.id.slice(0, 8)
                                )}
                              </td>
                            );
                          case "asset":
                            return (
                              <td
                                key={col.key}
                                className={`px-3 py-1.5 font-semibold text-gray-200 ${cellCls}`}
                              >
                                {order.asset}
                              </td>
                            );
                          case "side":
                            return (
                              <td
                                key={col.key}
                                className={`px-3 py-1.5 font-semibold ${order.side === "BUY" ? "text-emerald-400" : "text-red-400"} ${cellCls}`}
                              >
                                {order.side}
                              </td>
                            );
                          case "quantity":
                            return (
                              <td
                                key={col.key}
                                className={`px-3 py-1.5 text-right tabular-nums text-gray-200 ${cellCls}`}
                              >
                                {order.quantity.toLocaleString()}
                              </td>
                            );
                          case "limitPrice":
                            return (
                              <td
                                key={col.key}
                                className={`px-3 py-1.5 text-right tabular-nums text-gray-300 ${cellCls}`}
                              >
                                {order.children.length > 0
                                  ? avgFillPrice(order.children)
                                  : formatPrice(order.asset, order.limitPrice)}
                              </td>
                            );
                          case "strategy":
                            return (
                              <td key={col.key} className={`px-3 py-1.5 text-gray-400 ${cellCls}`}>
                                {order.strategy}
                              </td>
                            );
                          case "status":
                            return (
                              <td key={col.key} className={`px-3 py-1.5 ${cellCls}`}>
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[order.status]}`}
                                  title={ORDER_STATUS_DESCRIPTIONS[order.status]}
                                >
                                  {order.status}
                                </span>
                              </td>
                            );
                          case "userId":
                            return (
                              <td
                                key={col.key}
                                className={`px-3 py-1.5 text-gray-500 font-mono text-[10px] ${cellCls}`}
                                title={order.userId}
                              >
                                {order.userId ?? "—"}
                              </td>
                            );
                          case "counterparty":
                            return (
                              <td key={col.key} className="px-3 py-1.5 text-gray-600">
                                —
                              </td>
                            );
                          case "liquidityFlag":
                            return (
                              <td key={col.key} className="px-3 py-1.5 text-gray-600">
                                —
                              </td>
                            );
                          case "commission":
                            return (
                              <td
                                key={col.key}
                                className={`px-3 py-1.5 text-right tabular-nums text-gray-500 ${cellCls}`}
                              >
                                {totalCommission(order.children)}
                              </td>
                            );
                          case "settlementDate":
                            return (
                              <td
                                key={col.key}
                                className="px-3 py-1.5 text-gray-600 font-mono text-[9px]"
                              >
                                {order.settlementDate ?? "—"}
                              </td>
                            );
                          default:
                            return <td key={col.key} className="px-3 py-1.5 text-gray-600" />;
                        }
                      })}
                    </tr>
                    {expanded.value.has(order.id) && order.children.length > 0 && (
                      <ChildRows rows={order.children} asset={order.asset} />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCfEditor.value && (
        <CfRuleEditor
          gridId="orderBlotter"
          fields={BLOTTER_COLS}
          onClose={() => {
            showCfEditor.value = false;
          }}
        />
      )}
    </div>
  );
}
