import { assert, assertEquals } from "jsr:@std/assert@0.217";
import {
  buildMotd,
  buildTriagePrompt,
  buildWelcomeMessage,
  classifyGatewayEnvelope,
  connect,
  decideTriageRequest,
  decideWelcomePost,
  extractHeartbeatIntervalMs,
  isTriageRateLimited,
  parseTriageResponse,
} from "../discord-bot/discord-bot.ts";

Deno.test("buildWelcomeMessage mentions the joining member", () => {
  const msg = buildWelcomeMessage("<@42>");
  assert(msg.includes("<@42>"));
});

Deno.test("buildWelcomeMessage points to the Raise. command", () => {
  const msg = buildWelcomeMessage("<@1>");
  assert(msg.includes("Raise."));
});

Deno.test("buildMotd mentions the Raise. command and @mention trigger", () => {
  const msg = buildMotd("https://docs.example/", "https://platform.example/");
  assert(msg.includes("Raise."));
  assert(msg.includes("@mention"));
});

Deno.test("buildMotd includes the given docs and platform URLs", () => {
  const msg = buildMotd("https://docs.example/", "https://platform.example/");
  assert(msg.includes("https://docs.example/"));
  assert(msg.includes("https://platform.example/"));
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

Deno.test("classifyGatewayEnvelope: op 0 t=READY carries the payload", () => {
  const data = { user: { id: "1234567890" } };
  const action = classifyGatewayEnvelope({ op: 0, t: "READY", d: data });
  assertEquals(action, { kind: "ready", data });
});

Deno.test("classifyGatewayEnvelope: op 0 t=GUILD_MEMBER_ADD carries the payload", () => {
  const data = { user: { id: "123" } };
  const action = classifyGatewayEnvelope({ op: 0, t: "GUILD_MEMBER_ADD", d: data });
  assertEquals(action, { kind: "guildMemberAdd", data });
});

Deno.test("classifyGatewayEnvelope: op 0 t=MESSAGE_CREATE carries the payload", () => {
  const data = { id: "1", channel_id: "2", content: "hello" };
  const action = classifyGatewayEnvelope({ op: 0, t: "MESSAGE_CREATE", d: data });
  assertEquals(action, { kind: "messageCreate", data });
});

Deno.test("classifyGatewayEnvelope: unrecognised op/t pairs are ignored", () => {
  assertEquals(classifyGatewayEnvelope({ op: 11 }), { kind: "ignore" });
  assertEquals(classifyGatewayEnvelope({ op: 0, t: "TYPING_START" }), { kind: "ignore" });
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

function withGatewayServer(onOpen: (socket: WebSocket) => void): {
  url: string;
  close: () => Promise<void>;
} {
  const controller = new AbortController();
  let serverSocket: WebSocket | undefined;
  const server = Deno.serve({ port: 0, signal: controller.signal, onListen: () => {} }, (req) => {
    const { socket, response } = Deno.upgradeWebSocket(req);
    serverSocket = socket;
    socket.onopen = () => onOpen(socket);
    return response;
  });
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
    assertEquals(identify.d.intents, (1 << 1) | (1 << 9) | (1 << 15));
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

Deno.test("decideTriageRequest ignores messages from bots", () => {
  const decision = decideTriageRequest({
    id: "1",
    channel_id: "c1",
    content: "Raise. something broke",
    author: { id: "9", username: "other-bot", bot: true },
  });
  assertEquals(decision.shouldTriage, false);
});

Deno.test("decideTriageRequest ignores messages without the Raise. prefix", () => {
  const decision = decideTriageRequest({
    id: "1",
    channel_id: "c1",
    content: "the candlestick chart is broken",
    author: { id: "9", username: "alice" },
  });
  assertEquals(decision.shouldTriage, false);
});

Deno.test("decideTriageRequest ignores an empty message after the prefix", () => {
  const decision = decideTriageRequest({
    id: "1",
    channel_id: "c1",
    content: "Raise.   ",
    author: { id: "9", username: "alice" },
  });
  assertEquals(decision.shouldTriage, false);
});

Deno.test("decideTriageRequest ignores a payload missing required fields", () => {
  assertEquals(decideTriageRequest({}).shouldTriage, false);
  assertEquals(decideTriageRequest(null).shouldTriage, false);
  assertEquals(
    decideTriageRequest({ id: "1", content: "Raise. x", author: { id: "9" } }).shouldTriage,
    false
  );
});

Deno.test("decideTriageRequest extracts fields for a valid Raise. message", () => {
  const decision = decideTriageRequest({
    id: "msg-1",
    channel_id: "chan-1",
    guild_id: "guild-1",
    content: "raise.  the candlestick chart shows blank bars",
    author: { id: "9", username: "alice" },
  });
  assertEquals(decision.shouldTriage, true);
  assertEquals(decision.request?.authorId, "9");
  assertEquals(decision.request?.authorName, "alice");
  assertEquals(decision.request?.channelId, "chan-1");
  assertEquals(decision.request?.messageId, "msg-1");
  assertEquals(decision.request?.guildId, "guild-1");
  assertEquals(decision.request?.freeText, "the candlestick chart shows blank bars");
});

Deno.test("decideTriageRequest falls back to author id when username is missing", () => {
  const decision = decideTriageRequest({
    id: "1",
    channel_id: "c1",
    content: "Raise. broken thing",
    author: { id: "9" },
  });
  assertEquals(decision.request?.authorName, "9");
});

Deno.test("decideTriageRequest triages a message that @mentions the bot", () => {
  const decision = decideTriageRequest(
    {
      id: "msg-1",
      channel_id: "chan-1",
      content: "<@1234567890> the candlestick chart shows blank bars",
      author: { id: "9", username: "alice" },
    },
    "1234567890"
  );
  assertEquals(decision.shouldTriage, true);
  assertEquals(decision.request?.freeText, "the candlestick chart shows blank bars");
});

Deno.test("decideTriageRequest handles the nickname-mention form <@!id>", () => {
  const decision = decideTriageRequest(
    {
      id: "msg-1",
      channel_id: "chan-1",
      content: "<@!1234567890> the candlestick chart shows blank bars",
      author: { id: "9", username: "alice" },
    },
    "1234567890"
  );
  assertEquals(decision.shouldTriage, true);
  assertEquals(decision.request?.freeText, "the candlestick chart shows blank bars");
});

Deno.test("decideTriageRequest strips a mid-message mention of the bot", () => {
  const decision = decideTriageRequest(
    {
      id: "msg-1",
      channel_id: "chan-1",
      content: "hey <@1234567890> the candlestick chart shows blank bars",
      author: { id: "9", username: "alice" },
    },
    "1234567890"
  );
  assertEquals(decision.shouldTriage, true);
  assertEquals(decision.request?.freeText, "hey   the candlestick chart shows blank bars");
});

Deno.test("decideTriageRequest ignores a mention-only message with no other text", () => {
  const decision = decideTriageRequest(
    {
      id: "1",
      channel_id: "c1",
      content: "<@1234567890>   ",
      author: { id: "9", username: "alice" },
    },
    "1234567890"
  );
  assertEquals(decision.shouldTriage, false);
});

Deno.test("decideTriageRequest ignores a mention of a different user, not the bot", () => {
  const decision = decideTriageRequest(
    {
      id: "1",
      channel_id: "c1",
      content: "<@someone-else> can you look at this bug",
      author: { id: "9", username: "alice" },
    },
    "1234567890"
  );
  assertEquals(decision.shouldTriage, false);
});

Deno.test("decideTriageRequest ignores mentions when the bot's own id is unknown", () => {
  const decision = decideTriageRequest({
    id: "1",
    channel_id: "c1",
    content: "<@1234567890> the chart is broken",
    author: { id: "9", username: "alice" },
  });
  assertEquals(decision.shouldTriage, false);
});

Deno.test("decideTriageRequest still honours the Raise. prefix when a bot id is known", () => {
  const decision = decideTriageRequest(
    {
      id: "1",
      channel_id: "c1",
      content: "Raise. the chart is broken",
      author: { id: "9", username: "alice" },
    },
    "1234567890"
  );
  assertEquals(decision.shouldTriage, true);
  assertEquals(decision.request?.freeText, "the chart is broken");
});

Deno.test("buildTriagePrompt strips control characters and truncates long input", () => {
  const prompt = buildTriagePrompt("hello\n\rworld");
  assert(!prompt.includes("\n\r"), "control chars must be stripped");

  const long = buildTriagePrompt("x".repeat(2_000));
  assert(long.length < 1_100, "input must be truncated before reaching the model");
});

Deno.test("parseTriageResponse parses a valid JSON object", () => {
  const result = parseTriageResponse('{"title":"Chart bug","description":"Bars are blank"}');
  assert(result.ok);
  if (result.ok) {
    assertEquals(result.title, "Chart bug");
    assertEquals(result.description, "Bars are blank");
  }
});

Deno.test("parseTriageResponse strips markdown fences", () => {
  const result = parseTriageResponse(
    '```json\n{"title":"Chart bug","description":"Bars are blank"}\n```'
  );
  assert(result.ok);
});

Deno.test("parseTriageResponse reports unparseable when there is no JSON object", () => {
  const result = parseTriageResponse("sorry, I don't understand");
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "unparseable");
});

Deno.test("parseTriageResponse surfaces an explicit model error", () => {
  const result = parseTriageResponse('{"error":"unparseable"}');
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "unparseable");
});

Deno.test("parseTriageResponse reports schema_mismatch when fields are missing", () => {
  const result = parseTriageResponse('{"title":"Chart bug"}');
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "schema_mismatch");
});

Deno.test("isTriageRateLimited allows up to the max attempts then blocks", () => {
  const userId = `rate-limit-test-${crypto.randomUUID()}`;
  const now = Date.now();
  assertEquals(isTriageRateLimited(userId, now), false);
  assertEquals(isTriageRateLimited(userId, now), false);
  assertEquals(isTriageRateLimited(userId, now), false);
  assertEquals(isTriageRateLimited(userId, now), true);
});

Deno.test("isTriageRateLimited resets once the window has passed", () => {
  const userId = `rate-limit-window-${crypto.randomUUID()}`;
  const start = Date.now();
  assertEquals(isTriageRateLimited(userId, start), false);
  assertEquals(isTriageRateLimited(userId, start), false);
  assertEquals(isTriageRateLimited(userId, start), false);
  assertEquals(isTriageRateLimited(userId, start + 11 * 60 * 1000), false);
});
