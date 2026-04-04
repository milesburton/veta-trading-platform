import type { MarketAdapterEvent, NewsEvent } from "../types/intelligence.ts";

export function computeMomentum(priceHistory: number[]): number {
  if (priceHistory.length < 20) return 0;
  const current = priceHistory[priceHistory.length - 1];
  const past = priceHistory[priceHistory.length - 20];
  if (past === 0) return 0;
  return (current - past) / past;
}

export function computeRelativeVolume(volumeHistory: number[]): number {
  if (volumeHistory.length < 2) return 1;
  const current = volumeHistory[volumeHistory.length - 1];
  const windowSize = Math.min(20, volumeHistory.length - 1);
  const window = volumeHistory.slice(-windowSize - 1, -1);
  const avg = window.reduce((a, b) => a + b, 0) / window.length;
  if (avg === 0) return 1;
  return current / avg;
}

export function computeRealisedVol(closes: number[]): number {
  if (closes.length < 2) return 0;
  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      logReturns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  if (logReturns.length < 2) return 0;
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) /
    (logReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252 * 390);
}

export function computeSectorRelativeStrength(
  symbolPriceHistory: number[],
  sectorPriceHistories: number[][],
): number {
  if (symbolPriceHistory.length < 20) return 0;

  const symbolReturn = computeMomentum(symbolPriceHistory);
  const sectorReturns = sectorPriceHistories
    .filter((h) => h.length >= 20)
    .map(computeMomentum);

  if (sectorReturns.length === 0) return symbolReturn;

  const sectorAvg = sectorReturns.reduce((a, b) => a + b, 0) /
    sectorReturns.length;
  return symbolReturn - sectorAvg;
}

const EVENT_IMPACT_WEIGHTS: Record<MarketAdapterEvent["impact"], number> = {
  high: 1.0,
  medium: 0.5,
  low: 0.2,
};

export function computeEventScore(
  symbol: string,
  upcomingEvents: MarketAdapterEvent[],
  windowMs = 7 * 24 * 60 * 60 * 1000,
): number {
  const now = Date.now();
  const cutoff = now + windowMs;
  let score = 0;

  for (const ev of upcomingEvents) {
    if (ev.scheduledAt < now || ev.scheduledAt > cutoff) continue;
    const weight = EVENT_IMPACT_WEIGHTS[ev.impact] ?? 0.2;
    if (ev.ticker === symbol) {
      score += weight;
    } else if (!ev.ticker) {
      score += weight * 0.5;
    }
  }

  return score;
}

export function computeNewsVelocity(
  symbol: string,
  recentNews: NewsEvent[],
  windowMs = 60_000,
): number {
  const cutoff = Date.now() - windowMs;
  return recentNews.filter((n) => n.ts >= cutoff && n.tickers.includes(symbol))
    .length;
}

export function computeSentimentDelta(
  symbol: string,
  recentNews: NewsEvent[],
  windowMs = 60_000,
): number {
  const now = Date.now();
  const cutoff = now - windowMs;
  const relevant = recentNews.filter((n) =>
    n.ts >= cutoff && n.tickers.includes(symbol)
  );

  if (relevant.length < 2) return 0;

  const midpoint = cutoff + windowMs / 2;
  const newer = relevant.filter((n) => n.ts >= midpoint);
  const older = relevant.filter((n) => n.ts < midpoint);

  if (newer.length === 0 || older.length === 0) return 0;

  const newerAvg = newer.reduce((a, n) => a + n.sentimentScore, 0) /
    newer.length;
  const olderAvg = older.reduce((a, n) => a + n.sentimentScore, 0) /
    older.length;

  return newerAvg - olderAvg;
}
