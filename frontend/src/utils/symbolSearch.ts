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

export interface ParsedTrade {
  side?: OrderSide;
  quantity?: number;
  symbol?: string;
  price?: number;
  strategy?: Strategy;
}

export function parseTradePaste(input: string, assets: AssetDef[]): ParsedTrade | null {
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

export function matchAssets(query: string, assets: AssetDef[]): AssetDef[] {
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
