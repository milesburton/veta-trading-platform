const FALLBACK_REF: Record<string, number> = {
  AAPL: 180,
  MSFT: 420,
  GOOGL: 170,
  AMZN: 200,
  TSLA: 250,
  META: 480,
  NVDA: 880,
  JPM: 200,
  V: 270,
  WMT: 95,
};

export interface RefPriceCache {
  refPriceFor(symbol: string): number;
  refresh(): Promise<void>;
}

export function createRefPriceCache(
  marketSimUrl: string,
  refreshMs: number = 1_000
): RefPriceCache {
  const cache: Record<string, number> = {};
  let lastRefreshAt = 0;

  const refresh = async (): Promise<void> => {
    try {
      const res = await fetch(`${marketSimUrl}/prices`, { signal: AbortSignal.timeout(2_000) });
      if (!res.ok) return;
      const prices = (await res.json()) as Record<string, number>;
      Object.assign(cache, prices);
      lastRefreshAt = Date.now();
    } catch {
      /* keep last known */
    }
  };

  const refPriceFor = (symbol: string): number => {
    if (Date.now() - lastRefreshAt > refreshMs) {
      void refresh();
    }
    return cache[symbol] ?? FALLBACK_REF[symbol] ?? 100;
  };

  return { refPriceFor, refresh };
}
