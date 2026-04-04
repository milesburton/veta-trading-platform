import { useSignal } from "@preact/signals-react";
import { useEffect } from "react";
import { useAppSelector } from "../store/hooks.ts";
import { SELL_SIDE_RFQ_STATE_COLORS, type SellSideRfq } from "./rfq/shared.ts";

export function ClientRfqPanel() {
  const user = useAppSelector((s) => s.auth.user);

  const asset = useSignal("AAPL");
  const side = useSignal<"BUY" | "SELL">("BUY");
  const quantity = useSignal("100");
  const limitPrice = useSignal("");
  const submitting = useSignal(false);
  const feedback = useSignal<{ ok: boolean; msg: string } | null>(null);
  const rfqs = useSignal<SellSideRfq[]>([]);
  const loading = useSignal(false);

  async function fetchRfqs() {
    if (!user) return;
    loading.value = true;
    try {
      const res = await fetch(`/api/gateway/rfq/sellside?userId=${encodeURIComponent(user.id)}`);
      if (res.ok) {
        const data = (await res.json()) as { rfqs: SellSideRfq[] };
        rfqs.value = data.rfqs ?? [];
      }
    } catch {
      // best-effort
    } finally {
      loading.value = false;
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchRfqs is stable (no deps change)
  useEffect(() => {
    fetchRfqs();
  }, [user?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || submitting.value) return;
    submitting.value = true;
    feedback.value = null;
    try {
      const body: Record<string, unknown> = {
        clientUserId: user.id,
        asset: asset.value.trim().toUpperCase(),
        side: side.value,
        quantity: Number(quantity.value),
      };
      if (limitPrice.value.trim()) {
        body.limitPrice = Number(limitPrice.value);
      }
      const res = await fetch("/api/gateway/rfq/sellside", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = (await res.json()) as { rfqId: string };
        feedback.value = { ok: true, msg: `RFQ submitted — ${data.rfqId}` };
        await fetchRfqs();
      } else {
        const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as {
          error?: string;
        };
        feedback.value = { ok: false, msg: err.error ?? `Error ${res.status}` };
      }
    } catch (err) {
      feedback.value = { ok: false, msg: (err as Error).message };
    } finally {
      submitting.value = false;
    }
  }

  async function handleConfirm(rfqId: string) {
    if (!user) return;
    try {
      await fetch(`/api/gateway/rfq/sellside/${rfqId}/confirm`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientUserId: user.id }),
      });
      await fetchRfqs();
    } catch {
      /* best-effort */
    }
  }

  async function handleReject(rfqId: string) {
    if (!user) return;
    try {
      await fetch(`/api/gateway/rfq/sellside/${rfqId}/reject`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectedBy: user.id, reason: "client_rejected" }),
      });
      await fetchRfqs();
    } catch {
      /* best-effort */
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="client-rfq-panel">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-3 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          Request for Quote
        </span>
        {loading.value && <span className="text-[10px] text-gray-500">refreshing…</span>}
      </div>

      <div className="flex flex-col gap-3 overflow-auto flex-1 p-3">
        {/* Submit RFQ form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
            New RFQ
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="crfq-asset" className="block text-xs text-gray-500 mb-1">
                Symbol
              </label>
              <input
                id="crfq-asset"
                type="text"
                value={asset.value}
                onChange={(e) => {
                  asset.value = e.target.value.toUpperCase();
                }}
                placeholder="AAPL"
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 uppercase"
              />
            </div>
            <div>
              <p className="block text-xs text-gray-500 mb-1">Side</p>
              <div className="flex gap-1">
                {(["BUY", "SELL"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      side.value = s;
                    }}
                    className={`flex-1 text-xs py-1.5 rounded border transition-colors ${
                      side.value === s
                        ? s === "BUY"
                          ? "bg-emerald-700 border-emerald-600 text-white"
                          : "bg-red-700 border-red-600 text-white"
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="crfq-qty" className="block text-xs text-gray-500 mb-1">
                Quantity
              </label>
              <input
                id="crfq-qty"
                type="number"
                min="1"
                step="1"
                value={quantity.value}
                onChange={(e) => {
                  quantity.value = e.target.value;
                }}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="crfq-limit" className="block text-xs text-gray-500 mb-1">
                Limit Price (optional)
              </label>
              <input
                id="crfq-limit"
                type="number"
                min="0"
                step="0.01"
                value={limitPrice.value}
                onChange={(e) => {
                  limitPrice.value = e.target.value;
                }}
                placeholder="—"
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 tabular-nums"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting.value || !asset.value.trim() || !quantity.value}
            className="w-full py-1.5 text-xs font-semibold rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            {submitting.value ? "Submitting…" : "Submit RFQ"}
          </button>
          {feedback.value && (
            <div
              className={`text-xs px-2 py-1.5 rounded ${
                feedback.value.ok ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-400"
              }`}
            >
              {feedback.value.msg}
            </div>
          )}
        </form>

        {/* My RFQs list */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
              My RFQs
            </span>
            <button
              type="button"
              onClick={fetchRfqs}
              className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              Refresh
            </button>
          </div>

          {rfqs.value.length === 0 ? (
            <div className="text-xs text-gray-600 py-2">No RFQs yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-gray-500 text-[10px] uppercase tracking-wider">
                    <th className="text-left py-1 pr-2">RFQ ID</th>
                    <th className="text-left py-1 pr-2">Asset</th>
                    <th className="text-left py-1 pr-2">Side</th>
                    <th className="text-right py-1 pr-2">Qty</th>
                    <th className="text-left py-1 pr-2">State</th>
                    <th className="text-right py-1 pr-2">Quoted $</th>
                    <th className="text-left py-1">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rfqs.value.map((rfq) => (
                    <tr key={rfq.rfqId} className="border-t border-gray-800 hover:bg-gray-900">
                      <td className="py-1.5 pr-2 text-gray-400 font-mono text-[10px]">
                        {rfq.rfqId}
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
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${SELL_SIDE_RFQ_STATE_COLORS[rfq.state]}`}
                        >
                          {rfq.state.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-gray-300">
                        {rfq.clientQuotedPrice != null ? rfq.clientQuotedPrice.toFixed(2) : "—"}
                      </td>
                      <td className="py-1.5">
                        {rfq.state === "CLIENT_CONFIRMATION" && (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => handleConfirm(rfq.rfqId)}
                              className="px-2 py-0.5 text-[10px] rounded bg-emerald-700 hover:bg-emerald-600 text-white font-semibold transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReject(rfq.rfqId)}
                              className="px-2 py-0.5 text-[10px] rounded bg-red-800 hover:bg-red-700 text-white font-semibold transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
