import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

const CHANNEL = "123456789012345678";
const BOT_ID = "999888777666555444";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly url: string;
  readonly sent: string[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
}

const h = vi.hoisted(() => ({
  provider: {
    providerId: "fake",
    modelId: "fake-model",
    isAvailable: vi.fn(),
    generate: vi.fn(),
  },
  notify: vi.fn(),
  ticket: vi.fn(),
  valid: { value: true },
  posts: [] as Array<{ channel: string; content: string }>,
  discordStatus: { value: 200 },
}));

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("../llm-advisory/providers/ollama.ts", () => ({
  createOllamaProvider: () => h.provider,
}));
vi.mock("../gateway/ticketing.ts", () => ({ createTicketForUserReport: h.ticket }));
vi.mock("../gateway/discord-notifier.ts", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  notifyDiscordBug: h.notify,
  isBugReportValid: () => h.valid.value,
}));

type BotModule = typeof import("../discord-bot/discord-bot.ts");

async function load(env: Record<string, string> = {}): Promise<BotModule> {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
  vi.stubEnv("DISCORD_WELCOME_CHANNEL_ID", CHANNEL);
  vi.stubEnv("LLM_PROVIDER", "ollama");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  FakeWebSocket.instances.length = 0;
  return import("../discord-bot/discord-bot.ts");
}

function dispatch(ws: FakeWebSocket, t: string, d: unknown, s = 1) {
  ws.onmessage?.({ data: JSON.stringify({ op: 0, t, d, s }) });
}

async function flush() {
  await vi.advanceTimersByTimeAsync(5_000);
}

function connectBot(bot: BotModule, opts?: { reconnect?: boolean }) {
  bot.connect("wss://gateway.discord.test", opts ?? { reconnect: false });
  const socket = FakeWebSocket.instances.at(-1);
  assert(socket);
  assertEquals(socket.url, "wss://gateway.discord.test/?v=10&encoding=json");
  return socket;
}

function raise(text: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "m-1",
    channel_id: CHANNEL,
    guild_id: "555",
    content: text,
    author: { id: "42", username: "alice" },
    ...overrides,
  };
}

