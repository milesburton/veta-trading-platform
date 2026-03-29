import { useSignal } from "@preact/signals-react";
import { useEffect, useRef } from "react";
import { useAppSelector } from "../store/hooks.ts";

type SellSideRfqState =
  | "CLIENT_REQUEST"
  | "SALES_REVIEW"
  | "DEALER_QUOTE"
  | "SALES_MARKUP"
  | "CLIENT_CONFIRMATION"
  | "CONFIRMED"
  | "REJECTED";

interface SellSideRfq {
  rfqId: string;
  state: SellSideRfqState;
  clientUserId: string;
  salesUserId?: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice?: number;
  dealerBestPrice?: number;
  salesMarkupBps?: number;
  clientQuotedPrice?: number;
  rejectedBy?: string;
  rejectionReason?: string;
  createdAt: number;
  ts: number;
}

const STATE_COLOURS: Record<SellSideRfqState, string> = {
  CLIENT_REQUEST: "bg-blue-900 text-blue-300",
  SALES_REVIEW: "bg-yellow-900 text-yellow-300",
  DEALER_QUOTE: "bg-yellow-900 text-yellow-300",
  SALES_MARKUP: "bg-yellow-900 text-yellow-300",
  CLIENT_CONFIRMATION: "bg-amber-900 text-amber-300",
  CONFIRMED: "bg-emerald-900 text-emerald-300",
  REJECTED: "bg-red-900 text-red-400",
};

