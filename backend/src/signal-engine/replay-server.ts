import type { FeatureVector, Signal } from "@veta/types/intelligence";
import { scoreFeatureVector } from "./scorer.ts";
import type { WeightStore } from "./weight-store.ts";
import {
  computeEventScore,
  computeMomentum,
  computeRealisedVol,
  computeRelativeVolume,
} from "../feature-engine/feature-computers.ts";
import { createMarketEventStore } from "../market-data-adapters/market-event-store.ts";
import { intelligencePool } from "@veta/db";

const JOURNAL_URL = Deno.env.get("JOURNAL_URL") || "http://localhost:5009";

const marketEventStore = createMarketEventStore(intelligencePool);

export interface ReplayFrame {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  signal: Signal;
}

interface JournalCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function runReplay(
  symbol: string,
  from: number,
  to: number,
  weightStore: WeightStore,
): Promise<ReplayFrame[]> {
  const warmupFrom = from - 25 * 60 * 1000;
  const url = `${JOURNAL_URL}/candles?instrument=${
    encodeURIComponent(symbol)
  }&interval=1m&from=${warmupFrom}&to=${to}&limit=2000`;

  let candles: JournalCandle[] = [];
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Journal returned ${res.status}`);
    candles = await res.json() as JournalCandle[];
  } catch (err) {
    throw new Error(`Failed to fetch candles: ${(err as Error).message}`);
  }

  if (candles.length < 2) {
    throw new Error(
      `Insufficient candle data for ${symbol} in requested range`,
    );
  }

  candles.sort((a, b) => a.time - b.time);

  // Load historical context for the replay window
  const eventWindowFrom = from - 7 * 24 * 60 * 60 * 1000;
  const eventWindowTo = to + 90 * 24 * 60 * 60 * 1000;
  const [historicalEvents, weights] = await Promise.all([
    marketEventStore.getEvents(eventWindowFrom, eventWindowTo).catch(() => []),
    weightStore.getWeights(),
  ]);

  const frames: ReplayFrame[] = [];
  const priceWindow: number[] = [];
  const volWindow: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    priceWindow.push(c.close);
    volWindow.push(c.volume);

    if (priceWindow.length > 120) priceWindow.shift();
    if (volWindow.length > 120) volWindow.shift();

    if (c.time < from) continue;

    const fv: FeatureVector = {
      symbol,
      ts: c.time,
      momentum: computeMomentum(priceWindow),
      relativeVolume: computeRelativeVolume(volWindow),
      realisedVol: priceWindow.length >= 20
        ? computeRealisedVol(priceWindow)
        : 0,
      sectorRelativeStrength: 0,
      eventScore: computeEventScore(symbol, historicalEvents),
      newsVelocity: 0,
      sentimentDelta: 0,
    };

    const signal = scoreFeatureVector(fv, weights);

    frames.push({
      ts: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      signal,
    });
  }

  return frames;
}
