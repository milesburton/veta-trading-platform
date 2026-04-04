import { useSignal } from "@preact/signals-react";
import { useChannelContext } from "../contexts/ChannelContext.tsx";
import { useChannelIn } from "../hooks/useChannelIn.ts";
import { useChannelOut } from "../hooks/useChannelOut.ts";
import { useColumnLayout } from "../hooks/useColumnLayout.ts";
import { useQueryGridQuery } from "../store/gridApi.ts";
import type { ColDef } from "../types/gridPrefs.ts";
import type { ChildOrder, LiquidityFlag, OrderRecord, OrderStatus } from "../types.ts";
import { ORDER_STATUS_DESCRIPTIONS } from "../types.ts";
import { formatTime } from "../utils/format.ts";
import { CHANNEL_COLOURS } from "./DashboardLayout.tsx";
import { ResizableHeader } from "./grid/ResizableHeader.tsx";

const CHILD_COLS: ColDef[] = [
  { key: "time", label: "Time", type: "string", defaultWidth: 80 },
  { key: "sliceId", label: "Slice ID", type: "string", defaultWidth: 96 },
  {
    key: "qty",
    label: "Qty",
    type: "number",
    defaultWidth: 64,
    align: "right",
  },
  {
    key: "fillPx",
    label: "Fill Px",
    type: "number",
    defaultWidth: 72,
    align: "right",
  },
  {
    key: "filled",
    label: "Filled",
    type: "number",
    defaultWidth: 64,
    align: "right",
  },
  { key: "venue", label: "Venue", type: "string", defaultWidth: 64 },
  { key: "status", label: "Status", type: "string", defaultWidth: 72 },
  { key: "cpty", label: "Cpty", type: "string", defaultWidth: 72 },
  { key: "liq", label: "Liq", type: "string", defaultWidth: 44 },
  {
    key: "comm",
    label: "Comm",
    type: "number",
    defaultWidth: 64,
    align: "right",
  },
  { key: "settle", label: "Settle", type: "string", defaultWidth: 64 },
];

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

export function ChildOrdersPanel() {
  const channelIn = useChannelIn();
  const broadcast = useChannelOut();
  const { incoming, outgoing } = useChannelContext();

  const inColour = incoming !== null ? (CHANNEL_COLOURS[incoming]?.hex ?? null) : null;
  const outColour = outgoing !== null ? (CHANNEL_COLOURS[outgoing]?.hex ?? null) : null;

  const parentOrderId = channelIn.selectedOrderId;
  const selectedChildId = useSignal<string | null>(null);
  const dragKey = useSignal<string | null>(null);

  const { data: gridData } = useQueryGridQuery(
    {
      gridId: "orderBlotter",
      filterExpr: {
        kind: "group",
        id: "root",
        join: "AND",
        rules: [
          {
            kind: "rule",
            id: "r0",
            field: "id",
            op: "=",
            value: parentOrderId ?? "",
          },
        ],
      },
      sortField: null,
      sortDir: null,
      offset: 0,
      limit: 1,
    },
    { skip: !parentOrderId, pollingInterval: 3_000 }
  );
  const parentOrder: OrderRecord | null = (gridData?.rows[0] as OrderRecord | undefined) ?? null;
  const children: ChildOrder[] = (parentOrder?.children as ChildOrder[] | undefined) ?? [];

  const { orderedCols, getWidth, onResize, onReorder } = useColumnLayout("childOrders", CHILD_COLS);

  function selectChild(id: string) {
    const next = selectedChildId.value === id ? null : id;
    selectedChildId.value = next;
    broadcast({ selectedOrderId: next });
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800 shrink-0 min-h-0">
        {inColour && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: inColour }}
            title="Receives selected order from linked panel"
          />
        )}
        <span className="text-[11px] text-gray-400 font-medium truncate">
          {parentOrder
            ? `${parentOrder.asset} ${parentOrder.side} ${parentOrder.quantity} — ${children.length} slice${
                children.length !== 1 ? "s" : ""
              }`
            : "No order selected"}
        </span>
        {outColour && (
          <span
            className="ml-auto w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: outColour }}
            title="Broadcasts selected child to linked panel"
          />
        )}
      </div>

      {/* No parent selected */}
      {!parentOrder && (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-[11px]">
          {incoming !== null
            ? "Select an order in the linked blotter"
            : "Link an incoming channel from an Order Blotter"}
        </div>
      )}

      {/* Children table */}
      {parentOrder && children.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-[11px]">
          No execution slices yet
        </div>
      )}

      {parentOrder && children.length > 0 && (
        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-900">
              <tr className="border-b border-gray-700 text-gray-500 text-[10px] font-medium">
                {orderedCols.map((col) => (
                  <ResizableHeader
                    key={col.key}
                    colKey={col.key}
                    width={getWidth(col.key)}
                    minWidth={col.minWidth}
                    gridId="childOrders"
                    onResize={onResize}
                    onColumnDragStart={(k) => {
                      dragKey.value = k;
                    }}
                    onColumnDrop={(target) => {
                      if (dragKey.value) onReorder(dragKey.value, target);
                      dragKey.value = null;
                    }}
                    align={col.align}
                    className={`px-3 py-1.5 ${col.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {col.label}
                  </ResizableHeader>
                ))}
              </tr>
            </thead>
            <tbody>
              {children.map((child) => {
                const isSelected = selectedChildId.value === child.id;
                return (
                  <tr
                    key={child.id}
                    onClick={() => selectChild(child.id)}
                    className={`border-b border-gray-800/40 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-sky-900/20 border-l-2 border-l-sky-500"
                        : "hover:bg-gray-800/30"
                    }`}
                  >
                    <td className="px-3 py-1.5 tabular-nums whitespace-nowrap text-gray-400">
                      {formatTime(child.submittedAt)}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-gray-500">
                      {child.id.slice(0, 12)}…
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-300">
                      {child.quantity}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-300">
                      {child.avgFillPrice !== undefined
                        ? child.avgFillPrice.toFixed(4)
                        : child.limitPrice.toFixed(4)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-400">
                      {child.filled > 0 ? child.filled : "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      {child.venue ? (
                        <span className="text-[9px] font-mono text-gray-500 bg-gray-800 rounded px-1">
                          {child.venue}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                          STATUS_STYLES[child.status]
                        }`}
                        title={ORDER_STATUS_DESCRIPTIONS[child.status]}
                      >
                        {child.status}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[9px] text-gray-500">
                      {child.counterparty ?? "—"}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-[9px] font-semibold ${
                        child.liquidityFlag ? LIQ_STYLES[child.liquidityFlag] : "text-gray-600"
                      }`}
                    >
                      {child.liquidityFlag ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[9px] text-gray-500">
                      {child.commissionUSD !== undefined
                        ? `$${child.commissionUSD.toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[9px] text-gray-600">
                      {child.settlementDate ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
