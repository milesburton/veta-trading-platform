import { useSignal } from "@preact/signals-react";
import { useEffect, useRef } from "react";
import { useChannelOut } from "../hooks/useChannelOut.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { setActiveSide, setActiveStrategy } from "../store/uiSlice.ts";
import type { AssetDef, OrderSide, Strategy } from "../types.ts";

const STRATEGIES: Strategy[] = [
  "LIMIT",
  "TWAP",
  "POV",
  "VWAP",
  "ICEBERG",
  "SNIPER",
  "ARRIVAL_PRICE",
  "IS",
  "MOMENTUM",
];

interface ParsedTrade {
  side?: OrderSide;
  quantity?: number;
  symbol?: string;
  price?: number;
  strategy?: Strategy;
}

function parseTradePaste(input: string, assets: AssetDef[]): ParsedTrade | null {
  const upper = input.toUpperCase().trim();

  const sideMatch = upper.match(/\b(BUY|SELL)\b/);
  const qtyMatch = upper.match(/\b(\d[\d,]*)\s*(SHARES?|SHS?|LOTS?)?\b/);
  const priceMatch = upper.match(/@\s*([\d,.]+)/);
  const strategyMatch = upper.match(new RegExp(`\\b(${STRATEGIES.join("|")})\\b`));

  const symbolMap = new Map<string, string>();
  for (const a of assets) {
    symbolMap.set(a.symbol.toUpperCase(), a.symbol);
    if (a.bbgTicker) symbolMap.set(a.bbgTicker.toUpperCase(), a.symbol);
    if (a.ric) symbolMap.set(a.ric.toUpperCase(), a.symbol);
    if (a.isin) symbolMap.set(a.isin.toUpperCase(), a.symbol);
  }

  let foundSymbol: string | undefined;
  for (const [key, sym] of symbolMap) {
    if (upper.includes(key)) {
      if (!foundSymbol || key.length > (symbolMap.get(foundSymbol)?.length ?? 0)) {
        foundSymbol = sym;
      }
    }
  }

  if (!sideMatch && !qtyMatch && !foundSymbol) return null;

  return {
    side: sideMatch?.[1] as OrderSide | undefined,
    quantity: qtyMatch ? Number(qtyMatch[1].replace(/,/g, "")) : undefined,
    symbol: foundSymbol,
    price: priceMatch ? Number(priceMatch[1].replace(/,/g, "")) : undefined,
    strategy: strategyMatch?.[1] as Strategy | undefined,
  };
}

function matchAssets(query: string, assets: AssetDef[]): AssetDef[] {
  if (!query) return [];
  const q = query.toLowerCase();
  return assets
    .filter((a) => {
      const fields = [a.symbol, a.name, a.ric, a.bbgTicker, a.isin, a.sector, a.exchange].filter(
        Boolean
      );
      return fields.some((f) => f?.toLowerCase().includes(q));
    })
    .slice(0, 20);
}

