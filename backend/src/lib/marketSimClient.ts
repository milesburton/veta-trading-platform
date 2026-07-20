import { logger } from "@veta/logger";

const LIB = { component: "market-client" };

export interface OrderBookLevel {
  price: number;
  size: number;
}
export interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  mid: number;
  ts: number;
}

export interface MarketTick {
  prices: Record<string, number>;
  volumes: Record<string, number>;
  marketMinute: number;
  venueBooks?: Record<string, Record<string, OrderBookSnapshot>>;
}

type TickCallback = (tick: MarketTick) => void;

export interface MarketSimClient {
  start(): void;
  stop(): void;
  onTick(cb: TickCallback): void;
  getLatest(): MarketTick;
}

export interface RawTickMessage {
  full?: true;
  prices?: Record<string, number>;
  volumes?: Record<string, number>;
  marketMinute?: number;
  venueBooks?: Record<string, Record<string, OrderBookSnapshot>>;
}

function isRawTickMessage(data: unknown): data is RawTickMessage {
  return data !== null && typeof data === "object";
}

/**
 * market-sim broadcasts gated diffs (see tickDiff.ts): most ticks omit
 * fields that haven't materially changed, so incoming messages must be
 * merged into the running tick rather than replacing it wholesale — a
 * plain overwrite would flicker prices/venueBooks to empty between the
 * periodic full snapshots. A `full` message already contains every
 * symbol for every venue, so it replaces rather than merges.
 */
function mergeVenueBooks(
  existing: Record<string, Record<string, OrderBookSnapshot>> | undefined,
  incoming: Record<string, Record<string, OrderBookSnapshot>>
): Record<string, Record<string, OrderBookSnapshot>> {
  const venues = new Set([...Object.keys(existing ?? {}), ...Object.keys(incoming)]);
  return Object.fromEntries(
    [...venues].map((venue) => [venue, { ...existing?.[venue], ...incoming[venue] }])
  );
}

export function mergeTick(latest: MarketTick, data: RawTickMessage): MarketTick {
  if (data.full) {
    return {
      prices: data.prices ?? {},
      volumes: data.volumes ?? {},
      marketMinute: data.marketMinute ?? latest.marketMinute,
      venueBooks: data.venueBooks,
    };
  }

  return {
    prices: data.prices ? { ...latest.prices, ...data.prices } : latest.prices,
    volumes: data.volumes ? { ...latest.volumes, ...data.volumes } : latest.volumes,
    marketMinute: data.marketMinute ?? latest.marketMinute,
    venueBooks: data.venueBooks
      ? mergeVenueBooks(latest.venueBooks, data.venueBooks)
      : latest.venueBooks,
  };
}

export function createMarketSimClient(host: string, port: number): MarketSimClient {
  let ws: WebSocket | null = null;
  let latest: MarketTick = { prices: {}, volumes: {}, marketMinute: 0 };
  const callbacks: TickCallback[] = [];
  let reconnectDelay = 1_000;
  let stopped = false;

  function connect(): void {
    if (stopped) return;
    const url = `ws://${host}:${port}`;
    logger.info("connecting to market-sim", { ...LIB, url });
    const socket = new WebSocket(url);
    ws = socket;

    socket.onopen = () => {
      logger.info("connected to market-sim", LIB);
      reconnectDelay = 1_000;
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if ((msg.event === "marketData" || msg.event === "marketUpdate") && isRawTickMessage(msg.data)) {
          latest = mergeTick(latest, msg.data);
          for (const cb of callbacks) cb(latest);
        }
      } catch {
        // malformed message — ignore
      }
    };

    socket.onerror = () => {
      logger.error("WebSocket error", LIB);
    };

    socket.onclose = () => {
      logger.warn("disconnected, reconnecting", {
        ...LIB,
        reconnectDelayMs: reconnectDelay,
      });
      if (!stopped) {
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
      }
    };
  }

  return {
    start(): void {
      if (ws && ws.readyState <= WebSocket.OPEN) return;
      connect();
    },
    stop(): void {
      stopped = true;
      ws?.close();
    },
    onTick(cb: TickCallback): void {
      callbacks.push(cb);
    },
    getLatest(): MarketTick {
      return latest;
    },
  };
}
