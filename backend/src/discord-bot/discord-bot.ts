import "@veta/bootstrap";
import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { logger } from "@veta/logger";

const PORT = Number(Deno.env.get("DISCORD_BOT_PORT")) || 5_034;
const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const WELCOME_CHANNEL_ID = Deno.env.get("DISCORD_WELCOME_CHANNEL_ID") ?? "";
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const DISCORD_API = "https://discord.com/api/v10";
const GATEWAY_INTENT_GUILD_MEMBERS = 1 << 1;
const RECONNECT_DELAY_MS = 5_000;

export function buildWelcomeMessage(memberMention: string): string {
  return `👋 Welcome ${memberMention} to the VETA community! Check out **#support** if you hit a bug or want to raise a ticket.`;
}

interface GatewayEnvelope {
  op: number;
  d?: unknown;
  t?: string;
  s?: number;
}

interface HelloData {
  heartbeat_interval?: number;
}

interface GuildMemberAddPayload {
  user?: { id: string };
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 41_250;

export function extractHeartbeatIntervalMs(payload: GatewayEnvelope): number {
  return (payload.d as HelloData | undefined)?.heartbeat_interval ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
}

export type GatewayAction =
  | { kind: "hello"; heartbeatIntervalMs: number }
  | { kind: "ready" }
  | { kind: "guildMemberAdd"; data: unknown }
  | { kind: "ignore" };

/** Pure dispatch: decide what a gateway envelope means, without performing any I/O. */
export function classifyGatewayEnvelope(payload: GatewayEnvelope): GatewayAction {
  if (payload.op === 10) {
    return { kind: "hello", heartbeatIntervalMs: extractHeartbeatIntervalMs(payload) };
  }
  if (payload.op === 0 && payload.t === "READY") return { kind: "ready" };
  if (payload.op === 0 && payload.t === "GUILD_MEMBER_ADD") {
    return { kind: "guildMemberAdd", data: payload.d };
  }
  return { kind: "ignore" };
}

export interface WelcomePostDecision {
  shouldPost: boolean;
  channelId?: string;
  message?: string;
}

/** Pure decision: given a GUILD_MEMBER_ADD payload and config, should we post — and what? */
export function decideWelcomePost(
  data: unknown,
  welcomeChannelId: string
): WelcomePostDecision {
  const member = (data ?? {}) as GuildMemberAddPayload;
  if (!welcomeChannelId || !member.user) return { shouldPost: false };
  const mention = `<@${member.user.id}>`;
  return { shouldPost: true, channelId: welcomeChannelId, message: buildWelcomeMessage(mention) };
}

async function postChannelMessage(channelId: string, content: string): Promise<boolean> {
  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn("failed to post welcome message", { status: res.status });
    }
    return res.ok;
  } catch (err) {
    logger.error("error posting welcome message", { err });
    return false;
  }
}

async function fetchGatewayUrl(): Promise<string> {
  const res = await fetch(`${DISCORD_API}/gateway/bot`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`gateway/bot lookup failed: ${res.status}`);
  const body = (await res.json()) as { url: string };
  return body.url;
}

let connectedNow = false;
let lastEventAt: number | null = null;

function identify(ws: WebSocket): void {
  ws.send(
    JSON.stringify({
      op: 2,
      d: {
        token: BOT_TOKEN,
        intents: GATEWAY_INTENT_GUILD_MEMBERS,
        properties: { os: "linux", browser: "veta-discord-bot", device: "veta-discord-bot" },
      },
    })
  );
}

function startHeartbeat(
  ws: WebSocket,
  intervalMs: number,
  getSequence: () => number | null
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    ws.send(JSON.stringify({ op: 1, d: getSequence() }));
  }, intervalMs);
}

function handleReady(): void {
  connectedNow = true;
  logger.info("gateway ready");
}

function handleGuildMemberAdd(data: unknown): void {
  lastEventAt = Date.now();
  const decision = decideWelcomePost(data, WELCOME_CHANNEL_ID);
  if (decision.shouldPost && decision.channelId && decision.message) {
    postChannelMessage(decision.channelId, decision.message);
  }
}

export function connect(gatewayUrl: string, opts: { reconnect?: boolean } = {}): WebSocket {
  const reconnect = opts.reconnect ?? true;
  const ws = new WebSocket(`${gatewayUrl}/?v=10&encoding=json`);
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let sequence: number | null = null;

  ws.onopen = () => {
    logger.info("gateway websocket open");
  };

  ws.onmessage = (event) => {
    let payload: GatewayEnvelope;
    try {
      payload = JSON.parse(event.data as string) as GatewayEnvelope;
    } catch {
      logger.warn("malformed gateway frame — ignoring");
      return;
    }
    if (typeof payload.s === "number") sequence = payload.s;

    const action = classifyGatewayEnvelope(payload);
    if (action.kind === "hello") {
      heartbeatTimer = startHeartbeat(ws, action.heartbeatIntervalMs, () => sequence);
      identify(ws);
      return;
    }
    if (action.kind === "ready") return handleReady();
    if (action.kind === "guildMemberAdd") return handleGuildMemberAdd(action.data);
  };

  ws.onclose = () => {
    connectedNow = false;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (!reconnect) return;
    logger.warn("gateway websocket closed, reconnecting", { delayMs: RECONNECT_DELAY_MS });
    setTimeout(() => {
      connect(gatewayUrl);
    }, RECONNECT_DELAY_MS);
  };

  ws.onerror = () => {
    logger.error("gateway websocket error");
  };

  return ws;
}

async function start(): Promise<void> {
  if (!BOT_TOKEN) {
    logger.warn("DISCORD_BOT_TOKEN not set; welcome bot disabled");
    return;
  }
  if (!WELCOME_CHANNEL_ID) {
    logger.warn("DISCORD_WELCOME_CHANNEL_ID not set; welcome bot disabled");
    return;
  }
  try {
    const gatewayUrl = await fetchGatewayUrl();
    connect(gatewayUrl);
  } catch (err) {
    logger.error("failed to start gateway connection, retrying", { err });
    setTimeout(start, RECONNECT_DELAY_MS);
  }
}

if (import.meta.main) {
  start();

  Deno.serve({ port: PORT }, (req: Request): Response => {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          service: "discord-bot",
          version: VERSION,
          status: "ok",
          configured: Boolean(BOT_TOKEN && WELCOME_CHANNEL_ID),
          connected: connectedNow,
          lastEventAt,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response("not found", { status: 404 });
  });
}
