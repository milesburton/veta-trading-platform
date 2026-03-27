import { useSignal } from "@preact/signals-react";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { submitOrderThunk } from "../store/ordersSlice.ts";
import type { LimitParams, Trade } from "../types.ts";

interface BasketLeg {
  id: string;
  symbol: string;
  weight: number; // 0–100 %
  side: "BUY" | "SELL";
  qty: number; // computed from weight × notional / price
  price: number; // live mid
  lotSize: number;
}

function snapToLot(qty: number, lotSize: number): number {
  if (lotSize <= 1) return Math.max(1, Math.round(qty));
  return Math.max(lotSize, Math.round(qty / lotSize) * lotSize);
}

let _legSeq = 0;
function newId() {
  return `leg-${++_legSeq}`;
}

const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN"];

export function BasketOrderPanel() {
  const dispatch = useAppDispatch();
  const assets = useAppSelector((s) => s.market.assets);
  const prices = useAppSelector((s) => s.market.prices);

  const notional = useSignal("100000");
  const expiresAt = useSignal("300");
  const submitting = useSignal(false);
  const feedback = useSignal<{ ok: boolean; msg: string } | null>(null);
  const searchInput = useSignal("");

  // Build initial legs
  const initialLegs: BasketLeg[] = DEFAULT_SYMBOLS.map((sym, i) => {
    const asset = assets.find((a) => a.symbol === sym);
    const price = prices[sym] ?? 0;
    const lotSize = asset?.lotSize ?? 100;
    return {
      id: newId(),
      symbol: sym,
      weight: i === 0 ? 30 : i === 1 ? 25 : i === 2 ? 20 : i === 3 ? 15 : 10,
      side: "BUY",
      qty: 0,
      price,
      lotSize,
    };
  });

  const legs = useSignal<BasketLeg[]>(initialLegs);

  // Recompute quantities from weights + notional + live prices
  function recomputeQtys(currentLegs: BasketLeg[], targetNotional: number): BasketLeg[] {
    return currentLegs.map((leg) => {
      const price = prices[leg.symbol] ?? leg.price;
      if (price <= 0 || leg.weight <= 0) return { ...leg, price, qty: 0 };
      const rawQty = ((leg.weight / 100) * targetNotional) / price;
      return { ...leg, price, qty: snapToLot(rawQty, leg.lotSize) };
    });
  }

  // Keep quantities in sync with price changes
  const targetNotional = Number(notional.value) || 0;
  const computedLegs = recomputeQtys(legs.value, targetNotional);

  const totalWeight = computedLegs.reduce((s, l) => s + l.weight, 0);
  const totalNotional = computedLegs.reduce((s, l) => s + l.qty * l.price, 0);
  const weightOk = Math.abs(totalWeight - 100) < 0.01 || totalWeight === 0;

  function updateLeg(id: string, patch: Partial<Omit<BasketLeg, "id">>) {
    legs.value = legs.value.map((l) => (l.id === id ? { ...l, ...patch } : l));
  }

  function removeLeg(id: string) {
    legs.value = legs.value.filter((l) => l.id !== id);
  }

  function addSymbol(sym: string) {
    const trimmed = sym.trim().toUpperCase();
    if (!trimmed) return;
    if (legs.value.some((l) => l.symbol === trimmed)) return;
    const asset = assets.find((a) => a.symbol === trimmed);
    if (!asset) return;
    const price = prices[trimmed] ?? 0;
    legs.value = [
      ...legs.value,
      {
        id: newId(),
        symbol: trimmed,
        weight: 0,
        side: "BUY",
        qty: 0,
        price,
        lotSize: asset.lotSize ?? 100,
      },
    ];
    searchInput.value = "";
  }

  function distributeEvenly() {
    const n = legs.value.length;
    if (n === 0) return;
    const w = Math.floor(10000 / n) / 100;
    const remainder = 100 - w * n;
    legs.value = legs.value.map((l, i) => ({
      ...l,
      weight: i === 0 ? w + remainder : w,
    }));
  }

  async function handleSubmit() {
    if (submitting.value || computedLegs.length === 0) return;
    const validLegs = computedLegs.filter((l) => l.qty > 0 && l.price > 0);
    if (validLegs.length === 0) return;

    submitting.value = true;
    feedback.value = null;

    const algoParams: LimitParams = { strategy: "LIMIT" };
    const dur = Number(expiresAt.value) || 300;

    let submitted = 0;
    let failed = 0;

    for (const leg of validLegs) {
      const trade: Trade = {
        asset: leg.symbol,
        side: leg.side,
        quantity: leg.qty,
        limitPrice: leg.price,
        expiresAt: dur,
        algoParams,
      };
      try {
        await dispatch(submitOrderThunk(trade)).unwrap();
        submitted++;
      } catch {
        failed++;
      }
    }

    feedback.value =
      failed === 0
        ? { ok: true, msg: `${submitted} order${submitted !== 1 ? "s" : ""} submitted.` }
        : { ok: false, msg: `${submitted} submitted, ${failed} failed.` };
    submitting.value = false;
    setTimeout(() => {
      feedback.value = null;
    }, 5_000);
  }

  const canSubmit = !submitting.value && computedLegs.some((l) => l.qty > 0) && targetNotional > 0;

  const suggestions =
    searchInput.value.length >= 1
      ? assets
          .filter(
            (a) =>
              (a.symbol.startsWith(searchInput.value.toUpperCase()) ||
                a.symbol.includes(searchInput.value.toUpperCase())) &&
              !legs.value.some((l) => l.symbol === a.symbol)
          )
          .slice(0, 8)
      : [];

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="basket-order-panel">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-3 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          Basket Order
        </span>
        <span className="text-[10px] text-gray-500">
          {computedLegs.length} leg{computedLegs.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex flex-col gap-2.5 p-3 overflow-auto flex-1">
        {/* Target notional + duration row */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="basket-notional" className="block text-xs text-gray-500 mb-1">
              Target Notional ($)
            </label>
            <input
              id="basket-notional"
              type="number"
              min="1000"
              step="1000"
              value={notional.value}
              onChange={(e) => {
                notional.value = e.target.value;
              }}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="basket-duration" className="block text-xs text-gray-500 mb-1">
              Duration (s)
            </label>
            <input
              id="basket-duration"
              type="number"
              min="30"
              step="30"
              value={expiresAt.value}
              onChange={(e) => {
                expiresAt.value = e.target.value;
              }}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
        </div>

        {/* Symbol search */}
        <div className="relative">
          <label htmlFor="basket-search" className="block text-xs text-gray-500 mb-1">
            Add Symbol
          </label>
          <input
            id="basket-search"
            type="text"
            value={searchInput.value}
            onChange={(e) => {
              searchInput.value = e.target.value.toUpperCase();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                addSymbol(searchInput.value);
              }
            }}
            placeholder="e.g. TSLA"
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500"
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 top-full mt-0.5 bg-gray-800 border border-gray-700 rounded shadow-lg max-h-36 overflow-auto">
              {suggestions.map((a) => (
                <li key={a.symbol}>
                  <button
                    type="button"
                    className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-gray-700 flex justify-between"
                    onClick={() => addSymbol(a.symbol)}
                  >
                    <span className="font-mono text-gray-200">{a.symbol}</span>
                    <span className="text-gray-500 text-[10px]">{a.sector}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Legs table */}
        {computedLegs.length > 0 && (
          <div className="rounded border border-gray-700/60 overflow-hidden">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="bg-gray-800/80 text-gray-500 text-left">
                  <th className="px-2 py-1.5 font-normal">Symbol</th>
                  <th className="px-2 py-1.5 font-normal text-right">Wt %</th>
                  <th className="px-2 py-1.5 font-normal text-right">Qty</th>
                  <th className="px-2 py-1.5 font-normal text-right">Price</th>
                  <th className="px-2 py-1.5 font-normal text-right">Notional</th>
                  <th className="px-2 py-1.5 font-normal text-center">Side</th>
                  <th className="px-1 py-1.5 font-normal" />
                </tr>
              </thead>
              <tbody>
                {computedLegs.map((leg) => (
                  <tr key={leg.id} className="border-t border-gray-700/40 hover:bg-gray-800/30">
                    <td className="px-2 py-1 font-mono text-gray-200">{leg.symbol}</td>
                    <td className="px-2 py-1 text-right">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={leg.weight}
                        onChange={(e) =>
                          updateLeg(leg.id, {
                            weight: Math.max(0, Math.min(100, Number(e.target.value))),
                          })
                        }
                        className="w-14 bg-gray-800 border border-gray-700 text-gray-100 rounded px-1 py-0.5 text-right tabular-nums focus:outline-none focus:border-emerald-500"
                      />
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-gray-300">
                      {leg.qty > 0 ? (
                        leg.qty.toLocaleString()
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                      {leg.lotSize > 1 && (
                        <span className="text-gray-600 ml-0.5">/{leg.lotSize}</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-gray-400">
                      {leg.price > 0 ? `$${leg.price.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-gray-300">
                      {leg.qty > 0 && leg.price > 0 ? (
                        `$${(leg.qty * leg.price).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          updateLeg(leg.id, { side: leg.side === "BUY" ? "SELL" : "BUY" })
                        }
                        className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border transition-colors ${
                          leg.side === "BUY"
                            ? "bg-emerald-900/60 border-emerald-700/60 text-emerald-400 hover:bg-emerald-800/60"
                            : "bg-red-900/60 border-red-700/60 text-red-400 hover:bg-red-800/60"
                        }`}
                      >
                        {leg.side}
                      </button>
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeLeg(leg.id)}
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

        {/* Weight summary */}
        {computedLegs.length > 0 && (
          <div className="flex items-center justify-between text-[10px]">
            <span
              className={`font-semibold tabular-nums ${weightOk ? "text-emerald-400" : "text-amber-400"}`}
            >
              Weights: {totalWeight.toFixed(1)}%{!weightOk && " ≠ 100%"}
            </span>
            <button
              type="button"
              onClick={distributeEvenly}
              className="text-sky-500 hover:text-sky-400 transition-colors"
            >
              Distribute evenly
            </button>
            <span className="text-gray-500 tabular-nums">
              ≈ ${totalNotional.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        )}

        {!weightOk && computedLegs.length > 0 && (
          <div className="rounded border border-amber-700/40 bg-amber-950/30 px-2.5 py-1.5 text-[10px] text-amber-400">
            ⚠ Weights sum to {totalWeight.toFixed(1)}% — adjust to 100% or use "Distribute evenly"
          </div>
        )}

        {computedLegs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-gray-600 text-xs gap-1">
            <span>Add symbols to build a basket</span>
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="w-full py-2.5 rounded text-xs font-semibold uppercase tracking-wider transition-colors bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/50 disabled:cursor-not-allowed text-white mt-auto"
        >
          {submitting.value
            ? "Submitting…"
            : `Submit ${computedLegs.filter((l) => l.qty > 0).length} order${computedLegs.filter((l) => l.qty > 0).length !== 1 ? "s" : ""}`}
        </button>

        <p
          className={`text-xs text-center min-h-4 ${
            feedback.value
              ? feedback.value.ok
                ? "text-emerald-400"
                : "text-red-400"
              : "text-transparent"
          }`}
          aria-live="polite"
        >
          {feedback.value?.msg ?? "\u00a0"}
        </p>
      </div>
    </div>
  );
}
