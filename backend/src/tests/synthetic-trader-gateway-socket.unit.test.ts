import { assertEquals } from "jsr:@std/assert@0.217";
import { GatewaySocket } from "../synthetic-trader/gateway-socket.ts";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {}

  open(): void {
    this.onopen?.();
  }

  drop(): void {
    this.onclose?.();
  }
}

const realWebSocket = globalThis.WebSocket;
const realSetTimeout = globalThis.setTimeout;

function withFakeSocket(fn: () => void): void {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  globalThis.setTimeout = ((handler: () => void) => {
    handler();
    return 0;
  }) as unknown as typeof setTimeout;
  try {
    fn();
  } finally {
    globalThis.WebSocket = realWebSocket;
    globalThis.setTimeout = realSetTimeout;
  }
}

const authFrames = (socket: FakeWebSocket) =>
  socket.sent.map((raw) => JSON.parse(raw)).filter((msg) => msg.type === "authenticate");

Deno.test("[synthetic-trader-gateway-socket] token that arrives before the socket opens is sent on open", () => {
  withFakeSocket(() => {
    const gateway = new GatewaySocket("ws://gateway/ws/gateway", {});
    gateway.connect();
    gateway.authenticate("early-token");
    const [socket] = FakeWebSocket.instances;
    assertEquals(authFrames(socket).length, 0);

    socket.open();

    assertEquals(authFrames(socket), [{ type: "authenticate", payload: { token: "early-token" } }]);
  });
});

Deno.test("[synthetic-trader-gateway-socket] token that arrives after the socket opens is sent once", () => {
  withFakeSocket(() => {
    const gateway = new GatewaySocket("ws://gateway/ws/gateway", {});
    gateway.connect();
    const [socket] = FakeWebSocket.instances;
    socket.open();

    gateway.authenticate("late-token");

    assertEquals(authFrames(socket), [{ type: "authenticate", payload: { token: "late-token" } }]);
  });
});

Deno.test("[synthetic-trader-gateway-socket] reconnect re-authenticates with the latest token", () => {
  withFakeSocket(() => {
    const gateway = new GatewaySocket("ws://gateway/ws/gateway", {});
    gateway.connect();
    const [first] = FakeWebSocket.instances;
    first.open();
    gateway.authenticate("token-1");
    gateway.authenticate("token-2");

    first.drop();
    const second = FakeWebSocket.instances[1];
    second.open();

    assertEquals(authFrames(second), [{ type: "authenticate", payload: { token: "token-2" } }]);
  });
});

Deno.test("[synthetic-trader-gateway-socket] opening without a token sends no authenticate frame", () => {
  withFakeSocket(() => {
    const gateway = new GatewaySocket("ws://gateway/ws/gateway", {});
    gateway.connect();
    const [socket] = FakeWebSocket.instances;

    socket.open();

    assertEquals(authFrames(socket).length, 0);
  });
});
