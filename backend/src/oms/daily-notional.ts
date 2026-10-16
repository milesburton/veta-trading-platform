import { z } from "zod";

const PricesSchema = z.record(z.number());

export type DailyNotionalDecision =
  | { allowed: true; total: number }
  | { allowed: false; used: number; attempted: number };

export interface DailyNotionalLedger {
  reserve(userId: string, dayKey: string, notional: number, limit: number): DailyNotionalDecision;
}

export function tradingDayKey(ts: number, timeZone = "America/New_York"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

export function createDailyNotionalLedger(): DailyNotionalLedger {
  const totals = new Map<string, { dayKey: string; total: number }>();

  return {
    reserve(userId, dayKey, notional, limit) {
      const entry = totals.get(userId);
      const used = entry?.dayKey === dayKey ? entry.total : 0;
      if (used + notional > limit) return { allowed: false, used, attempted: notional };
      const total = used + notional;
      totals.set(userId, { dayKey, total });
      return { allowed: true, total };
    },
  };
}

export function orderReferencePrice(
  limitPrice: number | undefined,
  marketPrice: number | undefined
): number | null {
  if (limitPrice !== undefined && limitPrice > 0) return limitPrice;
  if (marketPrice !== undefined && Number.isFinite(marketPrice) && marketPrice > 0) {
    return marketPrice;
  }
  return null;
}

export interface MarketPriceSource {
  priceFor(symbol: string): Promise<number | undefined>;
}

export function createMarketPriceSource(
  marketSimUrl: string,
  ttlMs = 2_000,
  fetchFn: typeof fetch = fetch,
  now: () => number = Date.now
): MarketPriceSource {
  let snapshot: { prices: Record<string, number>; expiresAt: number } | null = null;

  return {
    async priceFor(symbol) {
      if (snapshot && snapshot.expiresAt > now()) return snapshot.prices[symbol];
      try {
        const res = await fetchFn(`${marketSimUrl}/prices`, {
          signal: AbortSignal.timeout(2_000),
        });
        if (!res.ok) return undefined;
        const parsed = PricesSchema.safeParse(await res.json());
        if (!parsed.success) return undefined;
        snapshot = { prices: parsed.data, expiresAt: now() + ttlMs };
        return parsed.data[symbol];
      } catch {
        return undefined;
      }
    },
  };
}
