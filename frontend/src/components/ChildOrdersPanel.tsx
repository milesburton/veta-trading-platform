import { useSignal } from "@preact/signals-react";
import { useChannelContext } from "../contexts/ChannelContext.tsx";
import { useChannelIn } from "../hooks/useChannelIn.ts";
import { useChannelOut } from "../hooks/useChannelOut.ts";
import { useAppSelector } from "../store/hooks.ts";
import type { ChildOrder, LiquidityFlag, OrderStatus } from "../types.ts";
import { ORDER_STATUS_DESCRIPTIONS } from "../types.ts";
import { CHANNEL_COLOURS } from "./DashboardLayout.tsx";

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

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ChildOrdersPanel() {
  const channelIn = useChannelIn();
  const broadcast = useChannelOut();
  const { incoming, outgoing } = useChannelContext();

  const inColour = incoming !== null ? (CHANNEL_COLOURS[incoming]?.hex ?? null) : null;
  const outColour = outgoing !== null ? (CHANNEL_COLOURS[outgoing]?.hex ?? null) : null;

  const parentOrderId = channelIn.selectedOrderId;
  const selectedChildId = useSignal<string | null>(null);

  const orders = useAppSelector((s) => s.orders.orders);
  const parentOrder = parentOrderId ? orders.find((o) => o.id === parentOrderId) : null;
  const children: ChildOrder[] = parentOrder?.children ?? [];

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
            ? `${parentOrder.asset} ${parentOrder.side} ${parentOrder.quantity} — ${children.length} slice${children.length !== 1 ? "s" : ""}`
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
              <tr className="border-b border-gray-700">
                <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 whitespace-nowrap">
                  Time
                </th>
                <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 whitespace-nowrap">
                  Slice ID
                </th>
                <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500">
                  Qty
                </th>
                <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500">
                  Fill Px
                </th>
                <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500">
                  Filled
                </th>
                <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500">
                  Venue
                </th>
                <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500">
                  Status
                </th>
                <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500">
                  Cpty
                </th>
                <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500">Liq</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500">
                  Comm
                </th>
                <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500">
                  Settle
                </th>
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
                        className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${STATUS_STYLES[child.status]}`}
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
