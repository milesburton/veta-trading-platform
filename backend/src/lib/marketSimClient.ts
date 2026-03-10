export interface OrderBookLevel { price: number; size: number; }
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

function parseTick(data: unknown): MarketTick {
  if (
    data !== null &&
    typeof data === "object" &&
    "prices" in (data as object) &&
    "volumes" in (data as object)
  ) {
    const d = data as {
      prices: Record<string, number>;
      volumes: Record<string, number>;
      marketMinute: number;
      venueBooks?: Record<string, Record<string, OrderBookSnapshot>>;
    };
    return {
      prices: d.prices,
      volumes: d.volumes,
      marketMinute: d.marketMinute ?? 0,
      venueBooks: d.venueBooks,
    };
  }
  return { prices: data as Record<string, number>, volumes: {}, marketMinute: 0 };
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
    console.log(`[MarketSimClient] Connecting to ${url}...`);
    const socket = new WebSocket(url);
    ws = socket;

    socket.onopen = () => {
      console.log("[MarketSimClient] Connected to market-sim");
      reconnectDelay = 1_000;
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === "marketData" || msg.event === "marketUpdate") {
          latest = parseTick(msg.data);
          for (const cb of callbacks) cb(latest);
        }
      } catch {
        // malformed message — ignore
      }
    };

    socket.onerror = () => {
      console.error("[MarketSimClient] WebSocket error");
    };

    socket.onclose = () => {
      console.warn(`[MarketSimClient] Disconnected. Reconnecting in ${reconnectDelay}ms...`);
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
