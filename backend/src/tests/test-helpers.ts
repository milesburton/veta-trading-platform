/**
 * Shared test helpers for backend integration and smoke tests.
 * Requires all backend services to be running.
 */

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";

export const GATEWAY_URL    = "http://localhost:5011";
export const GATEWAY_WS_URL = "ws://localhost:5011/ws";
export const JOURNAL_URL    = "http://localhost:5009";
export const OBS_URL        = "http://localhost:5007";
export const USER_SVC_URL   = "http://localhost:5008";
export const ARCHIVE_URL    = "http://localhost:5012";

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
            expiresAt: 300,
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
