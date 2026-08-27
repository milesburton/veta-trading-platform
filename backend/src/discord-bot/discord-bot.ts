import "@veta/bootstrap";
import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { logger } from "@veta/logger";
import type { ILlmProvider } from "@veta/types/llm-advisory";
import {
  isBugReportValid,
  notifyDiscordBug,
  type UserTicketReport,
} from "../gateway/discord-notifier.ts";
import { createTicketForUserReport } from "../gateway/ticketing.ts";
import { createAnthropicProvider } from "../llm-advisory/providers/anthropic.ts";
import { createOllamaProvider } from "../llm-advisory/providers/ollama.ts";

const PORT = Number(Deno.env.get("DISCORD_BOT_PORT")) || 5_034;
const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const WELCOME_CHANNEL_ID = Deno.env.get("DISCORD_WELCOME_CHANNEL_ID") ?? "";
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const TRIAGE_ENABLED = Deno.env.get("DISCORD_TRIAGE_ENABLED") !== "false";
const LLM_PROVIDER = Deno.env.get("LLM_PROVIDER") ?? "mock";
const LLM_MODEL_ID = Deno.env.get("LLM_MODEL_ID") ?? "mock-v1";
const LLM_OLLAMA_BASE_URL = Deno.env.get("LLM_OLLAMA_BASE_URL") ?? "http://localhost:11434";

const DISCORD_API = "https://discord.com/api/v10";
const GATEWAY_INTENT_GUILD_MEMBERS = 1 << 1;
const GATEWAY_INTENT_GUILD_MESSAGES = 1 << 9;
const GATEWAY_INTENT_MESSAGE_CONTENT = 1 << 15;
const RECONNECT_DELAY_MS = 5_000;

export function buildWelcomeMessage(memberMention: string): string {
  return `👋 Welcome ${memberMention} to the VETA community! Type \`Raise. <what's wrong>\` in this channel, or use the in-app "Raise a ticket" button, if you hit a bug.`;
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

interface MessageCreatePayload {
  id?: string;
  channel_id?: string;
  guild_id?: string;
  content?: string;
  author?: { id?: string; username?: string; bot?: boolean };
}

interface ReadyPayload {
  user?: { id?: string };
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 41_250;

export function extractHeartbeatIntervalMs(payload: GatewayEnvelope): number {
  return (payload.d as HelloData | undefined)?.heartbeat_interval ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
}

export type GatewayAction =
  | { kind: "hello"; heartbeatIntervalMs: number }
  | { kind: "ready"; data: unknown }
  | { kind: "guildMemberAdd"; data: unknown }
  | { kind: "messageCreate"; data: unknown }
  | { kind: "ignore" };

/** Pure dispatch: decide what a gateway envelope means, without performing any I/O. */
export function classifyGatewayEnvelope(payload: GatewayEnvelope): GatewayAction {
  if (payload.op === 10) {
    return { kind: "hello", heartbeatIntervalMs: extractHeartbeatIntervalMs(payload) };
  }
  if (payload.op === 0 && payload.t === "READY") return { kind: "ready", data: payload.d };
  if (payload.op === 0 && payload.t === "GUILD_MEMBER_ADD") {
    return { kind: "guildMemberAdd", data: payload.d };
  }
  if (payload.op === 0 && payload.t === "MESSAGE_CREATE") {
    return { kind: "messageCreate", data: payload.d };
  }
  return { kind: "ignore" };
}

export interface WelcomePostDecision {
  shouldPost: boolean;
  channelId?: string;
  message?: string;
}

/** Pure decision: given a GUILD_MEMBER_ADD payload and config, should we post — and what? */
export function decideWelcomePost(data: unknown, welcomeChannelId: string): WelcomePostDecision {
  const member = (data ?? {}) as GuildMemberAddPayload;
  if (!welcomeChannelId || !member.user) return { shouldPost: false };
  const mention = `<@${member.user.id}>`;
  return { shouldPost: true, channelId: welcomeChannelId, message: buildWelcomeMessage(mention) };
}

const RAISE_PREFIX = /^raise\.\s*/i;

export interface TriageRequest {
  authorId: string;
  authorName: string;
  channelId: string;
  messageId: string;
  guildId: string | null;
  freeText: string;
}

export interface TriageDecision {
  shouldTriage: boolean;
  request?: TriageRequest;
}

function mentionPattern(botUserId: string): RegExp {
  return new RegExp(`<@!?${botUserId}>`, "g");
}

function extractTriageText(content: string, botUserId: string | null): string | null {
  const prefixMatch = RAISE_PREFIX.exec(content);
  if (prefixMatch) return content.slice(prefixMatch[0].length).trim();
  if (!botUserId) return null;
  const pattern = mentionPattern(botUserId);
  if (!pattern.test(content)) return null;
  return content.replace(pattern, " ").trim();
}

/** Pure decision: given a MESSAGE_CREATE payload, should we triage it, and with what? */
export function decideTriageRequest(
  data: unknown,
  botUserId: string | null = null
): TriageDecision {
  const msg = (data ?? {}) as MessageCreatePayload;
  if (msg.author?.bot) return { shouldTriage: false };
  if (!msg.author?.id || !msg.channel_id || !msg.id) return { shouldTriage: false };
  if (typeof msg.content !== "string") return { shouldTriage: false };
  const freeText = extractTriageText(msg.content, botUserId);
  if (freeText === null || freeText.length === 0) return { shouldTriage: false };
  return {
    shouldTriage: true,
    request: {
      authorId: msg.author.id,
      authorName: msg.author.username ?? msg.author.id,
      channelId: msg.channel_id,
      messageId: msg.id,
      guildId: msg.guild_id ?? null,
      freeText,
    },
  };
}

const TRIAGE_SYSTEM_PROMPT = `You convert a short free-text support message into a bug-ticket title and description. Respond with a single JSON object and nothing else, no prose, no markdown fences.

Schema:
{
  "title": "<a short, specific summary, under 120 characters>",
  "description": "<the issue, expanded slightly for clarity if the input is terse, under 2000 characters>"
}

If the message is too vague or short to describe an actual issue (e.g. just "bug" or "help"), respond with {"error": "unparseable"} and nothing else.
Never invent details not implied by the input. Never include explanations outside the JSON.`;

const TRIAGE_INPUT_MAX = 1_000;

function stripControlChars(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    out += code < 0x20 || code === 0x7f ? " " : raw[i];
  }
  return out;
}

export function buildTriagePrompt(freeText: string): string {
  return `Message: ${stripControlChars(freeText).slice(0, TRIAGE_INPUT_MAX)}`;
}

function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function extractFirstJsonObject(raw: string): string | null {
  const stripped = stripFences(raw);
  const start = stripped.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return stripped.slice(start, i + 1);
    }
  }
  return null;
}

