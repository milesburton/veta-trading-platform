import { useSignal } from "@preact/signals-react";
import { Fragment, useEffect } from "react";
import { useChannelContext } from "../contexts/ChannelContext.tsx";
import { useChannelOut } from "../hooks/useChannelOut.ts";
import { useColumnLayout } from "../hooks/useColumnLayout.ts";
import { useContainerLimit, useGridQuery } from "../hooks/useGridQuery.ts";
import { saveGridPrefs, setSort } from "../store/gridPrefsSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  cancelOrdersThunk,
  holdOrdersThunk,
  orderPatched,
  unholdOrdersThunk,
} from "../store/ordersSlice.ts";
import type { ColDef } from "../types/gridPrefs.ts";
import type { ChildOrder, OrderRecord, OrderStatus } from "../types.ts";
import { ORDER_STATUS_DESCRIPTIONS } from "../types.ts";
import { formatTime } from "../utils/format.ts";
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

const BLOTTER_COLS: ColDef[] = [
  { key: "submittedAt", label: "Time", type: "string", defaultWidth: 80 },
  { key: "id", label: "ID", type: "string", defaultWidth: 88 },
  { key: "asset", label: "Asset", type: "string", defaultWidth: 72 },
  {
    key: "side",
    label: "Side",
    type: "enum",
    options: ["BUY", "SELL"],
    defaultWidth: 52,
  },
  {
    key: "quantity",
    label: "Qty",
    type: "number",
    defaultWidth: 80,
    align: "right",
  },
  {
    key: "limitPrice",
    label: "Limit/Fill",
    type: "number",
    defaultWidth: 88,
    align: "right",
  },
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
  {
    key: "desk",
    label: "Desk",
    type: "enum",
    options: ["equity", "fi", "derivatives", "otc"],
    defaultWidth: 72,
  },
  {
    key: "marketType",
    label: "Mkt",
    type: "enum",
    options: ["lit", "dark", "otc"],
    defaultWidth: 48,
  },
  { key: "userId", label: "Booked By", type: "string", defaultWidth: 80 },
  { key: "counterparty", label: "Cpty", type: "string", defaultWidth: 64 },
  { key: "liquidityFlag", label: "Liq", type: "string", defaultWidth: 44 },
  {
    key: "commission",
    label: "Comm",
    type: "number",
    defaultWidth: 64,
    align: "right",
  },
  { key: "settlementDate", label: "Settle", type: "string", defaultWidth: 64 },
];

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

