import { assert, assertEquals } from "jsr:@std/assert@0.217";
import type { TestStack } from "./services.ts";

export interface WsOrderResponse {
  event: string;
  data: Record<string, unknown>;
}

export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = `tc-${crypto.randomUUID()}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return { verifier, challenge };
}

export async function login(stack: TestStack, user: string): Promise<string> {
  const us = stack.urls["user-service"];
  if (!us) throw new Error("user-service URL not in stack");
  const { verifier, challenge } = await pkce();
  const auth = await fetch(`${us}/oauth/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: "veta-automation",
      username: user,
      redirect_uri: "postmessage",
      response_type: "code",
      scope: "openid profile",
      password: "veta-dev-passcode",
      code_challenge: challenge,
      code_challenge_method: "S256",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  assertEquals(auth.status, 200, `OAuth authorize for ${user} failed`);
  const { code } = (await auth.json()) as { code: string };

  const tokRes = await fetch(`${us}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: "veta-automation",
      code,
      grant_type: "authorization_code",
      redirect_uri: "postmessage",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  await tokRes.body?.cancel();
  assertEquals(tokRes.status, 200, `token exchange for ${user} failed`);
  const cookie = tokRes.headers.get("set-cookie") ?? "";
  const match = cookie.match(/veta_user=([^;]+)/);
  assert(match, `no veta_user cookie for ${user}`);
  return match[1];
}

export async function submitOrderViaWs(
  stack: TestStack,
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
  timeoutMs = 20_000
): Promise<WsOrderResponse & { clientOrderId: string }> {
  const gateway = stack.urls.gateway;
  if (!gateway) throw new Error("gateway URL not in stack");
  const wsUrl = `${gateway.replace(/^http/, "ws")}/ws`;
  const clientOrderId = `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const ws = new WebSocket(wsUrl);
  const closed = new Promise<void>((r) => {
    ws.onclose = () => r();
  });

  let response: WsOrderResponse | null = null;
  try {
    response = await new Promise<WsOrderResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("WS timeout"));
      }, timeoutMs);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "authenticate", payload: { token } }));
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as WsOrderResponse;
        if (msg.event === "authIdentity") {
          ws.send(
            JSON.stringify({
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
            })
          );
        }
        if (msg.event === "orderAck" || msg.event === "orderRejected" || msg.event === "error") {
          clearTimeout(timer);
          ws.close();
          resolve(msg);
        }
        if (msg.event === "authError") {
          clearTimeout(timer);
          ws.close();
          reject(
            new Error(
              `authError:${JSON.stringify((msg as unknown as Record<string, unknown>).data ?? msg)}`
            )
          );
        }
      };
      ws.onerror = () => {
        clearTimeout(timer);
        ws.close();
        reject(new Error("WS error"));
      };
    });
  } finally {
    await closed;
  }
  if (!response) throw new Error("expected websocket response");
  return { ...response, clientOrderId };
}
