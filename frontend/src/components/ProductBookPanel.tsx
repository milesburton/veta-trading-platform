import { useSignal } from "@preact/signals-react";
import { useEffect } from "react";
import { useAppSelector } from "../store/hooks.ts";

type ProductState = "draft" | "structured" | "issued" | "sold" | "unwound";

interface ProductLeg {
  legId: string;
  type: "equity" | "bond" | "option";
  symbol: string;
  weight: number; // fraction 0-1
  quantity?: number;
  estimatedPrice?: number;
  isin?: string;
}

interface Product {
  productId: string;
  name: string;
  description: string;
  state: ProductState;
  legs: ProductLeg[];
  targetNotional: number;
  currency: string;
  createdBy: string;
  issuedAt?: number;
  soldTo?: string;
  rfqId?: string;
  createdAt: number;
  updatedAt: number;
}

const STATE_COLOURS: Record<ProductState, string> = {
  draft: "bg-zinc-800 text-zinc-300 border-zinc-600",
  structured: "bg-blue-900/60 text-blue-300 border-blue-700",
  issued: "bg-emerald-900/60 text-emerald-300 border-emerald-700",
  sold: "bg-amber-900/60 text-amber-300 border-amber-700",
  unwound: "bg-gray-800 text-gray-400 border-gray-600",
};

const STATE_FILTERS: Array<ProductState | "all"> = [
  "all",
  "draft",
  "structured",
  "issued",
  "sold",
  "unwound",
];

