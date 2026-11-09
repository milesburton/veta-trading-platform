import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { GatewaySocket, type GatewaySocketHandlers } from "../synthetic-trader/gateway-socket.ts";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function connected(handlers: GatewaySocketHandlers = {}) {
  const socket = new GatewaySocket("ws://gw", handlers);
  socket.connect();
  const ws = FakeWebSocket.instances[0];
  return { socket, ws };
}

const frame = (ws: FakeWebSocket, body: unknown) =>
  ws.onmessage?.({ data: typeof body === "string" ? body : JSON.stringify(body) });

test("[gateway-socket] dispatches each server frame type to its handler", () => {
  const seen: Array<[string, unknown]> = [];
  const { ws } = connected({
    onAuthIdentity: (v) => seen.push(["identity", v]),
    onAuthError: (v) => seen.push(["authError", v]),
    onOrderAck: (v) => seen.push(["ack", v]),
    onOrderRejected: (v) => seen.push(["rejected", v]),
    onOrderEvent: (v) => seen.push(["event", v]),
  });

  frame(ws, { event: "authIdentity", data: { user: { id: "u" } } });
  frame(ws, { event: "authError", data: { reason: "bad token" } });
  frame(ws, { event: "authError" });
  frame(ws, { event: "orderAck", data: { orderId: "o1" } });
  frame(ws, { event: "orderRejected", data: { reason: "limits" } });
  frame(ws, { event: "orderEvent", topic: "orders.filled", data: { id: 1 } });
  frame(ws, { event: "orderEvent" });

  assertEquals(seen, [
    ["identity", { user: { id: "u" } }],
    ["authError", "bad token"],
    ["authError", "unknown auth error"],
    ["ack", { orderId: "o1" }],
    ["rejected", { reason: "limits" }],
    ["event", { topic: "orders.filled", data: { id: 1 } }],
    ["event", { topic: "", data: {} }],
  ]);
});

test("[gateway-socket] ignores malformed, error and unknown frames", () => {
  const onOrderAck = vi.fn();
  const { ws } = connected({ onOrderAck });
  frame(ws, "not json");
  frame(ws, { event: "error", message: "boom" });
  frame(ws, { event: "mystery" });
  assertEquals(onOrderAck.mock.calls.length, 0);
});

test("[gateway-socket] tolerates frames when no handler is registered", () => {
  const { ws } = connected();
  for (const event of ["authIdentity", "authError", "orderAck", "orderRejected", "orderEvent"]) {
    frame(ws, { event, data: {} });
  }
});

test("[gateway-socket] drops messages until the socket is open", () => {
  const { socket, ws } = connected();
  socket.submitOrder({ asset: "AAPL" } as never);
  socket.authenticate("tok");
  assertEquals(ws.sent, []);
  assertEquals(socket.isReady, false);
});

test("[gateway-socket] authenticates immediately when open, and again after reconnecting", () => {
  const { socket, ws } = connected();
  ws.onopen?.();
  assertEquals(socket.isReady, true);
  socket.authenticate("tok");
  assertEquals(JSON.parse(ws.sent[0]), { type: "authenticate", payload: { token: "tok" } });
  socket.submitOrder({ asset: "AAPL" } as never);
  assertEquals(JSON.parse(ws.sent[1]).type, "submitOrder");

  ws.onclose?.();
  vi.advanceTimersByTime(2000);
  const next = FakeWebSocket.instances[1];
  next.onopen?.();
  assertEquals(JSON.parse(next.sent[0]).payload.token, "tok");
});

test("[gateway-socket] backs off between reconnect attempts up to the cap", () => {
  const onClose = vi.fn();
  const { ws } = connected({ onClose });
  ws.onclose?.();
  vi.advanceTimersByTime(2000);
  FakeWebSocket.instances[1].onclose?.();
  vi.advanceTimersByTime(3999);
  assertEquals(FakeWebSocket.instances.length, 2);
  vi.advanceTimersByTime(1);
  assertEquals(FakeWebSocket.instances.length, 3);
  assertEquals(onClose.mock.calls.length, 2);
});

test("[gateway-socket] does not reconnect after an explicit close", () => {
  const { socket, ws } = connected();
  socket.close();
  assertEquals(ws.closed, true);
  ws.onclose?.();
  vi.advanceTimersByTime(60_000);
  assertEquals(FakeWebSocket.instances.length, 1);
});

test("[gateway-socket] survives a socket error", () => {
  const { ws } = connected();
  ws.onerror?.();
  assertEquals(ws.closed, false);
});