export type TriageParseResult =
  | { ok: true; title: string; description: string }
  | { ok: false; reason: string };

export function parseTriageResponse(raw: string): TriageParseResult {
  const candidate = extractFirstJsonObject(raw);
  if (!candidate) return { ok: false, reason: "unparseable" };
  let obj: unknown;
  try {
    obj = JSON.parse(candidate);
  } catch {
    return { ok: false, reason: "unparseable" };
  }
  if (obj && typeof obj === "object" && "error" in obj) {
    return { ok: false, reason: String((obj as { error: unknown }).error) };
  }
  if (
    !obj ||
    typeof obj !== "object" ||
    typeof (obj as { title?: unknown }).title !== "string" ||
    typeof (obj as { description?: unknown }).description !== "string"
  ) {
    return { ok: false, reason: "schema_mismatch" };
  }
  const { title, description } = obj as { title: string; description: string };
  return { ok: true, title, description };
}

const TRIAGE_RATE_LIMIT_MAX = 3;
const TRIAGE_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const triageAttemptsByUser = new Map<string, number[]>();

export function isTriageRateLimited(userId: string, now: number = Date.now()): boolean {
  const cutoff = now - TRIAGE_RATE_LIMIT_WINDOW_MS;
  const attempts = (triageAttemptsByUser.get(userId) ?? []).filter((t) => t > cutoff);
  attempts.push(now);
  triageAttemptsByUser.set(userId, attempts);
  return attempts.length > TRIAGE_RATE_LIMIT_MAX;
}