function formatNotional(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export function ProductBookPanel() {
  const user = useAppSelector((s) => s.auth.user);
  const role = user?.role ?? "";

  const products = useSignal<Product[]>([]);
  const stateFilter = useSignal<ProductState | "all">("all");
  const expandedId = useSignal<string | null>(null);
  const loading = useSignal(false);
  const error = useSignal<string | null>(null);
  const feedback = useSignal<{ productId: string; ok: boolean; msg: string } | null>(null);

  async function fetchProducts() {
    loading.value = true;
    error.value = null;
    try {
      const qs = new URLSearchParams();
      if (stateFilter.value !== "all") qs.set("state", stateFilter.value);
      const res = await fetch(`/api/gateway/products?${qs.toString()}`);
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        error.value = data.error ?? `HTTP ${res.status}`;
        return;
      }
      products.value = (await res.json()) as Product[];
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchProducts is stable (no deps change)
  useEffect(() => {
    void fetchProducts();
  }, [stateFilter.value]);

  function showFeedback(productId: string, ok: boolean, msg: string) {
    feedback.value = { productId, ok, msg };
    setTimeout(() => {
      feedback.value = null;
    }, 5_000);
  }

  async function handleRequestQuote(product: Product) {
    try {
      const res = await fetch("/api/gateway/rfq/sellside", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientUserId: user?.id,
          asset: product.name,
          side: "BUY",
          quantity: 1,
          limitPrice: product.targetNotional,
        }),
      });
      const data = (await res.json()) as { rfqId?: string; error?: string };
      if (!res.ok) {
        showFeedback(product.productId, false, data.error ?? "Failed to request quote.");
        return;
      }
      showFeedback(product.productId, true, `Quote requested (RFQ: ${data.rfqId ?? "submitted"})`);
    } catch (err) {
      showFeedback(product.productId, false, (err as Error).message);
    }
  }

  async function handleSell(product: Product) {
    try {
      const res = await fetch(`/api/gateway/products/${product.productId}/sell`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soldTo: "eve", rfqId: "" }),
      });
      const data = (await res.json()) as {
        state?: ProductState;
        error?: string;
      };
      if (!res.ok) {
        showFeedback(product.productId, false, data.error ?? "Failed to mark as sold.");
        return;
      }
      showFeedback(product.productId, true, "Product marked as sold.");
      void fetchProducts();
    } catch (err) {
      showFeedback(product.productId, false, (err as Error).message);
    }
  }

  async function handleUnwind(product: Product) {
    try {
      const res = await fetch(`/api/gateway/products/${product.productId}/unwind`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json()) as {
        state?: ProductState;
        error?: string;
      };
      if (!res.ok) {
        showFeedback(product.productId, false, data.error ?? "Failed to unwind.");
        return;
      }
      showFeedback(product.productId, true, "Product unwound.");
      void fetchProducts();
    } catch (err) {
      showFeedback(product.productId, false, (err as Error).message);
    }
  }

  function toggleExpand(productId: string) {
    expandedId.value = expandedId.value === productId ? null : productId;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="product-book-panel">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between flex-shrink-0 gap-2">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          Product Book
        </span>
        <button
          type="button"
          onClick={() => void fetchProducts()}
          disabled={loading.value}
          className="text-[10px] text-sky-500 hover:text-sky-400 transition-colors disabled:opacity-50"
        >
          {loading.value ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* State filter tabs */}
      <div className="flex gap-0.5 px-3 pt-2 pb-1 border-b border-gray-800/60 flex-shrink-0 flex-wrap">
        {STATE_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              stateFilter.value = f;
            }}
            className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors ${
              stateFilter.value === f
                ? "bg-gray-700 text-gray-200"
                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error.value && (
        <div className="mx-3 mt-2 rounded border border-red-700/40 bg-red-950/30 px-2.5 py-1.5 text-[10px] text-red-400">
          {error.value}
        </div>
      )}

      {/* Products table */}
      <div className="flex-1 overflow-auto">
        {products.value.length === 0 && !loading.value && (
          <div className="flex items-center justify-center py-10 text-gray-600 text-xs">
            No products found
          </div>
        )}

        {products.value.length > 0 && (
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="bg-gray-800/60 text-gray-500 text-left sticky top-0">
                <th className="px-2 py-1.5 font-normal">ID</th>
                <th className="px-2 py-1.5 font-normal">Name</th>
                <th className="px-2 py-1.5 font-normal">State</th>
                <th className="px-2 py-1.5 font-normal text-right">Notional</th>
                <th className="px-2 py-1.5 font-normal text-center">Legs</th>
                <th className="px-2 py-1.5 font-normal">Created by</th>
                <th className="px-2 py-1.5 font-normal">Issued</th>
                <th className="px-2 py-1.5 font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.value.map((product) => {
                const isExpanded = expandedId.value === product.productId;
                const fb = feedback.value?.productId === product.productId ? feedback.value : null;
                return (
                  <>
                    <tr
                      key={product.productId}
                      className="border-t border-gray-700/40 hover:bg-gray-800/20 cursor-pointer"
                      onClick={() => toggleExpand(product.productId)}
                    >
                      <td className="px-2 py-1.5 font-mono text-gray-400 text-[9px]">
                        {product.productId}
                      </td>
                      <td
                        className="px-2 py-1.5 text-gray-200 max-w-[120px] truncate"
                        title={product.name}
                      >
                        {product.name}
                      </td>
                      <td className="px-2 py-1.5">
                        <span
                          className={`px-1 py-0.5 rounded border text-[9px] font-semibold uppercase ${
                            STATE_COLOURS[product.state]
                          }`}
                        >
                          {product.state}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-300">
                        {formatNotional(product.targetNotional)}
                      </td>
                      <td className="px-2 py-1.5 text-center text-gray-400">
                        {product.legs.length}
                      </td>
                      <td className="px-2 py-1.5 text-gray-500 font-mono text-[9px]">
                        {product.createdBy}
                      </td>
                      <td className="px-2 py-1.5 text-gray-500 tabular-nums">
                        {product.issuedAt ? (
                          new Date(product.issuedAt).toLocaleDateString()
                        ) : (
                          <span className="text-gray-700">—</span>
                        )}
                      </td>
                      <td
                        className="px-2 py-1.5"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1">
                          {product.state === "issued" && role === "external-client" && (
                            <button
                              type="button"
                              onClick={() => void handleRequestQuote(product)}
                              className="px-1.5 py-0.5 rounded text-[9px] bg-sky-800 hover:bg-sky-700 text-sky-200 transition-colors"
                            >
                              Request Quote
                            </button>
                          )}
                          {product.state === "issued" && (role === "sales" || role === "admin") && (
                            <button
                              type="button"
                              onClick={() => void handleSell(product)}
                              className="px-1.5 py-0.5 rounded text-[9px] bg-amber-800 hover:bg-amber-700 text-amber-200 transition-colors"
                            >
                              Sell
                            </button>
                          )}
                          {product.state === "sold" && (role === "sales" || role === "admin") && (
                            <button
                              type="button"
                              onClick={() => void handleUnwind(product)}
                              className="px-1.5 py-0.5 rounded text-[9px] bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                            >
                              Unwind
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Feedback row */}
                    {fb && (
                      <tr key={`${product.productId}-fb`} className="border-t border-gray-700/20">
                        <td
                          colSpan={8}
                          className={`px-3 py-1 text-[10px] ${
                            fb.ok ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {fb.msg}
                        </td>
                      </tr>
                    )}

                    {/* Expanded legs row */}
                    {isExpanded && product.legs.length > 0 && (
                      <tr
                        key={`${product.productId}-legs`}
                        className="border-t border-gray-700/20 bg-gray-900/40"
                      >
                        <td colSpan={8} className="px-4 py-2">
                          <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5 font-semibold">
                            Legs
                          </div>
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="text-gray-600 text-left">
                                <th className="pr-3 pb-0.5 font-normal">Leg ID</th>
                                <th className="pr-3 pb-0.5 font-normal">Type</th>
                                <th className="pr-3 pb-0.5 font-normal">Symbol</th>
                                <th className="pr-3 pb-0.5 font-normal text-right">Weight</th>
                                <th className="pr-3 pb-0.5 font-normal text-right">Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {product.legs.map((leg) => (
                                <tr key={leg.legId} className="text-gray-400">
                                  <td className="pr-3 py-0.5 font-mono text-[9px]">{leg.legId}</td>
                                  <td className="pr-3 py-0.5">
                                    <span
                                      className={`px-1 py-0.5 rounded text-[8px] font-semibold ${
                                        leg.type === "equity"
                                          ? "bg-sky-900/60 text-sky-300"
                                          : leg.type === "bond"
                                            ? "bg-amber-900/60 text-amber-300"
                                            : "bg-purple-900/60 text-purple-300"
                                      }`}
                                    >
                                      {leg.type.toUpperCase()}
                                    </span>
                                  </td>
                                  <td className="pr-3 py-0.5 font-mono text-gray-300">
                                    {leg.symbol}
                                  </td>
                                  <td className="pr-3 py-0.5 text-right tabular-nums">
                                    {(leg.weight * 100).toFixed(1)}%
                                  </td>
                                  <td className="pr-3 py-0.5 text-right tabular-nums">
                                    {leg.quantity != null ? (
                                      leg.quantity.toLocaleString()
                                    ) : (
                                      <span className="text-gray-700">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}

                    {isExpanded && product.legs.length === 0 && (
                      <tr
                        key={`${product.productId}-no-legs`}
                        className="border-t border-gray-700/20 bg-gray-900/40"
                      >
                        <td colSpan={8} className="px-4 py-2 text-[10px] text-gray-600">
                          No legs defined.
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
