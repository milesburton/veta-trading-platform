import type { OrderBookSnapshot } from "@veta/market-client";

export type SessionPhase =
  | "PRE_OPEN"
  | "OPENING_AUCTION"
  | "CONTINUOUS"
  | "CLOSING_AUCTION"
  | "HALTED"
  | "CLOSED";

export interface TickPayload {
  prices: Record<string, number>;
  openPrices: Record<string, number>;
  volumes: Record<string, number>;
  marketMinute: number;
  orderBook: Record<string, OrderBookSnapshot>;
  sessionPhase: SessionPhase;
}

export interface TickDiffState {
  lastPrices: Record<string, number>;
  lastVolumes: Record<string, number>;
  lastBookPrices: Record<string, number>;
  lastOpenPrices: Record<string, number>;
  lastMarketMinute: number | null;
  lastSessionPhase: SessionPhase | null;
  lastFullSnapshotAt: number | null;
}

export type TickDiff = Partial<TickPayload> & { full?: true };

export const PRICE_EPSILON = 0.0001;
export const VOLUME_EPSILON = 1;
export const BOOK_MATERIAL_BPS = 5;
export const FULL_SNAPSHOT_INTERVAL_MS = 60_000;

export function createTickDiffState(): TickDiffState {
  return {
    lastPrices: {},
    lastVolumes: {},
    lastBookPrices: {},
    lastOpenPrices: {},
    lastMarketMinute: null,
    lastSessionPhase: null,
    lastFullSnapshotAt: null,
  };
}

function changedNumericSymbols(
  current: Record<string, number>,
  previous: Record<string, number>,
  threshold: number
): string[] {
  const changed: string[] = [];
  for (const [sym, value] of Object.entries(current)) {
    const prev = previous[sym];
    if (prev === undefined || Math.abs(value - prev) >= threshold) {
      changed.push(sym);
    }
  }
  return changed;
}

function changedPriceSymbols(
  current: Record<string, number>,
  previous: Record<string, number>
): string[] {
  const changed: string[] = [];
  for (const [sym, price] of Object.entries(current)) {
    const prev = previous[sym];
    if (prev === undefined || Math.abs(price - prev) >= PRICE_EPSILON) {
      changed.push(sym);
    }
  }
  return changed;
}

function bookWorthyMovedSymbols(
  current: Record<string, number>,
  lastBook: Record<string, number>
): string[] {
  const changed: string[] = [];
  for (const [sym, price] of Object.entries(current)) {
    const prev = lastBook[sym];
    if (prev === undefined) {
      changed.push(sym);
      continue;
    }
    const bps = (Math.abs(price - prev) / prev) * 10_000;
    if (bps >= BOOK_MATERIAL_BPS) changed.push(sym);
  }
  return changed;
}

function pick<T>(source: Record<string, T>, keys: readonly string[]): Record<string, T> {
  const result: Record<string, T> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function buildTickDiff(
  payload: TickPayload,
  state: TickDiffState,
  now: number
): { diff: TickDiff; nextState: TickDiffState } {
  const dueFull =
    state.lastFullSnapshotAt === null ||
    now - state.lastFullSnapshotAt >= FULL_SNAPSHOT_INTERVAL_MS;

  if (dueFull) {
    return {
      diff: {
        prices: payload.prices,
        openPrices: payload.openPrices,
        volumes: payload.volumes,
        marketMinute: payload.marketMinute,
        orderBook: payload.orderBook,
        sessionPhase: payload.sessionPhase,
        full: true,
      },
      nextState: {
        lastPrices: { ...payload.prices },
        lastVolumes: { ...payload.volumes },
        lastBookPrices: { ...payload.prices },
        lastOpenPrices: { ...payload.openPrices },
        lastMarketMinute: payload.marketMinute,
        lastSessionPhase: payload.sessionPhase,
        lastFullSnapshotAt: now,
      },
    };
  }

  const movedSymbols = changedPriceSymbols(payload.prices, state.lastPrices);
  const volumeChangedSymbols = changedNumericSymbols(
    payload.volumes,
    state.lastVolumes,
    VOLUME_EPSILON
  );
  const bookSymbols = bookWorthyMovedSymbols(payload.prices, state.lastBookPrices);
  const openChangedSymbols = changedPriceSymbols(payload.openPrices, state.lastOpenPrices);
  const minuteChanged = payload.marketMinute !== state.lastMarketMinute;
  const phaseChanged = payload.sessionPhase !== state.lastSessionPhase;

  const diff: TickDiff = {};
  if (movedSymbols.length > 0) {
    diff.prices = pick(payload.prices, movedSymbols);
  }
  if (volumeChangedSymbols.length > 0) {
    diff.volumes = pick(payload.volumes, volumeChangedSymbols);
  }
  if (bookSymbols.length > 0) {
    diff.orderBook = pick(payload.orderBook, bookSymbols);
  }
  if (openChangedSymbols.length > 0) {
    diff.openPrices = pick(payload.openPrices, openChangedSymbols);
  }
  if (minuteChanged) diff.marketMinute = payload.marketMinute;
  if (phaseChanged) diff.sessionPhase = payload.sessionPhase;

  const nextLastPrices =
    movedSymbols.length > 0 ? { ...state.lastPrices, ...diff.prices } : state.lastPrices;
  const nextLastVolumes =
    volumeChangedSymbols.length > 0 ? { ...state.lastVolumes, ...diff.volumes } : state.lastVolumes;
  const nextLastBookPrices =
    bookSymbols.length > 0
      ? { ...state.lastBookPrices, ...pick(payload.prices, bookSymbols) }
      : state.lastBookPrices;
  const nextLastOpenPrices =
    openChangedSymbols.length > 0
      ? { ...state.lastOpenPrices, ...diff.openPrices }
      : state.lastOpenPrices;

  return {
    diff,
    nextState: {
      lastPrices: nextLastPrices,
      lastVolumes: nextLastVolumes,
      lastBookPrices: nextLastBookPrices,
      lastOpenPrices: nextLastOpenPrices,
      lastMarketMinute: payload.marketMinute,
      lastSessionPhase: payload.sessionPhase,
      lastFullSnapshotAt: state.lastFullSnapshotAt,
    },
  };
}

export function isEmptyDiff(diff: TickDiff): boolean {
  if (diff.full) return false;
  return (
    diff.prices === undefined &&
    diff.openPrices === undefined &&
    diff.volumes === undefined &&
    diff.orderBook === undefined &&
    diff.marketMinute === undefined &&
    diff.sessionPhase === undefined
  );
}