function ageLabel(createdAt: number): string {
  const secs = Math.floor((Date.now() - createdAt) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

export function SalesWorkbenchPanel() {
  const user = useAppSelector((s) => s.auth.user);

  const rfqs = useSignal<SellSideRfq[]>([]);
  const selectedRfqId = useSignal<string | null>(null);
  const markupBps = useSignal("25");
  const actionError = useSignal<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchAll() {
    try {
      const res = await fetch("/api/gateway/rfq/sellside");
      if (res.ok) {
        const data = (await res.json()) as { rfqs: SellSideRfq[] };
        rfqs.value = data.rfqs ?? [];
      }
    } catch {
      /* best-effort */
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchAll is stable (no deps change)
  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, 3000);
    return () => {
      if (intervalRef.current != null) clearInterval(intervalRef.current);
    };
  }, []);

  async function handleRoute(rfqId: string) {
    if (!user) return;
    actionError.value = null;
    try {
      const res = await fetch(`/api/gateway/rfq/sellside/${rfqId}/route`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesUserId: user.id }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: "Error" }))) as { error?: string };
        actionError.value = err.error ?? `Error ${res.status}`;
      } else {
        selectedRfqId.value = rfqId;
        await fetchAll();
      }
    } catch (err) {
      actionError.value = (err as Error).message;
    }
  }

  async function handleMarkup(rfqId: string) {
    if (!user) return;
    actionError.value = null;
    try {
      const res = await fetch(`/api/gateway/rfq/sellside/${rfqId}/markup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesUserId: user.id, markupBps: Number(markupBps.value) }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: "Error" }))) as { error?: string };
        actionError.value = err.error ?? `Error ${res.status}`;
      } else {
        await fetchAll();
      }
    } catch (err) {
      actionError.value = (err as Error).message;
    }
  }

  async function handleReject(rfqId: string) {
    if (!user) return;
    actionError.value = null;
    try {
      await fetch(`/api/gateway/rfq/sellside/${rfqId}/reject`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectedBy: user.id }),
      });
      if (selectedRfqId.value === rfqId) selectedRfqId.value = null;
      await fetchAll();
    } catch (err) {
      actionError.value = (err as Error).message;
    }
  }

  // Find the RFQ currently selected for markup
  const selectedRfq = rfqs.value.find((r) => r.rfqId === selectedRfqId.value) ?? null;
  const markupCandidates = rfqs.value.filter(
    (r) => r.state === "SALES_MARKUP" && r.salesUserId === user?.id
  );
  const markupRfq =
    selectedRfq?.state === "SALES_MARKUP" && selectedRfq.salesUserId === user?.id
      ? selectedRfq
      : (markupCandidates[0] ?? null);

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="sales-workbench-panel">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-3 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          Sales Workbench
        </span>
        <span className="text-[10px] text-gray-500">
          {rfqs.value.length} RFQ{rfqs.value.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex flex-col gap-3 overflow-auto flex-1 p-3">
        {actionError.value && (
          <div className="text-xs px-2 py-1.5 rounded bg-red-900 text-red-400">
            {actionError.value}
          </div>
        )}

        {/* Incoming RFQs table */}
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
            Incoming RFQs
          </div>
          {rfqs.value.length === 0 ? (
            <div className="text-xs text-gray-600 py-2">No RFQs in the system.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-gray-500 text-[10px] uppercase tracking-wider">
                    <th className="text-left py-1 pr-2">RFQ ID</th>
                    <th className="text-left py-1 pr-2">Client</th>
                    <th className="text-left py-1 pr-2">Asset</th>
                    <th className="text-left py-1 pr-2">Side</th>
                    <th className="text-right py-1 pr-2">Qty</th>
                    <th className="text-left py-1 pr-2">State</th>
                    <th className="text-right py-1 pr-2">Age</th>
                    <th className="text-left py-1">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rfqs.value.map((rfq) => {
                    const isActionable = rfq.state === "CLIENT_REQUEST";
                    const isMarkupMine =
                      rfq.state === "SALES_MARKUP" && rfq.salesUserId === user?.id;
                    const isSelected = rfq.rfqId === selectedRfqId.value;
                    return (
                      <tr
                        key={rfq.rfqId}
                        onClick={() => {
                          selectedRfqId.value = isSelected ? null : rfq.rfqId;
                        }}
                        className={`border-t border-gray-800 cursor-pointer transition-colors ${
                          isActionable
                            ? "bg-blue-950 hover:bg-blue-900"
                            : isSelected
                              ? "bg-gray-800"
                              : "hover:bg-gray-900"
                        }`}
                      >
                        <td className="py-1.5 pr-2 text-gray-400 font-mono text-[10px]">
                          {rfq.rfqId}
                        </td>
                        <td
                          className="py-1.5 pr-2 text-gray-400 text-[10px] truncate max-w-[80px]"
                          title={rfq.clientUserId}
                        >
                          {rfq.clientUserId}
                        </td>
                        <td className="py-1.5 pr-2 text-gray-200 font-semibold">{rfq.asset}</td>
                        <td
                          className={`py-1.5 pr-2 font-semibold ${rfq.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {rfq.side}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-gray-300">
                          {rfq.quantity.toLocaleString()}
                        </td>
                        <td className="py-1.5 pr-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATE_COLOURS[rfq.state]}`}
                          >
                            {rfq.state.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-gray-500 text-[10px]">
                          {ageLabel(rfq.createdAt)}
                        </td>
                        <td className="py-1.5">
                          <div className="flex gap-1">
                            {isActionable && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRoute(rfq.rfqId);
                                }}
                                className="px-2 py-0.5 text-[10px] rounded bg-blue-700 hover:bg-blue-600 text-white font-semibold transition-colors"
                              >
                                Route
                              </button>
                            )}
                            {isMarkupMine && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectedRfqId.value = rfq.rfqId;
                                }}
                                className="px-2 py-0.5 text-[10px] rounded bg-amber-700 hover:bg-amber-600 text-white font-semibold transition-colors"
                              >
                                Markup
                              </button>
                            )}
                            {rfq.state !== "CONFIRMED" && rfq.state !== "REJECTED" && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReject(rfq.rfqId);
                                }}
                                className="px-2 py-0.5 text-[10px] rounded bg-red-800 hover:bg-red-700 text-white font-semibold transition-colors"
                              >
                                Reject
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Apply Markup section */}
        {markupRfq && (
          <div className="border border-amber-800 rounded p-3 flex flex-col gap-2.5 bg-amber-950/30">
            <div className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold">
              Apply Markup — {markupRfq.rfqId}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Asset</span>
                <span className="ml-2 text-gray-200 font-semibold">{markupRfq.asset}</span>
              </div>
              <div>
                <span className="text-gray-500">Side</span>
                <span
                  className={`ml-2 font-semibold ${markupRfq.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}
                >
                  {markupRfq.side}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Qty</span>
                <span className="ml-2 text-gray-300 tabular-nums">
                  {markupRfq.quantity.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Dealer Price</span>
                <span className="ml-2 text-gray-300 tabular-nums">
                  {markupRfq.dealerBestPrice != null
                    ? `$${markupRfq.dealerBestPrice.toFixed(2)}`
                    : "—"}
                </span>
              </div>
            </div>
            <div>
              <label htmlFor="sw-markup-bps" className="block text-xs text-gray-500 mb-1">
                Markup (bps)
              </label>
              <input
                id="sw-markup-bps"
                type="number"
                min="0"
                max="500"
                step="1"
                value={markupBps.value}
                onChange={(e) => {
                  markupBps.value = e.target.value;
                }}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-amber-500 tabular-nums"
              />
              {markupRfq.dealerBestPrice != null && markupBps.value && (
                <div className="mt-1 text-[10px] text-gray-500">
                  Client price:{" "}
                  <span className="text-amber-300 tabular-nums font-semibold">
                    $
                    {(markupRfq.side === "BUY"
                      ? markupRfq.dealerBestPrice * (1 + Number(markupBps.value) / 10000)
                      : markupRfq.dealerBestPrice * (1 - Number(markupBps.value) / 10000)
                    ).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleMarkup(markupRfq.rfqId)}
                className="flex-1 py-1.5 text-xs font-semibold rounded bg-amber-700 hover:bg-amber-600 text-white transition-colors"
              >
                Send Quote to Client
              </button>
              <button
                type="button"
                onClick={() => handleReject(markupRfq.rfqId)}
                className="px-3 py-1.5 text-xs font-semibold rounded bg-red-800 hover:bg-red-700 text-white transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