function say(channel = CHANNEL) {
  return h.posts.filter((p) => p.channel === channel).map((p) => p.content);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  h.posts.length = 0;
  h.discordStatus.value = 200;
  h.valid.value = true;
  h.provider.isAvailable.mockReset().mockResolvedValue(true);
  h.provider.generate
    .mockReset()
    .mockResolvedValue({ text: '{"title":"Blotter crashes","description":"It crashes on load"}' });
  h.notify.mockReset().mockResolvedValue(undefined);
  h.ticket.mockReset().mockResolvedValue({ created: true, url: "https://github.com/o/r/issues/1" });
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    const match = String(input).match(/channels\/(\d+)\/messages$/);
    if (match) {
      h.posts.push({ channel: match[1], content: JSON.parse(String(init?.body)).content });
      return Promise.resolve(new Response("{}", { status: h.discordStatus.value }));
    }
    return Promise.resolve(new Response("{}", { status: 404 }));
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("[discord-dispatch] records the bot identity on READY and ignores unrelated events", async () => {
  const bot = await load();
  const ws = connectBot(bot);
  ws.onopen?.();
  ws.onerror?.();
  dispatch(ws, "READY", { user: { id: BOT_ID } });
  dispatch(ws, "PRESENCE_UPDATE", {});
  ws.onmessage?.({ data: "not json" });

  dispatch(ws, "MESSAGE_CREATE", raise(`<@${BOT_ID}> the blotter is broken`));
  await flush();
  assertEquals(say().at(-1)?.includes("filed as"), true);
});

test("[discord-dispatch] welcomes new members and posts the MOTD", async () => {
  const bot = await load();
  const ws = connectBot(bot);
  dispatch(ws, "GUILD_MEMBER_ADD", { user: { id: "77" } });
  await flush();
  const posts = say();
  assertEquals(posts.length, 2);
  assert(posts[0].includes("<@77>"));
  assert(posts[1].includes("Raise."));
});

test("[discord-dispatch] skips the MOTD when disabled and ignores member events without a user", async () => {
  const bot = await load({ DISCORD_MOTD_ENABLED: "false" });
  const ws = connectBot(bot);
  dispatch(ws, "GUILD_MEMBER_ADD", { user: { id: "77" } });
  dispatch(ws, "GUILD_MEMBER_ADD", {});
  await flush();
  assertEquals(say().length, 1);
});

test("[discord-dispatch] files a ticket for a raised bug and replies with the link", async () => {
  const bot = await load();
  const ws = connectBot(bot);
  dispatch(ws, "MESSAGE_CREATE", raise("Raise. blotter crashes on load"));
  await flush();

  assertEquals(h.notify.mock.calls.length, 1);
  const report = h.ticket.mock.calls[0][0];
  assertEquals(report.kind, "bug");
  assertEquals(report.title, "Blotter crashes");
  assert(report.description.includes("https://discord.com/channels/555/"));
  assertEquals(say(), ["✅ <@42> filed as https://github.com/o/r/issues/1"]);
});

test("[discord-dispatch] links direct messages with the @me guild segment", async () => {
  const bot = await load();
  const ws = connectBot(bot);
  dispatch(ws, "MESSAGE_CREATE", raise("Raise. broken", { guild_id: undefined }));
  await flush();
  assert(h.ticket.mock.calls[0][0].description.includes("channels/@me/"));
});

test("[discord-dispatch] ignores messages that are not triage requests", async () => {
  const bot = await load();
  const ws = connectBot(bot);
  dispatch(ws, "MESSAGE_CREATE", raise("just chatting"));
  dispatch(ws, "MESSAGE_CREATE", raise("Raise. ", {}));
  dispatch(ws, "MESSAGE_CREATE", raise("Raise. hi", { author: { id: "1", bot: true } }));
  await flush();
  assertEquals(h.posts.length, 0);
  assertEquals(h.provider.generate.mock.calls.length, 0);
});

test("[discord-dispatch] does nothing when triage is disabled", async () => {
  const bot = await load({ DISCORD_TRIAGE_ENABLED: "false" });
  const ws = connectBot(bot);
  dispatch(ws, "MESSAGE_CREATE", raise("Raise. broken"));
  await flush();
  assertEquals(h.posts.length, 0);
});

test("[discord-dispatch] rate limits a user after three tickets", async () => {
  const bot = await load();
  const ws = connectBot(bot);
  for (let i = 0; i < 4; i++) {
    dispatch(ws, "MESSAGE_CREATE", raise(`Raise. problem ${i}`, { id: `m-${i}` }));
    await flush();
  }
  assertEquals(h.ticket.mock.calls.length, 3);
  assert(say().at(-1)?.includes("wait a bit"));
});

test("[discord-dispatch] reports when triage is unavailable", async () => {
  const bot = await load();
  h.provider.isAvailable.mockResolvedValue(false);
  const ws = connectBot(bot);
  dispatch(ws, "MESSAGE_CREATE", raise("Raise. broken"));
  await flush();
  assert(say().at(-1)?.includes("triage is unavailable"));
});

test("[discord-dispatch] reports a generation failure or timeout", async () => {
  const bot = await load();
  const ws = connectBot(bot);
  h.provider.generate.mockRejectedValueOnce(new Error("model crashed"));
  dispatch(ws, "MESSAGE_CREATE", raise("Raise. one", { author: { id: "50", username: "bob" } }));
  await flush();
  assert(say().at(-1)?.includes("couldn't process that ticket in time"));

  h.provider.generate.mockReturnValueOnce(new Promise(() => {}));
  dispatch(ws, "MESSAGE_CREATE", raise("Raise. two", { author: { id: "51", username: "cy" } }));
  await vi.advanceTimersByTimeAsync(31_000);
  assertEquals(say().filter((m) => m.includes("couldn't process that ticket in time")).length, 2);
});

test("[discord-dispatch] asks for more detail when the model output is unusable", async () => {
  const bot = await load();
  const ws = connectBot(bot);
  h.provider.generate.mockResolvedValueOnce({ text: "no json here" });
  dispatch(ws, "MESSAGE_CREATE", raise("Raise. one", { author: { id: "60", username: "d" } }));
  await flush();
  assert(say().at(-1)?.includes("couldn't turn that into a ticket"));

  h.valid.value = false;
  dispatch(ws, "MESSAGE_CREATE", raise("Raise. two", { author: { id: "61", username: "e" } }));
  await flush();
  assertEquals(say().filter((m) => m.includes("couldn't turn that into a ticket")).length, 2);
  assertEquals(h.ticket.mock.calls.length, 0);
});

test("[discord-dispatch] falls back to the in-app button when filing fails", async () => {
  const bot = await load();
  const ws = connectBot(bot);
  h.ticket.mockResolvedValueOnce({ created: false });
  dispatch(ws, "MESSAGE_CREATE", raise("Raise. one", { author: { id: "70", username: "f" } }));
  await flush();
  assert(say().at(-1)?.includes("couldn't file that ticket automatically"));

  h.ticket.mockRejectedValueOnce(new Error("github down"));
  dispatch(ws, "MESSAGE_CREATE", raise("Raise. two", { author: { id: "71", username: "g" } }));
  await flush();
  assertEquals(
    say().filter((m) => m.includes("couldn't file that ticket automatically")).length,
    2
  );
});

test("[discord-dispatch] retries transient post failures then gives up quietly", async () => {
  const bot = await load();
  const ws = connectBot(bot);
  h.discordStatus.value = 503;
  dispatch(ws, "GUILD_MEMBER_ADD", { user: { id: "88" } });
  await vi.advanceTimersByTimeAsync(10_000);
  assertEquals(h.posts.filter((p) => p.content.includes("<@88>")).length, 3);
});

test("[discord-dispatch] refuses to post to a malformed channel id", async () => {
  const bot = await load({ DISCORD_WELCOME_CHANNEL_ID: "not-a-snowflake" });
  const ws = connectBot(bot);
  dispatch(ws, "GUILD_MEMBER_ADD", { user: { id: "88" } });
  dispatch(ws, "MESSAGE_CREATE", raise("Raise. broken", { channel_id: "bad" }));
  await flush();
  assertEquals(h.posts.length, 0);
});

test("[discord-dispatch] survives a network error while posting", async () => {
  const bot = await load();
  vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
  const ws = connectBot(bot);
  dispatch(ws, "GUILD_MEMBER_ADD", { user: { id: "88" } });
  await vi.advanceTimersByTimeAsync(10_000);
  assertEquals(h.posts.length, 0);
});

test("[discord-dispatch] reconnects after the gateway closes unless told otherwise", async () => {
  const bot = await load();
  const ws = connectBot(bot, { reconnect: true });
  const before = FakeWebSocket.instances.length;
  ws.onclose?.();
  await vi.advanceTimersByTimeAsync(5_000);
  assertEquals(FakeWebSocket.instances.length, before + 1);

  const quiet = connectBot(bot, { reconnect: false });
  const count = FakeWebSocket.instances.length;
  quiet.onclose?.();
  await vi.advanceTimersByTimeAsync(5_000);
  assertEquals(FakeWebSocket.instances.length, count);
});

test("[discord-dispatch] sends heartbeats once the gateway says hello", async () => {
  const bot = await load();
  const ws = connectBot(bot);
  ws.onmessage?.({ data: JSON.stringify({ op: 10, d: { heartbeat_interval: 2_000 }, s: 4 }) });
  await vi.advanceTimersByTimeAsync(2_100);
  const frames = ws.sent.map((f) => JSON.parse(f));
  assertEquals(frames[0].op, 2);
  assertEquals(frames.at(-1), { op: 1, d: 4 });
  ws.onclose?.();
});
