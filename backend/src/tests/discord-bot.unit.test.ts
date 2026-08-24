import { assert, assertEquals } from "jsr:@std/assert@0.217";
import {
  buildWelcomeMessage,
  classifyGatewayEnvelope,
  connect,
  decideWelcomePost,
  extractHeartbeatIntervalMs,
} from "../discord-bot/discord-bot.ts";

Deno.test("buildWelcomeMessage mentions the joining member", () => {
  const msg = buildWelcomeMessage("<@42>");
  assert(msg.includes("<@42>"));
});

Deno.test("buildWelcomeMessage points to the support channel", () => {
  const msg = buildWelcomeMessage("<@1>");
  assert(msg.includes("#support"));
});

Deno.test("buildWelcomeMessage is a single-line greeting", () => {
  const msg = buildWelcomeMessage("<@1>");
  assertEquals(msg.includes("\n"), false);
});

Deno.test("extractHeartbeatIntervalMs reads heartbeat_interval from the payload", () => {
  assertEquals(extractHeartbeatIntervalMs({ op: 10, d: { heartbeat_interval: 30_000 } }), 30_000);
});

Deno.test("extractHeartbeatIntervalMs falls back to the Discord default when missing", () => {
  assertEquals(extractHeartbeatIntervalMs({ op: 10 }), 41_250);
});

Deno.test("extractHeartbeatIntervalMs falls back when d is not an object with the field", () => {
  assertEquals(extractHeartbeatIntervalMs({ op: 10, d: null }), 41_250);
});

Deno.test("classifyGatewayEnvelope: op 10 is a hello with the derived heartbeat interval", () => {
  const action = classifyGatewayEnvelope({ op: 10, d: { heartbeat_interval: 5_000 } });
  assertEquals(action, { kind: "hello", heartbeatIntervalMs: 5_000 });
});

Deno.test("classifyGatewayEnvelope: op 0 t=READY is ready", () => {
  const action = classifyGatewayEnvelope({ op: 0, t: "READY" });
  assertEquals(action, { kind: "ready" });
});

Deno.test("classifyGatewayEnvelope: op 0 t=GUILD_MEMBER_ADD carries the payload", () => {
  const data = { user: { id: "123" } };
  const action = classifyGatewayEnvelope({ op: 0, t: "GUILD_MEMBER_ADD", d: data });
  assertEquals(action, { kind: "guildMemberAdd", data });
});

Deno.test("classifyGatewayEnvelope: unrecognised op/t pairs are ignored", () => {
  assertEquals(classifyGatewayEnvelope({ op: 11 }), { kind: "ignore" });
  assertEquals(classifyGatewayEnvelope({ op: 0, t: "MESSAGE_CREATE" }), { kind: "ignore" });
  assertEquals(classifyGatewayEnvelope({ op: 0 }), { kind: "ignore" });
});

Deno.test("decideWelcomePost posts when a channel is configured and the member has an id", () => {
  const decision = decideWelcomePost({ user: { id: "42" } }, "chan-1");
  assertEquals(decision.shouldPost, true);
  assertEquals(decision.channelId, "chan-1");
  assert(decision.message?.includes("<@42>"));
});

Deno.test("decideWelcomePost does not post when no welcome channel is configured", () => {
  const decision = decideWelcomePost({ user: { id: "42" } }, "");
  assertEquals(decision.shouldPost, false);
  assertEquals(decision.channelId, undefined);
  assertEquals(decision.message, undefined);
});

Deno.test("decideWelcomePost does not post when the payload has no user", () => {
  const decision = decideWelcomePost({}, "chan-1");
  assertEquals(decision.shouldPost, false);
});

Deno.test("decideWelcomePost does not post when the payload is not an object with a user", () => {
  const decision = decideWelcomePost(null, "chan-1");
  assertEquals(decision.shouldPost, false);
});

function withGatewayServer(
  onOpen: (socket: WebSocket) => void
): { url: string; close: () => Promise<void> } {
  const controller = new AbortController();
  let serverSocket: WebSocket | undefined;
  const server = Deno.serve(
    { port: 0, signal: controller.signal, onListen: () => {} },
    (req) => {
      const { socket, response } = Deno.upgradeWebSocket(req);
      serverSocket = socket;
      socket.onopen = () => onOpen(socket);
      return response;
    }
  );
  const addr = server.addr as Deno.NetAddr;
  return {
    url: `ws://127.0.0.1:${addr.port}`,
    close: async () => {
      serverSocket?.close();
      controller.abort();
      await server.finished;
    },
  };
}

Deno.test("connect() identifies after receiving Hello (op 10)", async () => {
  const received: unknown[] = [];
  const { url, close } = withGatewayServer((socket) => {
    socket.onmessage = (event) => received.push(JSON.parse(event.data as string));
    socket.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 45_000 } }));
  });
  const client = connect(url, { reconnect: false });
  try {
    const deadline = Date.now() + 5_000;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assertEquals(received.length, 1);
    const identify = received[0] as { op: number; d: { intents: number } };
    assertEquals(identify.op, 2);
    assertEquals(identify.d.intents, 1 << 1);
  } finally {
    client.close();
    await close();
  }
});

Deno.test("connect() sends a heartbeat carrying the last sequence number after Hello", async () => {
  const received: { op: number; d: unknown }[] = [];
  const { url, close } = withGatewayServer((socket) => {
    socket.onmessage = (event) => received.push(JSON.parse(event.data as string));
    // A short heartbeat interval so the test doesn't wait 40+ seconds.
    socket.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 50 }, s: 7 }));
  });
  const client = connect(url, { reconnect: false });
  try {
    const deadline = Date.now() + 5_000;
    while (received.filter((m) => m.op === 1).length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    const heartbeat = received.find((m) => m.op === 1);
    assert(heartbeat, "expected a heartbeat (op 1) to be sent");
    assertEquals(heartbeat.d, 7, "heartbeat must carry the last-seen sequence number");
  } finally {
    client.close();
    await close();
  }
});

Deno.test("connect() ignores a malformed frame, then still identifies on a subsequent Hello", async () => {
  const received: unknown[] = [];
  const { url, close } = withGatewayServer((socket) => {
    socket.onmessage = (event) => received.push(JSON.parse(event.data as string));
    socket.send("not json{{{");
    socket.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 45_000 } }));
  });
  const client = connect(url, { reconnect: false });
  try {
    const deadline = Date.now() + 5_000;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assertEquals(received.length, 1, "the malformed frame must be dropped, not crash the handler");
    const identify = received[0] as { op: number };
    assertEquals(identify.op, 2, "the client must still identify after the malformed frame");
  } finally {
    client.close();
    await close();
  }
});
