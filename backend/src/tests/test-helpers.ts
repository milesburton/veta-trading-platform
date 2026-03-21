import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";

const BASE = Deno.env.get("VETA_BASE_URL") ?? "http://localhost";

function svcUrl(localPort: number, prodPath: string): string {
  if (BASE === "http://localhost") return `${BASE}:${localPort}`;
  return `${BASE}${prodPath}`;
}

export const GATEWAY_URL    = svcUrl(5011, "/api/gateway");
export const JOURNAL_URL    = svcUrl(5009, "/api/journal");
export const OBS_URL        = svcUrl(5007, "/api/observability");
export const USER_SVC_URL   = svcUrl(5008, "/api/user-service");
export const ARCHIVE_URL    = svcUrl(5012, "/api/fix-archive");

export const GATEWAY_WS_URL = BASE === "http://localhost"
  ? "ws://localhost:5011/ws"
  : BASE.replace(/^http/, "ws") + "/ws/gateway";

export function timeout(ms = 10_000) { return AbortSignal.timeout(ms); }

/** POST /sessions and return the raw veta_user token value. */
export async function loginAs(userId: string): Promise<string> {
  const res = await fetch(`${USER_SVC_URL}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
    signal: timeout(),
  });
  assertEquals(res.status, 200, `Login as ${userId} failed`);
  await res.body?.cancel();
  const cookie = res.headers.get("set-cookie") ?? "";
  const match = cookie.match(/veta_user=([^;]+)/);
  assert(match, `No veta_user cookie for ${userId}`);
  return match[1];
}

export interface WsOrderResponse {
  event: string;
  data: Record<string, unknown>;
}

/**
 * Submit an order via gateway WebSocket (post-connection auth).
 * Returns the full gateway response (orderAck or orderRejected).
 * The clientOrderId used is embedded in the returned data.
 */
export async function submitOrderViaWs(
  token: string,
  order: {
    asset: string;
    side: "BUY" | "SELL";
    quantity: number;
    limitPrice: number;
    strategy?: string;
    instrumentType?: string;
    algoParams?: Record<string, unknown>;
    expiresAt?: number;
  },
  timeoutMs = 10_000,
): Promise<WsOrderResponse & { clientOrderId: string }> {
  const clientOrderId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const ws = new WebSocket(GATEWAY_WS_URL);
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });

  const response = await new Promise<WsOrderResponse>((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(new Error("WS timeout")); }, timeoutMs);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "authenticate", payload: { token } }));
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as WsOrderResponse;
      if (msg.event === "authIdentity") {
        ws.send(JSON.stringify({
          type: "submitOrder",
          payload: {
            clientOrderId,
            asset: order.asset,
            side: order.side,
            quantity: order.quantity,
            limitPrice: order.limitPrice,
            expiresAt: order.expiresAt ?? 60,
            strategy: order.strategy ?? "LIMIT",
            instrumentType: order.instrumentType,
            algoParams: order.algoParams ?? { strategy: order.strategy ?? "LIMIT" },
          },
        }));
      }
      if (msg.event === "orderAck" || msg.event === "orderRejected") {
        clearTimeout(timer);
        ws.close();
        resolve(msg);
      }
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("WS error")); };
  });

  await closed;
  return { ...response, clientOrderId };
}
