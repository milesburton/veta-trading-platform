/**
 * Polygon.io provider — REST fallback + WebSocket streaming for equity quotes.
 * Key: POLYGON_KEY (https://polygon.io — free tier: 15-min delayed)
 */

import type { CachedQuote, ProviderDef } from "./types.ts";
import { logger } from "@veta/logger";

const POLYGON_KEY = Deno.env.get("POLYGON_KEY") ?? "";
const PROV = { provider: "polygon" };

async function fetchPolygonLastTrade(
  symbol: string,
): Promise<CachedQuote | null> {
  if (!POLYGON_KEY) return null;
  try {
    logger.debug("fetching last trade", { ...PROV, symbol });
    const url = `https://api.polygon.io/v2/last/trade/${
      encodeURIComponent(symbol)
    }?apiKey=${POLYGON_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { results?: { p?: number; t?: number } };
    const results = data.results;
    if (!results || results.p == null) {
      logger.warn("no last trade data", { ...PROV, symbol });
      return null;
    }
    const price = results.p;
    // t is epoch milliseconds
    const latestTradingDay = results.t
      ? new Date(results.t).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    if (price <= 0) return null;
    return {
      symbol,
      price,
      volume: 0,
      latestTradingDay,
      fetchedAt: Date.now(),
      stale: false,
    };
  } catch (err) {
    logger.warn("last trade fetch failed", {
      ...PROV,
      symbol,
      err: err as Error,
    });
    return null;
  }
}

export const polygonProvider: ProviderDef = {
  id: "polygon",
  label: "Polygon.io",
  description:
    "Real-world equity quotes via Polygon.io. Free tier: 15-min delayed WebSocket streaming. Polling fallback via REST.",
  requiresApiKey: true,
  apiKeyConfigured: POLYGON_KEY.length > 0,
  togglable: true,
  supportsSymbol(symbol: string): boolean {
    return !symbol.includes("/");
  },
  async fetchQuote(
    symbol: string,
    _journalUrl: string,
  ): Promise<CachedQuote | null> {
    return await fetchPolygonLastTrade(symbol);
  },
};

type OnQuote = (quote: CachedQuote) => void;

interface PolygonMsg {
  ev?: string;
  sym?: string;
  p?: number; // price
  s?: number; // size/volume
  t?: number; // timestamp (ms)
}

/**
 * Open a Polygon WebSocket stream for the given symbols.
 * Calls onQuote for each trade event.
 * Returns a teardown function to close the stream.
 */
export function openPolygonStream(
  symbols: string[],
  onQuote: OnQuote,
  apiKey: string = POLYGON_KEY,
): () => void {
  if (!apiKey || symbols.length === 0) {
    return () => {};
  }

  let ws: WebSocket | null = null;
  let closed = false;

  function connect() {
    if (closed) return;
    logger.info("opening WebSocket stream", { ...PROV, symbols });
    ws = new WebSocket("wss://delayed.polygon.io/stocks");

    ws.onopen = () => {
      logger.info("WS connected, authenticating", PROV);
      ws!.send(JSON.stringify({ action: "auth", params: apiKey }));
    };

    ws.onmessage = (event: MessageEvent) => {
      let msgs: PolygonMsg[];
      try {
        msgs = JSON.parse(event.data as string) as PolygonMsg[];
      } catch {
        return;
      }
      for (const msg of msgs) {
        if (msg.ev === "connected") {
          // Polygon sends {"ev":"connected"} before auth
          continue;
        }
        if (msg.ev === "auth_success") {
          // Subscribe to trades for each symbol
          const subs = symbols.map((s) => `T.${s}`).join(",");
          logger.info("auth OK, subscribing", { ...PROV, subs });
          ws!.send(JSON.stringify({ action: "subscribe", params: subs }));
          continue;
        }
        if (msg.ev === "auth_failed") {
          logger.warn("WS auth failed, closing stream", PROV);
          ws!.close();
          return;
        }
        // Trade event
        if (msg.ev === "T" && msg.sym && msg.p != null) {
          const price = msg.p;
          if (price <= 0) continue;
          const latestTradingDay = msg.t
            ? new Date(msg.t).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10);
          onQuote({
            symbol: msg.sym,
            price,
            volume: msg.s ?? 0,
            latestTradingDay,
            fetchedAt: Date.now(),
            stale: false,
          });
        }
      }
    };

    ws.onerror = (err) => {
      logger.warn("WS error", {
        ...PROV,
        message: (err as ErrorEvent).message ?? "unknown",
      });
    };

    ws.onclose = () => {
      if (!closed) {
        logger.info("WS closed, reconnecting in 10s", PROV);
        setTimeout(connect, 10_000);
      }
    };
  }

  connect();

  return () => {
    closed = true;
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore
      }
      ws = null;
    }
  };
}