function buildTriageProvider(): ILlmProvider {
  if (LLM_PROVIDER === "ollama") return createOllamaProvider(LLM_MODEL_ID, LLM_OLLAMA_BASE_URL);
  if (LLM_PROVIDER === "anthropic") return createAnthropicProvider(LLM_MODEL_ID);
  return {
    providerId: "mock",
    modelId: LLM_MODEL_ID,
    isAvailable: () => Promise.resolve(false),
    generate: () => Promise.reject(new Error("mock provider does not generate")),
  };
}

const triageProvider = buildTriageProvider();

function buildDiscordMessageLink(
  guildId: string | null,
  channelId: string,
  messageId: string
): string {
  const guildSegment = guildId ?? "@me";
  return `https://discord.com/channels/${guildSegment}/${channelId}/${messageId}`;
}

async function handleMessageCreate(data: unknown): Promise<void> {
  if (!TRIAGE_ENABLED) return;
  const decision = decideTriageRequest(data, botUserId);
  if (!decision.shouldTriage || !decision.request) return;
  const req = decision.request;

  if (isTriageRateLimited(req.authorId)) {
    await postChannelMessage(
      req.channelId,
      `⏳ <@${req.authorId}> you've raised a few tickets recently, please wait a bit before raising another.`
    );
    return;
  }

  const available = await triageProvider.isAvailable();
  if (!available) {
    await postChannelMessage(
      req.channelId,
      `⚠️ <@${req.authorId}> ticket triage is unavailable right now, try the in-app "Raise a ticket" button instead.`
    );
    return;
  }

  let responseText: string;
  try {
    const response = await triageProvider.generate(
      buildTriagePrompt(req.freeText),
      TRIAGE_SYSTEM_PROMPT
    );
    responseText = response.text;
  } catch (err) {
    logger.error("triage generate failed", { err });
    await postChannelMessage(
      req.channelId,
      `⚠️ <@${req.authorId}> couldn't process that ticket, try again shortly.`
    );
    return;
  }

  const parsed = parseTriageResponse(responseText);
  if (!parsed.ok) {
    await postChannelMessage(
      req.channelId,
      `🤔 <@${req.authorId}> couldn't turn that into a ticket, try adding a bit more detail about what's wrong.`
    );
    return;
  }

  const messageLink = buildDiscordMessageLink(req.guildId, req.channelId, req.messageId);
  const report: UserTicketReport = {
    kind: "bug",
    title: parsed.title,
    description: `Raised via Discord by ${req.authorName}.\n\n${parsed.description}\n\nSource: ${messageLink}`,
  };

  if (!isBugReportValid(report)) {
    await postChannelMessage(
      req.channelId,
      `🤔 <@${req.authorId}> couldn't turn that into a ticket, try adding a bit more detail about what's wrong.`
    );
    return;
  }

  const [, githubResult] = await Promise.allSettled([
    notifyDiscordBug(report, req.authorId, req.authorName),
    createTicketForUserReport(report, req.authorId, req.authorName),
  ]);

  if (githubResult.status === "fulfilled" && githubResult.value.created && githubResult.value.url) {
    await postChannelMessage(
      req.channelId,
      `✅ <@${req.authorId}> filed as ${githubResult.value.url}`
    );
  } else {
    await postChannelMessage(
      req.channelId,
      `⚠️ <@${req.authorId}> couldn't file that ticket automatically, try the in-app "Raise a ticket" button instead.`
    );
  }
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
      logger.warn("failed to post channel message", { status: res.status });
    }
    return res.ok;
  } catch (err) {
    logger.error("error posting channel message", { err });
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
let botUserId: string | null = null;

function identify(ws: WebSocket): void {
  ws.send(
    JSON.stringify({
      op: 2,
      d: {
        token: BOT_TOKEN,
        intents:
          GATEWAY_INTENT_GUILD_MEMBERS |
          GATEWAY_INTENT_GUILD_MESSAGES |
          GATEWAY_INTENT_MESSAGE_CONTENT,
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

function handleReady(data: unknown): void {
  connectedNow = true;
  const ready = (data ?? {}) as ReadyPayload;
  if (ready.user?.id) botUserId = ready.user.id;
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
    if (action.kind === "ready") return handleReady(action.data);
    if (action.kind === "guildMemberAdd") return handleGuildMemberAdd(action.data);
    if (action.kind === "messageCreate") {
      handleMessageCreate(action.data).catch((err) =>
        logger.error("message triage failed", { err })
      );
      return;
    }
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
