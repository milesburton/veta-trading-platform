import { useSignal } from "@preact/signals-react";
import { useAppSelector } from "../store/hooks.ts";

type LegType = "equity" | "bond" | "option";
type ProductState = "draft" | "structured" | "issued" | "sold" | "unwound";

interface DraftLeg {
  _key: string;
  type: LegType;
  symbol: string;
  weight: number;
  isin?: string;
  optionStrike?: string;
  optionExpiry?: string;
  optionPutCall?: "CALL" | "PUT";
}

interface SavedProduct {
  productId: string;
  state: ProductState;
}

let _legKey = 0;
function newLegKey(): string {
  return `dleg-${++_legKey}`;
}

const STATE_COLOURS: Record<ProductState, string> = {
  draft: "bg-zinc-800 text-zinc-300 border-zinc-600",
  structured: "bg-blue-900/60 text-blue-300 border-blue-700",
  issued: "bg-emerald-900/60 text-emerald-300 border-emerald-700",
  sold: "bg-amber-900/60 text-amber-300 border-amber-700",
  unwound: "bg-gray-800 text-gray-400 border-gray-600",
};

export function ProductBuilderPanel() {
  const user = useAppSelector((s) => s.auth.user);

  const name = useSignal("");
  const description = useSignal("");
  const targetNotional = useSignal("1000000");

  const legs = useSignal<DraftLeg[]>([]);

  const addType = useSignal<LegType>("equity");
  const addSymbol = useSignal("");
  const addWeight = useSignal("0");

  const savedProduct = useSignal<SavedProduct | null>(null);

  const feedback = useSignal<{ ok: boolean; msg: string } | null>(null);
  const busy = useSignal(false);

  const totalWeight = legs.value.reduce((s, l) => s + l.weight, 0);
  const weightOk = Math.abs(totalWeight - 100) < 0.01;

  function addLeg() {
    const sym = addSymbol.value.trim().toUpperCase();
    const w = parseFloat(addWeight.value);
    if (!sym || Number.isNaN(w) || w <= 0) return;
    legs.value = [
      ...legs.value,
      { _key: newLegKey(), type: addType.value, symbol: sym, weight: w },
    ];
    addSymbol.value = "";
    addWeight.value = "0";
  }

  function removeLeg(key: string) {
    legs.value = legs.value.filter((l) => l._key !== key);
  }

  function legPayload() {
    return legs.value.map((l) => {
      const base: Record<string, unknown> = {
        type: l.type,
        symbol: l.symbol,
        weight: l.weight / 100,
      };
      if (l.isin) base.isin = l.isin;
      if (l.type === "option" && l.optionStrike && l.optionExpiry) {
        base.optionSpec = {
          strike: parseFloat(l.optionStrike),
          expiry: l.optionExpiry,
          putCall: l.optionPutCall ?? "CALL",
        };
      }
      return base;
    });
  }

  function showFeedback(ok: boolean, msg: string) {
    feedback.value = { ok, msg };
    setTimeout(() => {
      feedback.value = null;
    }, 5_000);
  }

  async function handleSaveDraft() {
    if (busy.value) return;
    if (!name.value.trim()) {
      showFeedback(false, "Product name is required.");
      return;
    }
    const notional = parseFloat(targetNotional.value);
    if (Number.isNaN(notional) || notional <= 0) {
      showFeedback(false, "Target notional must be a positive number.");
      return;
    }

    busy.value = true;
    try {
      const existing = savedProduct.value;

      if (existing) {
        const res = await fetch(`/api/gateway/products/${existing.productId}/legs`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ legs: legPayload() }),
        });
        const data = (await res.json()) as {
          productId?: string;
          state?: ProductState;
          error?: string;
        };
        if (!res.ok) {
          showFeedback(false, data.error ?? "Failed to update legs.");
          return;
        }
        savedProduct.value = {
          productId: data.productId as string,
          state: data.state as ProductState,
        };
        showFeedback(true, "Legs updated.");
      } else {
        const res = await fetch("/api/gateway/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.value.trim(),
            description: description.value.trim(),
            targetNotional: notional,
            currency: "USD",
            createdBy: user?.id ?? "unknown",
            legs: legPayload(),
          }),
        });
        const data = (await res.json()) as {
          productId?: string;
          state?: ProductState;
          error?: string;
        };
        if (!res.ok) {
          showFeedback(false, data.error ?? "Failed to create product.");
          return;
        }
        savedProduct.value = {
          productId: data.productId as string,
          state: data.state as ProductState,
        };
        showFeedback(true, `Draft product ${data.productId} created.`);
      }
    } catch (err) {
      showFeedback(false, (err as Error).message);
    } finally {
      busy.value = false;
    }
  }

  async function handleStructure() {
    if (busy.value || !savedProduct.value) return;
    busy.value = true;
    try {
      const res = await fetch(`/api/gateway/products/${savedProduct.value.productId}/structure`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json()) as {
        productId?: string;
        state?: ProductState;
        error?: string;
      };
      if (!res.ok) {
        showFeedback(false, data.error ?? "Failed to structure product.");
        return;
      }
      savedProduct.value = {
        productId: data.productId as string,
        state: data.state as ProductState,
      };
      showFeedback(true, "Product structured.");
    } catch (err) {
      showFeedback(false, (err as Error).message);
    } finally {
      busy.value = false;
    }
  }

  async function handleIssue() {
    if (busy.value || !savedProduct.value) return;
    busy.value = true;
    try {
      const res = await fetch(`/api/gateway/products/${savedProduct.value.productId}/issue`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json()) as {
        productId?: string;
        state?: ProductState;
        error?: string;
      };
      if (!res.ok) {
        showFeedback(false, data.error ?? "Failed to issue product.");
        return;
      }
      savedProduct.value = {
        productId: data.productId as string,
        state: data.state as ProductState,
      };
      showFeedback(true, "Product issued and visible to clients.");
    } catch (err) {
      showFeedback(false, (err as Error).message);
    } finally {
      busy.value = false;
    }
  }

  const currentState = savedProduct.value?.state ?? null;
  const canStructure = currentState === "draft" && weightOk && legs.value.length > 0 && !busy.value;
  const canIssue = currentState === "structured" && !busy.value;

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="product-builder-panel">
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-3 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          Product Builder
        </span>
        {currentState && (
          <span
            className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${STATE_COLOURS[currentState]}`}
          >
            {currentState}
          </span>
        )}
        {savedProduct.value && (
          <span className="text-[10px] text-gray-500 font-mono">
            {savedProduct.value.productId}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 p-3 overflow-auto flex-1">
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label htmlFor="pb-name" className="block text-xs text-gray-500 mb-1">
              Product Name
            </label>
            <input
              id="pb-name"
              type="text"
              value={name.value}
              onChange={(e) => {
                name.value = e.target.value;
              }}
              placeholder="e.g. Tech Growth Basket 2026"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="pb-desc" className="block text-xs text-gray-500 mb-1">
              Description
            </label>
            <textarea
              id="pb-desc"
              rows={2}
              value={description.value}
              onChange={(e) => {
                description.value = (e.target as HTMLTextAreaElement).value;
              }}
              placeholder="Brief description of the product"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>
          <div>
            <label htmlFor="pb-notional" className="block text-xs text-gray-500 mb-1">
              Target Notional ($)
            </label>
            <input
              id="pb-notional"
              type="number"
              min="1000"
              step="10000"
              value={targetNotional.value}
              onChange={(e) => {
                targetNotional.value = e.target.value;
              }}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
          <div>
            <p className="block text-xs text-gray-500 mb-1">Currency</p>
            <div className="w-full bg-gray-800/50 border border-gray-700/50 text-gray-400 text-xs rounded px-2 py-1.5 tabular-nums">
              USD
            </div>
          </div>
        </div>

        <div className="border border-gray-700/60 rounded p-2 flex flex-col gap-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
            Add Leg
          </span>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="pb-leg-type" className="block text-[10px] text-gray-600 mb-0.5">
                Type
              </label>
              <select
                id="pb-leg-type"
                value={addType.value}
                onChange={(e) => {
                  addType.value = e.target.value as LegType;
                }}
                className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
              >
                <option value="equity">Equity</option>
                <option value="bond">Bond</option>
                <option value="option">Option</option>
              </select>
            </div>
            <div>
              <label htmlFor="pb-leg-symbol" className="block text-[10px] text-gray-600 mb-0.5">
                Symbol
              </label>
              <input
                id="pb-leg-symbol"
                type="text"
                value={addSymbol.value}
                onChange={(e) => {
                  addSymbol.value = e.target.value.toUpperCase();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addLeg();
                }}
                placeholder="e.g. AAPL"
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="pb-leg-weight" className="block text-[10px] text-gray-600 mb-0.5">
                Weight %
              </label>
              <input
                id="pb-leg-weight"
                type="number"
                min="0"
                max="100"
                step="1"
                value={addWeight.value}
                onChange={(e) => {
                  addWeight.value = e.target.value;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addLeg();
                }}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500 tabular-nums"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={addLeg}
            className="self-end px-3 py-1 text-xs bg-sky-700 hover:bg-sky-600 text-white rounded transition-colors"
          >
            + Add
          </button>
        </div>

        {legs.value.length > 0 && (
          <div className="rounded border border-gray-700/60 overflow-hidden">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="bg-gray-800/80 text-gray-500 text-left">
                  <th className="px-2 py-1.5 font-normal">Type</th>
                  <th className="px-2 py-1.5 font-normal">Symbol</th>
                  <th className="px-2 py-1.5 font-normal text-right">Weight %</th>
                  <th className="px-1 py-1.5 font-normal" />
                </tr>
              </thead>
              <tbody>
                {legs.value.map((leg) => (
                  <tr key={leg._key} className="border-t border-gray-700/40 hover:bg-gray-800/30">
                    <td className="px-2 py-1">
                      <span
                        className={`px-1 py-0.5 rounded text-[9px] font-semibold ${
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
                    <td className="px-2 py-1 font-mono text-gray-200">{leg.symbol}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-gray-300">
                      {leg.weight.toFixed(1)}%
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeLeg(leg._key)}
                        className="text-gray-600 hover:text-red-400 transition-colors px-1"
                        title="Remove leg"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {legs.value.length > 0 && (
          <div className="flex items-center justify-between text-[10px]">
            <span
              className={`font-semibold tabular-nums ${weightOk ? "text-emerald-400" : "text-red-400"}`}
            >
              Total: {totalWeight.toFixed(1)}%{!weightOk && " — must equal 100%"}
            </span>
          </div>
        )}

        {legs.value.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-gray-600 text-xs gap-1">
            <span>Add legs to build the product</span>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            disabled={busy.value || !name.value.trim()}
            onClick={handleSaveDraft}
            className="px-3 py-1.5 text-xs font-semibold rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 transition-colors"
          >
            {busy.value ? "Saving…" : "Save Draft"}
          </button>
          <button
            type="button"
            disabled={!canStructure}
            onClick={handleStructure}
            className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            Structure
          </button>
          <button
            type="button"
            disabled={!canIssue}
            onClick={handleIssue}
            className="px-3 py-1.5 text-xs font-semibold rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            Issue
          </button>
        </div>

        {feedback.value && (
          <div
            className={`rounded border px-2.5 py-1.5 text-[10px] ${
              feedback.value.ok
                ? "border-emerald-700/40 bg-emerald-950/30 text-emerald-400"
                : "border-red-700/40 bg-red-950/30 text-red-400"
            }`}
            aria-live="polite"
          >
            {feedback.value.msg}
          </div>
        )}
      </div>
    </div>
  );
}