export function SymbolSearchBar() {
  const assets = useAppSelector((s) => s.market.assets);
  const prices = useAppSelector((s) => s.market.prices);
  const query = useSignal("");
  const highlightIdx = useSignal(-1);
  const showResults = useSignal(false);
  const parsedTrade = useSignal<ParsedTrade | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const broadcast = useChannelOut();
  const dispatch = useAppDispatch();

  const results = matchAssets(query.value, assets);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function selectAsset(symbol: string) {
    broadcast({ selectedAsset: symbol });
    query.value = "";
    showResults.value = false;
    highlightIdx.value = -1;
    parsedTrade.value = null;
    inputRef.current?.blur();
  }

  function applyParsedTrade(parsed: ParsedTrade) {
    if (parsed.symbol) broadcast({ selectedAsset: parsed.symbol });
    if (parsed.side) dispatch(setActiveSide(parsed.side));
    if (parsed.strategy) dispatch(setActiveStrategy(parsed.strategy));
    query.value = "";
    showResults.value = false;
    parsedTrade.value = null;
    inputRef.current?.blur();
  }

  function handleInput(value: string) {
    query.value = value;
    highlightIdx.value = -1;
    showResults.value = value.length > 0;

    const parsed = parseTradePaste(value, assets);
    parsedTrade.value = parsed;
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightIdx.value = Math.min(highlightIdx.value + 1, results.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightIdx.value = Math.max(highlightIdx.value - 1, -1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (parsedTrade.value?.symbol && (parsedTrade.value.side || parsedTrade.value.quantity)) {
        applyParsedTrade(parsedTrade.value);
      } else if (highlightIdx.value >= 0 && results[highlightIdx.value]) {
        selectAsset(results[highlightIdx.value].symbol);
      } else if (results.length === 1) {
        selectAsset(results[0].symbol);
      }
    } else if (e.key === "Escape") {
      query.value = "";
      showResults.value = false;
      parsedTrade.value = null;
      inputRef.current?.blur();
    }
  }

  const parsed = parsedTrade.value;

  return (
    <div data-testid="symbol-search-bar" className="relative flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            data-testid="symbol-search-input"
            type="text"
            value={query.value}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => {
              if (query.value) showResults.value = true;
            }}
            onBlur={() => {
              setTimeout(() => {
                showResults.value = false;
              }, 200);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search symbol, RIC, BBG, ISIN or paste trade (Ctrl+/)"
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 pl-8 text-sm text-gray-100 outline-none transition-colors focus:border-emerald-500 placeholder:text-gray-600"
          />
          <svg
            aria-hidden="true"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-600 border border-gray-700 rounded px-1 py-0.5 hidden sm:inline">
            Ctrl+/
          </kbd>
        </div>
      </div>

      {parsed?.symbol && (
        <div
          data-testid="trade-parse-preview"
          className="mx-3 mb-1 flex items-center gap-2 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-1.5 text-xs"
        >
          <span className="text-emerald-400 font-medium">Parsed trade:</span>
          {parsed.side && (
            <span className={parsed.side === "BUY" ? "text-emerald-300" : "text-red-300"}>
              {parsed.side}
            </span>
          )}
          {parsed.quantity && (
            <span className="text-gray-300">{parsed.quantity.toLocaleString()}</span>
          )}
          <span className="text-gray-100 font-semibold">{parsed.symbol}</span>
          {parsed.price && <span className="text-gray-400">@ {parsed.price}</span>}
          {parsed.strategy && (
            <span className="text-sky-400 text-[10px] uppercase">{parsed.strategy}</span>
          )}
          <button
            type="button"
            data-testid="apply-parsed-trade"
            onClick={() => applyParsedTrade(parsed)}
            className="ml-auto px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-medium"
          >
            Apply
          </button>
        </div>
      )}

      {showResults.value && results.length > 0 && (
        <div
          data-testid="symbol-search-results"
          className="mx-3 mb-1 rounded-lg border border-gray-700 bg-gray-950 overflow-hidden max-h-64 overflow-y-auto shadow-xl"
        >
          {results.map((asset, i) => {
            const price = prices[asset.symbol];
            return (
              <button
                type="button"
                key={asset.symbol}
                data-testid={`search-result-${asset.symbol}`}
                onMouseDown={() => selectAsset(asset.symbol)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-xs text-left transition-colors ${
                  i === highlightIdx.value
                    ? "bg-emerald-900/30 text-gray-100"
                    : "text-gray-300 hover:bg-gray-800/50"
                }`}
              >
                <span className="font-bold text-gray-100 w-16 shrink-0">{asset.symbol}</span>
                <span className="flex-1 truncate text-gray-400">{asset.name ?? asset.sector}</span>
                <span className="text-[10px] text-gray-600 w-12 shrink-0">{asset.exchange}</span>
                {asset.ric && (
                  <span className="text-[10px] text-gray-600 w-16 shrink-0 font-mono">
                    {asset.ric}
                  </span>
                )}
                {price != null && (
                  <span className="tabular-nums text-gray-300 w-16 text-right shrink-0">
                    {price.toFixed(asset.symbol.includes("/") ? 4 : 2)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {showResults.value && query.value && results.length === 0 && !parsed?.symbol && (
        <div className="mx-3 mb-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-3 text-xs text-gray-500 text-center">
          No instruments matching &ldquo;{query.value}&rdquo;
        </div>
      )}
    </div>
  );
}
