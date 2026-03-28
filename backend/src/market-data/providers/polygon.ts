/**
 * Polygon.io provider — REST fallback + WebSocket streaming for equity quotes.
 * Key: POLYGON_KEY (https://polygon.io — free tier: 15-min delayed)
 */

import type { CachedQuote, ProviderDef } from "./types.ts";

const POLYGON_KEY = Deno.env.get("POLYGON_KEY") ?? "";

async function fetchPolygonLastTrade(symbol: string): Promise<CachedQuote | null> {
  if (!POLYGON_KEY) return null;
  try {
    console.log(`[polygon] Fetching last trade for ${symbol}`);
    const url =
      `https://api.polygon.io/v2/last/trade/${encodeURIComponent(symbol)}?apiKey=${POLYGON_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { results?: { p?: number; t?: number } };
    const results = data.results;
    if (!results || results.p == null) {
      console.warn(`[polygon] No last trade data for ${symbol}`);
      return null;
    }
    const price = results.p;
    // t is epoch milliseconds
    const latestTradingDay = results.t
      ? new Date(results.t).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    if (price <= 0) return null;
    return { symbol, price, volume: 0, latestTradingDay, fetchedAt: Date.now(), stale: false };
  } catch (err) {
    console.warn(`[polygon] Last trade fetch failed for ${symbol}: ${(err as Error).message}`);
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
  async fetchQuote(symbol: string, _journalUrl: string): Promise<CachedQuote | null> {
    return await fetchPolygonLastTrade(symbol);
  },
};

type OnQuote = (quote: CachedQuote) => void;

interface PolygonMsg {
  ev?: string;
  sym?: string;
  p?: number;   // price
  s?: number;   // size/volume
  t?: number;   // timestamp (ms)
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
    console.log(`[polygon] Opening WebSocket stream for ${symbols.join(", ")}`);
    ws = new WebSocket("wss://delayed.polygon.io/stocks");

    ws.onopen = () => {
      console.log(`[polygon] WS connected — authenticating`);
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
          console.log(`[polygon] Auth OK — subscribing to ${subs}`);
          ws!.send(JSON.stringify({ action: "subscribe", params: subs }));
          continue;
        }
        if (msg.ev === "auth_failed") {
          console.warn(`[polygon] WS auth failed — closing stream`);
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
      console.warn(`[polygon] WS error: ${(err as ErrorEvent).message ?? "unknown"}`);
    };

    ws.onclose = () => {
      if (!closed) {
        console.log(`[polygon] WS closed — reconnecting in 10s`);
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