export function OrderBlotter() {
  const { cfRules } = useAppSelector((s) => s.gridPrefs.orderBlotter);
  const lastSubmittedOrderId = useAppSelector((s) => s.orders.lastSubmittedOrderId);
  const userRole = useAppSelector((s) => s.auth.user?.role);
  const userId = useAppSelector((s) => s.auth.user?.id);
  const { containerRef, limit } = useContainerLimit();
  const {
    rows: displayOrders,
    total,
    isLoading,
  } = useGridQuery<OrderRecord>("orderBlotter", 0, limit);
  const selectedOrderId = useSignal<string | null>(null);
  const selectedIds = useSignal<Set<string>>(new Set());
  const lastClickedId = useSignal<string | null>(null);
  const userPinnedId = useSignal<string | null>(null);
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

  const topOrderId = displayOrders[0]?.id ?? null;

  useEffect(() => {
    if (topOrderId === null) return;
    if (
      selectedOrderId.value === null ||
      (topOrderId !== selectedOrderId.value && userPinnedId.value === null)
    ) {
      selectedOrderId.value = topOrderId;
      broadcast({ selectedOrderId: topOrderId });
    }
  }, [topOrderId, broadcast, selectedOrderId, userPinnedId]);

  useEffect(() => {
    if (!lastSubmittedOrderId) return;
    selectedOrderId.value = lastSubmittedOrderId;
    userPinnedId.value = null;
    broadcast({ selectedOrderId: lastSubmittedOrderId });
  }, [lastSubmittedOrderId, broadcast, selectedOrderId, userPinnedId]);

  function selectOrder(id: string, e?: React.MouseEvent) {
    if (e?.shiftKey && lastClickedId.value) {
      const ids = displayOrders.map((o) => o.id);
      const from = ids.indexOf(lastClickedId.value);
      const to = ids.indexOf(id);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        const next = new Set(selectedIds.value);
        for (let i = lo; i <= hi; i++) next.add(ids[i]);
        selectedIds.value = next;
      }
    } else if (e?.ctrlKey || e?.metaKey) {
      const next = new Set(selectedIds.value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      selectedIds.value = next;
    } else {
      selectedIds.value = new Set([id]);
    }
    lastClickedId.value = id;
    const next =
      selectedOrderId.value === id && !e?.shiftKey && !e?.ctrlKey && !e?.metaKey ? null : id;
    selectedOrderId.value = next;
    userPinnedId.value = next;
    broadcast({ selectedOrderId: next });
  }

  function toggleSelectAll() {
    if (selectedIds.value.size === displayOrders.length) {
      selectedIds.value = new Set();
    } else {
      selectedIds.value = new Set(displayOrders.map((o) => o.id));
    }
  }

  function openOrderCtxMenu(e: React.MouseEvent, orderId: string) {
    e.preventDefault();
    e.stopPropagation();
    const order = displayOrders.find((o) => o.id === orderId);
    if (!order) return;

    if (!selectedIds.value.has(orderId)) {
      selectedIds.value = new Set([orderId]);
      lastClickedId.value = orderId;
    }

    const targetIds = selectedIds.value.size > 1 ? [...selectedIds.value] : [orderId];
    const targetOrders = displayOrders.filter((o) => targetIds.includes(o.id));
    const hasActive = targetOrders.some((o) => o.status === "pending" || o.status === "working");
    const hasHeld = targetOrders.some((o) => o.status === "held");
    const allBelongToUser = targetOrders.every((o) => o.userId === userId);
    const canManage =
      userRole === "admin" ||
      userRole === "risk-manager" ||
      userRole === "desk-head" ||
      (userRole === "trader" && allBelongToUser);
    const canKill = userRole === "admin" || userRole === "risk-manager";
    const multi = targetIds.length > 1;
    const label = multi ? `${targetIds.length} orders` : order.id.slice(0, 8);

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
        disabled: multi,
        onClick: () => navigator.clipboard.writeText(order.id),
      },
      { separator: true },
      {
        label: `Hold ${label}`,
        icon: "⏸",
        disabled: !hasActive || !canManage,
        title: !canManage
          ? "Insufficient permissions"
          : !hasActive
            ? "No active orders"
            : `Pause ${label}`,
        onClick: () => {
          for (const id of targetIds) dispatch(orderPatched({ id, patch: { status: "held" } }));
          dispatch(holdOrdersThunk(targetIds) as never);
        },
      },
      {
        label: `Unhold ${label}`,
        icon: "▶",
        disabled: !hasHeld || !canManage,
        title: !canManage
          ? "Insufficient permissions"
          : !hasHeld
            ? "No held orders"
            : `Resume ${label}`,
        onClick: () => {
          for (const id of targetIds) dispatch(orderPatched({ id, patch: { status: "working" } }));
          dispatch(unholdOrdersThunk(targetIds) as never);
        },
      },
      {
        label: `Cancel ${label}`,
        icon: "✕",
        danger: true,
        disabled: !(hasActive || hasHeld) || !canManage,
        title: !canManage ? "Insufficient permissions" : "Cancel selected orders",
        onClick: () => {
          for (const id of targetIds)
            dispatch(orderPatched({ id, patch: { status: "cancelled" } }));
          dispatch(cancelOrdersThunk(targetIds) as never);
          selectedIds.value = new Set();
        },
      },
    ];

    if (canKill) {
      items.push({ separator: true });
      items.push({
        label: `Force kill ${label}`,
        icon: "⚡",
        danger: true,
        title: "Immediately terminate — admin/risk-manager only",
        onClick: () => {
          for (const id of targetIds)
            dispatch(orderPatched({ id, patch: { status: "cancelled" } }));
          dispatch(cancelOrdersThunk(targetIds) as never);
          selectedIds.value = new Set();
        },
      });
    }

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
    <div className="flex flex-col h-full relative" data-testid="order-blotter-panel">
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
      <div
        className="px-3 py-1.5 border-b border-gray-800 flex items-center gap-2 shrink-0"
        data-testid="blotter-filter-bar"
      >
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

      {selectedIds.value.size > 1 && (
        <div
          data-testid="multi-select-bar"
          className="flex items-center gap-3 px-3 py-1 bg-sky-950/40 border-b border-sky-800/40 text-[10px] text-sky-300 shrink-0"
        >
          <span className="font-medium">{selectedIds.value.size} orders selected</span>
          <button
            type="button"
            onClick={() => {
              selectedIds.value = new Set();
            }}
            className="text-sky-500 hover:text-sky-300"
          >
            Clear
          </button>
        </div>
      )}

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
          <table className="w-full text-xs" data-testid="orders-table">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800 sticky top-0 bg-gray-950">
                <th className="w-8 px-1 py-2 text-center">
                  <input
                    type="checkbox"
                    data-testid="select-all-checkbox"
                    checked={
                      displayOrders.length > 0 && selectedIds.value.size === displayOrders.length
                    }
                    onChange={toggleSelectAll}
                    className="accent-emerald-500 cursor-pointer"
                    title="Select all"
                  />
                </th>
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
                      data-testid={`order-row-${order.id}`}
                      onClick={(e) => selectOrder(order.id, e)}
                      onContextMenu={(e) => openOrderCtxMenu(e, order.id)}
                      aria-selected={
                        selectedIds.value.has(order.id) || selectedOrderId.value === order.id
                      }
                      title={`${order.side} ${order.quantity.toLocaleString()} ${order.asset} @ ${formatPrice(
                        order.asset,
                        order.limitPrice
                      )} — ${order.status}. Right-click for actions.`}
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
                      <td
                        className="w-8 px-1 py-1.5 text-center"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === " ") e.stopPropagation();
                        }}
                      >
                        <input
                          type="checkbox"
                          data-testid={`select-order-${order.id}`}
                          checked={selectedIds.value.has(order.id)}
                          onChange={() => {
                            const next = new Set(selectedIds.value);
                            if (next.has(order.id)) next.delete(order.id);
                            else next.add(order.id);
                            selectedIds.value = next;
                          }}
                          className="accent-emerald-500 cursor-pointer"
                        />
                      </td>
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
                                <span className="flex items-center gap-1.5">
                                  {order.id.slice(0, 8)}
                                  {order.children.length > 0 && (
                                    <span className="text-[9px] text-gray-600 bg-gray-800 rounded px-1 tabular-nums">
                                      {order.children.length}
                                    </span>
                                  )}
                                </span>
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
                                className={`px-3 py-1.5 font-semibold ${
                                  order.side === "BUY" ? "text-emerald-400" : "text-red-400"
                                } ${cellCls}`}
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
                                  data-testid="order-status-badge"
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                                    STATUS_STYLES[order.status]
                                  }`}
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
