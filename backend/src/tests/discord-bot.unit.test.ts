import { serveFetch, upgradeWebSocket } from "#veta/http";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { closeServer, listeningPort } from "#veta/test-server";
import {
  buildMotd,
  hasRecentMotd,
  buildTriagePrompt,
  buildWelcomeMessage,
  clampHeartbeatIntervalMs,
  classifyGatewayEnvelope,
  connect,
  createTriageHealthProbe,
  decideTriageRequest,
  decideWelcomePost,
  extractHeartbeatIntervalMs,
  isTriageRateLimited,
  parseTriageResponse,
  retryTransient,
  TimeoutError,
  withTimeout,
} from "../discord-bot/discord-bot.ts";

test("buildWelcomeMessage mentions the joining member", () => {
  const msg = buildWelcomeMessage("<@42>");
  assert(msg.includes("<@42>"));
});

test("buildWelcomeMessage points to the Raise. command", () => {
  const msg = buildWelcomeMessage("<@1>");
  assert(msg.includes("Raise."));
});

test("buildMotd mentions the Raise. command and @mention trigger", () => {
  const msg = buildMotd("https://docs.example/", "https://platform.example/");
  assert(msg.includes("Raise."));
  assert(msg.includes("@mention"));
});

test("buildMotd includes the given docs and platform URLs", () => {
  const msg = buildMotd("https://docs.example/", "https://platform.example/");
  assert(/https:\/\/docs\.example\//.test(msg));
  assert(/https:\/\/platform\.example\//.test(msg));
});

test("buildWelcomeMessage is a single-line greeting", () => {
  const msg = buildWelcomeMessage("<@1>");
  assertEquals(msg.includes("\n"), false);
});

test("extractHeartbeatIntervalMs reads heartbeat_interval from the payload", () => {
  assertEquals(extractHeartbeatIntervalMs({ op: 10, d: { heartbeat_interval: 30_000 } }), 30_000);
});

test("extractHeartbeatIntervalMs falls back to the Discord default when missing", () => {
  assertEquals(extractHeartbeatIntervalMs({ op: 10 }), 41_250);
});

test("extractHeartbeatIntervalMs falls back when d is not an object with the field", () => {
  assertEquals(extractHeartbeatIntervalMs({ op: 10, d: null }), 41_250);
});

test("clampHeartbeatIntervalMs passes through an in-range value unchanged", () => {
  assertEquals(clampHeartbeatIntervalMs(30_000), 30_000);
});

test("clampHeartbeatIntervalMs floors a too-small value to the 1s minimum", () => {
  assertEquals(clampHeartbeatIntervalMs(0), 1_000);
  assertEquals(clampHeartbeatIntervalMs(-1), 1_000);
});

test("clampHeartbeatIntervalMs falls back to Discord's default interval for a non-finite value", () => {
  assertEquals(clampHeartbeatIntervalMs(Number.NaN), 41_250);
  assertEquals(clampHeartbeatIntervalMs(Number.POSITIVE_INFINITY), 41_250);
});

test("clampHeartbeatIntervalMs caps a too-large value to the 60s maximum", () => {
  assertEquals(clampHeartbeatIntervalMs(1_000_000_000), 60_000);
});

test("classifyGatewayEnvelope: op 10 is a hello with the derived heartbeat interval", () => {
  const action = classifyGatewayEnvelope({ op: 10, d: { heartbeat_interval: 5_000 } });
  assertEquals(action, { kind: "hello", heartbeatIntervalMs: 5_000 });
});

test("classifyGatewayEnvelope: op 0 t=READY carries the payload", () => {
  const data = { user: { id: "1234567890" } };
  const action = classifyGatewayEnvelope({ op: 0, t: "READY", d: data });
  assertEquals(action, { kind: "ready", data });
});

test("classifyGatewayEnvelope: op 0 t=GUILD_MEMBER_ADD carries the payload", () => {
  const data = { user: { id: "123" } };
  const action = classifyGatewayEnvelope({ op: 0, t: "GUILD_MEMBER_ADD", d: data });
  assertEquals(action, { kind: "guildMemberAdd", data });
});

test("classifyGatewayEnvelope: op 0 t=MESSAGE_CREATE carries the payload", () => {
  const data = { id: "1", channel_id: "2", content: "hello" };
  const action = classifyGatewayEnvelope({ op: 0, t: "MESSAGE_CREATE", d: data });
  assertEquals(action, { kind: "messageCreate", data });
});

test("classifyGatewayEnvelope: unrecognised op/t pairs are ignored", () => {
  assertEquals(classifyGatewayEnvelope({ op: 11 }), { kind: "ignore" });
  assertEquals(classifyGatewayEnvelope({ op: 0, t: "TYPING_START" }), { kind: "ignore" });
  assertEquals(classifyGatewayEnvelope({ op: 0 }), { kind: "ignore" });
});

test("decideWelcomePost posts when a channel is configured and the member has an id", () => {
  const decision = decideWelcomePost({ user: { id: "42" } }, "chan-1");
  assertEquals(decision.shouldPost, true);
  assertEquals(decision.channelId, "chan-1");
  assert(decision.message?.includes("<@42>"));
});

test("decideWelcomePost does not post when no welcome channel is configured", () => {
  const decision = decideWelcomePost({ user: { id: "42" } }, "");
  assertEquals(decision.shouldPost, false);
  assertEquals(decision.channelId, undefined);
  assertEquals(decision.message, undefined);
});

test("decideWelcomePost does not post when the payload has no user", () => {
  const decision = decideWelcomePost({}, "chan-1");
  assertEquals(decision.shouldPost, false);
});

test("decideWelcomePost does not post when the payload is not an object with a user", () => {
  const decision = decideWelcomePost(null, "chan-1");
  assertEquals(decision.shouldPost, false);
});

async function withGatewayServer(onOpen: (socket: WebSocket) => void): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const controller = new AbortController();
  let serverSocket: WebSocket | undefined;
  const server = serveFetch({ port: 0, signal: controller.signal }, (req) => {
    const { socket, response } = upgradeWebSocket(req);
    serverSocket = socket;
    socket.onopen = () => onOpen(socket);
    return response;
  });
  const port = await listeningPort(server);
  return {
    url: `ws://127.0.0.1:${port}`,
    close: async () => {
      serverSocket?.close();
      controller.abort();
      await closeServer(server);
    },
  };
}

test("connect() identifies after receiving Hello (op 10)", async () => {
  const received: unknown[] = [];
  const { url, close } = await withGatewayServer((socket) => {
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

test("connect() sends a heartbeat carrying the last sequence number after Hello", async () => {
  const received: { op: number; d: unknown }[] = [];
  const { url, close } = await withGatewayServer((socket) => {
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

test("connect() ignores a malformed frame, then still identifies on a subsequent Hello", async () => {
  const received: unknown[] = [];
  const { url, close } = await withGatewayServer((socket) => {
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

test("decideTriageRequest ignores messages from bots", () => {
  const decision = decideTriageRequest({
    id: "1",
    channel_id: "c1",
    content: "Raise. something broke",
    author: { id: "9", username: "other-bot", bot: true },
  });
  assertEquals(decision.shouldTriage, false);
});

test("decideTriageRequest ignores messages without the Raise. prefix", () => {
  const decision = decideTriageRequest({
    id: "1",
    channel_id: "c1",
    content: "the candlestick chart is broken",
    author: { id: "9", username: "alice" },
  });
  assertEquals(decision.shouldTriage, false);
});

test("decideTriageRequest ignores an empty message after the prefix", () => {
  const decision = decideTriageRequest({
    id: "1",
    channel_id: "c1",
    content: "Raise.   ",
    author: { id: "9", username: "alice" },
  });
  assertEquals(decision.shouldTriage, false);
});

test("decideTriageRequest ignores a payload missing required fields", () => {
  assertEquals(decideTriageRequest({}).shouldTriage, false);
  assertEquals(decideTriageRequest(null).shouldTriage, false);
  assertEquals(
    decideTriageRequest({ id: "1", content: "Raise. x", author: { id: "9" } }).shouldTriage,
    false,
  );
});

test("decideTriageRequest extracts fields for a valid Raise. message", () => {
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

test("decideTriageRequest falls back to author id when username is missing", () => {
  const decision = decideTriageRequest({
    id: "1",
    channel_id: "c1",
    content: "Raise. broken thing",
    author: { id: "9" },
  });
  assertEquals(decision.request?.authorName, "9");
});

test("decideTriageRequest triages a message that @mentions the bot", () => {
  const decision = decideTriageRequest(
    {
      id: "msg-1",
      channel_id: "chan-1",
      content: "<@1234567890> the candlestick chart shows blank bars",
      author: { id: "9", username: "alice" },
    },
    "1234567890",
  );
  assertEquals(decision.shouldTriage, true);
  assertEquals(decision.request?.freeText, "the candlestick chart shows blank bars");
});

test("decideTriageRequest handles the nickname-mention form <@!id>", () => {
  const decision = decideTriageRequest(
    {
      id: "msg-1",
      channel_id: "chan-1",
      content: "<@!1234567890> the candlestick chart shows blank bars",
      author: { id: "9", username: "alice" },
    },
    "1234567890",
  );
  assertEquals(decision.shouldTriage, true);
  assertEquals(decision.request?.freeText, "the candlestick chart shows blank bars");
});

test("decideTriageRequest strips a mid-message mention of the bot", () => {
  const decision = decideTriageRequest(
    {
      id: "msg-1",
      channel_id: "chan-1",
      content: "hey <@1234567890> the candlestick chart shows blank bars",
      author: { id: "9", username: "alice" },
    },
    "1234567890",
  );
  assertEquals(decision.shouldTriage, true);
  assertEquals(decision.request?.freeText, "hey   the candlestick chart shows blank bars");
});

test("decideTriageRequest ignores a mention-only message with no other text", () => {
  const decision = decideTriageRequest(
    {
      id: "1",
      channel_id: "c1",
      content: "<@1234567890>   ",
      author: { id: "9", username: "alice" },
    },
    "1234567890",
  );
  assertEquals(decision.shouldTriage, false);
});

test("decideTriageRequest ignores a mention of a different user, not the bot", () => {
  const decision = decideTriageRequest(
    {
      id: "1",
      channel_id: "c1",
      content: "<@someone-else> can you look at this bug",
      author: { id: "9", username: "alice" },
    },
    "1234567890",
  );
  assertEquals(decision.shouldTriage, false);
});

test("decideTriageRequest ignores mentions when the bot's own id is unknown", () => {
  const decision = decideTriageRequest({
    id: "1",
    channel_id: "c1",
    content: "<@1234567890> the chart is broken",
    author: { id: "9", username: "alice" },
  });
  assertEquals(decision.shouldTriage, false);
});

test("decideTriageRequest still honours the Raise. prefix when a bot id is known", () => {
  const decision = decideTriageRequest(
    {
      id: "1",
      channel_id: "c1",
      content: "Raise. the chart is broken",
      author: { id: "9", username: "alice" },
    },
    "1234567890",
  );
  assertEquals(decision.shouldTriage, true);
  assertEquals(decision.request?.freeText, "the chart is broken");
});

test("buildTriagePrompt strips control characters and truncates long input", () => {
  const prompt = buildTriagePrompt("hello\n\rworld");
  assert(!prompt.includes("\n\r"), "control chars must be stripped");

  const long = buildTriagePrompt("x".repeat(2_000));
  assert(long.length < 1_100, "input must be truncated before reaching the model");
});

test("parseTriageResponse parses a valid JSON object", () => {
  const result = parseTriageResponse('{"title":"Chart bug","description":"Bars are blank"}');
  assert(result.ok);
  if (result.ok) {
    assertEquals(result.title, "Chart bug");
    assertEquals(result.description, "Bars are blank");
  }
});

test("parseTriageResponse ignores braces inside JSON strings", () => {
  const result = parseTriageResponse(
    'Here you go: {"title":"Closing } brace","description":"Shows {x} and \\"quoted }\\" text"} trailing',
  );
  assert(result.ok);
  if (result.ok) {
    assertEquals(result.title, "Closing } brace");
    assertEquals(result.description, 'Shows {x} and "quoted }" text');
  }
});

test("parseTriageResponse strips markdown fences", () => {
  const result = parseTriageResponse(
    '```json\n{"title":"Chart bug","description":"Bars are blank"}\n```',
  );
  assert(result.ok);
});

test("parseTriageResponse reports unparseable when there is no JSON object", () => {
  const result = parseTriageResponse("sorry, I don't understand");
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "unparseable");
});

test("parseTriageResponse surfaces an explicit model error", () => {
  const result = parseTriageResponse('{"error":"unparseable"}');
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "unparseable");
});

test("parseTriageResponse reports schema_mismatch when fields are missing", () => {
  const result = parseTriageResponse('{"title":"Chart bug"}');
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "schema_mismatch");
});

test("isTriageRateLimited allows up to the max attempts then blocks", () => {
  const userId = `rate-limit-test-${crypto.randomUUID()}`;
  const now = Date.now();
  assertEquals(isTriageRateLimited(userId, now), false);
  assertEquals(isTriageRateLimited(userId, now), false);
  assertEquals(isTriageRateLimited(userId, now), false);
  assertEquals(isTriageRateLimited(userId, now), true);
});

test("isTriageRateLimited resets once the window has passed", () => {
  const userId = `rate-limit-window-${crypto.randomUUID()}`;
  const start = Date.now();
  assertEquals(isTriageRateLimited(userId, start), false);
  assertEquals(isTriageRateLimited(userId, start), false);
  assertEquals(isTriageRateLimited(userId, start), false);
  assertEquals(isTriageRateLimited(userId, start + 11 * 60 * 1000), false);
});

test("withTimeout rejects with TimeoutError when work outlasts the limit", async () => {
  const never = new Promise<string>(() => {});
  let caught: unknown;
  try {
    await withTimeout(never, 10);
  } catch (err) {
    caught = err;
  }
  assert(caught instanceof TimeoutError);
});

test("withTimeout resolves with the work result when it finishes in time", async () => {
  assertEquals(await withTimeout(Promise.resolve("ok"), 1_000), "ok");
});

test("retryTransient retries thrown errors with exponential backoff", async () => {
  const delays: number[] = [];
  let calls = 0;
  const result = await retryTransient(
    () => {
      calls++;
      return calls < 3 ? Promise.reject(new Error("tls")) : Promise.resolve("sent");
    },
    () => false,
    { baseDelayMs: 100, sleep: (ms) => Promise.resolve(void delays.push(ms)) },
  );
  assertEquals(result, "sent");
  assertEquals(calls, 3);
  assertEquals(delays, [100, 200]);
});

test("retryTransient retries transient outcomes and returns the last one", async () => {
  let calls = 0;
  const result = await retryTransient(
    () => Promise.resolve(++calls),
    () => true,
    { maxAttempts: 3, sleep: () => Promise.resolve() },
  );
  assertEquals(result, 3);
});

test("retryTransient does not retry a non-transient outcome", async () => {
  let calls = 0;
  await retryTransient(
    () => Promise.resolve(++calls),
    () => false,
    { sleep: () => Promise.resolve() },
  );
  assertEquals(calls, 1);
});

test("retryTransient rethrows after exhausting attempts", async () => {
  let caught: unknown;
  try {
    await retryTransient(
      () => Promise.reject(new Error("boom")),
      () => false,
      {
        maxAttempts: 2,
        sleep: () => Promise.resolve(),
      },
    );
  } catch (err) {
    caught = err;
  }
  assertEquals((caught as Error).message, "boom");
});

test("triage health probe is unknown until the first refresh", () => {
  const probe = createTriageHealthProbe(
    { providerId: "ollama", isAvailable: () => Promise.resolve(true) },
    true,
  );
  assertEquals(probe.current(), { provider: "ollama", enabled: true, reachable: null });
});

test("triage health probe reports provider reachability after refresh", async () => {
  const probe = createTriageHealthProbe(
    { providerId: "ollama", isAvailable: () => Promise.resolve(true) },
    true,
  );
  await probe.refresh();
  assertEquals(probe.current(), { provider: "ollama", enabled: true, reachable: true });
});

test("triage health probe reports unreachable when the provider check throws", async () => {
  const probe = createTriageHealthProbe(
    { providerId: "ollama", isAvailable: () => Promise.reject(new Error("down")) },
    true,
  );
  await probe.refresh();
  assertEquals(probe.current().reachable, false);
});

test("triage health probe skips the provider check when triage is disabled", async () => {
  let calls = 0;
  const probe = createTriageHealthProbe(
    { providerId: "ollama", isAvailable: () => Promise.resolve(++calls > 0) },
    false,
  );
  await probe.refresh();
  assertEquals(probe.current().reachable, false);
  assertEquals(calls, 0);
});

test("[discord-bot] hasRecentMotd only counts the bot's own MOTD inside the window", async () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  const motd = buildMotd("https://docs", "https://app");
  const hour = 60 * 60 * 1000;
  const msg = (content: string, ago: number, author = "bot") => ({
    content,
    author: { id: author },
    timestamp: new Date(now - ago).toISOString(),
  });
  assertEquals(hasRecentMotd([msg(motd, hour)], "bot", now, 24 * hour), true);
  assertEquals(hasRecentMotd([msg(motd, 25 * hour)], "bot", now, 24 * hour), false);
  assertEquals(hasRecentMotd([msg(motd, hour, "someone")], "bot", now, 24 * hour), false);
  assertEquals(hasRecentMotd([msg("hello", hour)], "bot", now, 24 * hour), false);
  assertEquals(hasRecentMotd([], "bot", now, 24 * hour), false);
});
