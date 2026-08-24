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
  venueBooks?: Record<string, Record<string, OrderBookSnapshot>>;
  sessionPhase: SessionPhase;
}

export interface TickDiffState {
  lastPrices: Record<string, number>;
  lastVolumes: Record<string, number>;
  lastBookPrices: Record<string, number>;
  lastVenueBookPrices: Record<string, Record<string, number>>;
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

/** Bound high-frequency publishing when the downstream transport is slow. */
export function createSingleFlightPublisher<T>(
  send: (value: T) => Promise<void>,
): (value: T) => boolean {
  let inFlight = false;

  return (value: T): boolean => {
    if (inFlight) return false;
    inFlight = true;
    try {
      Promise.resolve()
        .then(() => send(value))
        .catch(() => {})
        .finally(() => {
          inFlight = false;
        });
    } catch {
      inFlight = false;
    }
    return true;
  };
}

export function createTickDiffState(): TickDiffState {
  return {
    lastPrices: {},
    lastVolumes: {},
    lastBookPrices: {},
    lastVenueBookPrices: {},
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

function diffVenueBooks(
  venueBooks: Record<string, Record<string, OrderBookSnapshot>>,
  prices: Record<string, number>,
  lastVenueBookPrices: Record<string, Record<string, number>>
): {
  diff: Record<string, Record<string, OrderBookSnapshot>> | undefined;
  nextLastVenueBookPrices: Record<string, Record<string, number>>;
} {
  let diff: Record<string, Record<string, OrderBookSnapshot>> | undefined;
  const nextLastVenueBookPrices: Record<string, Record<string, number>> = {};

  for (const [venue, book] of Object.entries(venueBooks)) {
    const lastForVenue = lastVenueBookPrices[venue] ?? {};
    const changedSymbols = bookWorthyMovedSymbols(prices, lastForVenue);
    nextLastVenueBookPrices[venue] = { ...lastForVenue, ...pick(prices, changedSymbols) };
    if (changedSymbols.length > 0) {
      diff ??= {};
      diff[venue] = pick(book, changedSymbols);
    }
  }

  return { diff, nextLastVenueBookPrices };
}

// docs: /platform/market-simulator/
// #region docs:symbols-needing-fresh-book
export function symbolsNeedingFreshBook(
  prices: Record<string, number>,
  state: TickDiffState,
  now: number
): string[] {
  const dueFull =
    state.lastFullSnapshotAt === null ||
    now - state.lastFullSnapshotAt >= FULL_SNAPSHOT_INTERVAL_MS;
  if (dueFull) return Object.keys(prices);

  const needed = new Set(bookWorthyMovedSymbols(prices, state.lastBookPrices));
  for (const lastForVenue of Object.values(state.lastVenueBookPrices)) {
    for (const sym of bookWorthyMovedSymbols(prices, lastForVenue)) needed.add(sym);
  }
  return [...needed];
}
// #endregion docs:symbols-needing-fresh-book

export function buildTickDiff(
  payload: TickPayload,
  state: TickDiffState,
  now: number
): { diff: TickDiff; nextState: TickDiffState } {
  const dueFull =
    state.lastFullSnapshotAt === null ||
    now - state.lastFullSnapshotAt >= FULL_SNAPSHOT_INTERVAL_MS;

  if (dueFull) {
    const lastVenueBookPrices: Record<string, Record<string, number>> = {};
    if (payload.venueBooks) {
      for (const venue of Object.keys(payload.venueBooks)) {
        lastVenueBookPrices[venue] = { ...payload.prices };
      }
    }
    return {
      diff: {
        prices: payload.prices,
        openPrices: payload.openPrices,
        volumes: payload.volumes,
        marketMinute: payload.marketMinute,
        orderBook: payload.orderBook,
        venueBooks: payload.venueBooks,
        sessionPhase: payload.sessionPhase,
        full: true,
      },
      nextState: {
        lastPrices: { ...payload.prices },
        lastVolumes: { ...payload.volumes },
        lastBookPrices: { ...payload.prices },
        lastVenueBookPrices,
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
  const venueBooksResult = payload.venueBooks
    ? diffVenueBooks(payload.venueBooks, payload.prices, state.lastVenueBookPrices)
    : undefined;

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
  if (venueBooksResult?.diff) {
    diff.venueBooks = venueBooksResult.diff;
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
  const nextLastVenueBookPrices = venueBooksResult?.nextLastVenueBookPrices ?? state.lastVenueBookPrices;
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
      lastVenueBookPrices: nextLastVenueBookPrices,
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
    diff.venueBooks === undefined &&
    diff.marketMinute === undefined &&
    diff.sessionPhase === undefined
  );
}
