import { EventEmitter } from "node:events";
import { beforeAll, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

type Handler = (req: Request) => Response | Promise<Response>;

class FakeTcp extends EventEmitter {
  written: Buffer[] = [];
  destroyed = false;
  failWrite = false;
  write(data: Buffer, cb: (err?: Error) => void) {
    this.written.push(data);
    cb(this.failWrite ? new Error("broken pipe") : undefined);
  }
  destroy() {
    this.destroyed = true;
  }
}

class FakeWs {
  readyState = 1;
  sent: string[] = [];
  closes: Array<[number | undefined, string | undefined]> = [];
  throwOnClose = false;
  onmessage?: (event: { data: unknown }) => void;
  onclose?: () => void;
  onerror?: (err: unknown) => void;
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number, reason?: string) {
    this.closes.push([code, reason]);
    if (this.throwOnClose) throw new Error("already closed");
  }
}

const h = vi.hoisted(() => ({
  handler: undefined as undefined | Handler,
  ws: undefined as unknown,
  connect: vi.fn(),
}));

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveFetch: (_options: unknown, handler: Handler) => {
    h.handler = handler;
  },
  upgradeWebSocket: () => ({ socket: h.ws, response: new Response(null, { status: 200 }) }),
}));
vi.mock("../lib/tcp.ts", () => ({ connectTcp: h.connect }));

let tcp: FakeTcp;
let ws: FakeWs;

async function upgrade(path = "/ws/fix") {
  assert(h.handler);
  const res = await h.handler(
    new Request(`http://fix${path}`, { headers: { upgrade: "WebSocket" } })
  );
  await vi.waitFor(() => assert(h.connect.mock.calls.length > 0));
  await Promise.resolve();
  return res;
}

beforeAll(async () => {
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  await import("../fix/fix-gateway.ts");
});

beforeEach(() => {
  tcp = new FakeTcp();
  ws = new FakeWs();
  h.ws = ws;
  h.connect.mockReset().mockResolvedValue(tcp);
});

test("[fix-gateway] serves health and preflight and rejects other routes", async () => {
  assert(h.handler);
  const health = await h.handler(new Request("http://fix/health"));
  assertEquals((await health.json()).service, "fix-gateway");
  assertEquals((await h.handler(new Request("http://fix/x", { method: "OPTIONS" }))).status, 204);
  assertEquals((await h.handler(new Request("http://fix/x"))).status, 404);
  assertEquals((await h.handler(new Request("http://fix/ws/fix"))).status, 404);
});

test("[fix-gateway] bridges websocket frames to the exchange and back", async () => {
  const res = await upgrade();
  assertEquals(res.status, 200);
  assertEquals(h.connect.mock.calls[0], ["localhost", 9880]);

  assert(ws.onmessage);
  ws.onmessage({ data: "8=FIX.4.4|" });
  ws.onmessage({ data: new TextEncoder().encode("9=12|").buffer });
  assertEquals(
    tcp.written.map((b) => b.toString()),
    ["8=FIX.4.4|", "9=12|"]
  );

  tcp.emit("data", Buffer.from("35=A|"));
  assertEquals(ws.sent, ["35=A|"]);
  ws.readyState = 3;
  tcp.emit("data", Buffer.from("35=0|"));
  assertEquals(ws.sent.length, 1);
});

test("[fix-gateway] accepts the root path for proxied upgrades", async () => {
  const res = await upgrade("/");
  assertEquals(res.status, 200);
});

test("[fix-gateway] closes the websocket when the exchange is unreachable", async () => {
  h.connect.mockRejectedValue(new Error("refused"));
  await upgrade();
  await vi.waitFor(() => assertEquals(ws.closes[0], [1011, "Exchange unavailable"]));
});

test("[fix-gateway] tears both sides down when the client disconnects or errors", async () => {
  await upgrade();
  assert(ws.onclose);
  ws.onclose();
  assertEquals(tcp.destroyed, true);
  assertEquals(ws.closes.length, 1);
  ws.onclose();
  assertEquals(ws.closes.length, 1);

  tcp = new FakeTcp();
  ws = new FakeWs();
  h.ws = ws;
  h.connect.mockResolvedValue(tcp);
  await upgrade();
  assert(ws.onerror);
  ws.onerror(new Error("ws error"));
  assertEquals(tcp.destroyed, true);
});

test("[fix-gateway] tears down when the exchange connection fails or closes", async () => {
  await upgrade();
  tcp.emit("error", new Error("reset"));
  assertEquals(ws.closes.length, 1);
  assertEquals(tcp.destroyed, true);
  tcp.emit("error", new Error("late"));
  tcp.emit("close");
  assertEquals(ws.closes.length, 1);

  tcp = new FakeTcp();
  ws = new FakeWs();
  h.ws = ws;
  h.connect.mockResolvedValue(tcp);
  await upgrade();
  tcp.emit("close");
  assertEquals(ws.closes.length, 1);
});

test("[fix-gateway] a failed write closes the bridge, and a close that throws is tolerated", async () => {
  await upgrade();
  tcp.failWrite = true;
  ws.throwOnClose = true;
  assert(ws.onmessage);
  ws.onmessage({ data: "x" });
  assertEquals(tcp.destroyed, true);
  assertEquals(ws.closes.length, 1);

  ws.onmessage({ data: "ignored after close" });
  assertEquals(tcp.written.length, 1);
});
