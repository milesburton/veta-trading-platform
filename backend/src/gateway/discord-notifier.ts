// fallow-ignore-file unused-file
const SEVERITY_EMOJI: Record<string, string> = {
  CRITICAL: "🚨",
  WARNING: "⚠️",
  INFO: "ℹ️",
};

interface AlertPayload {
  severity?: string;
  source?: string;
  message?: string;
  detail?: string;
  ts?: number;
}

function readWebhookEnv(name: string): string | null {
  const url = Deno.env.get(name) ?? "";
  if (!url.startsWith("https://discord.com/api/webhooks/")) return null;
  if (url.includes("REPLACE_ME")) return null;
  return url;
}

function getAlertsWebhookUrl(): string | null {
  return readWebhookEnv("DISCORD_WEBHOOK_URL");
}

function getBugWebhookUrl(): string | null {
  const dedicated = readWebhookEnv("DISCORD_BUG_WEBHOOK_URL");
  if (dedicated) return dedicated;
  return getAlertsWebhookUrl();
}

interface DiscordPostOptions {
  url: string;
  username: string;
  content: string;
}

async function postToDiscord({ url, username, content }: DiscordPostOptions): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, content }),
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function notifyDiscord(alert: AlertPayload, userId: string): Promise<void> {
  const url = getAlertsWebhookUrl();
  if (!url) return;
  if (alert.severity !== "CRITICAL" && alert.severity !== "WARNING") return;

  const emoji = SEVERITY_EMOJI[alert.severity ?? ""] ?? "•";
  const lines = [
    `${emoji} **${alert.severity}** ${alert.source ? `\\[${alert.source}]` : ""} ${alert.message ?? ""}`,
  ];
  if (alert.detail) lines.push(`> ${alert.detail}`);
  lines.push(`_user: ${userId}_`);

  await postToDiscord({ url, username: "VETA Alerts", content: lines.join("\n") });
}

export interface BugReport {
  title: string;
  description: string;
  category?: "ui" | "data" | "auth" | "performance" | "other";
  url?: string;
  userAgent?: string;
}

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2_000;
const URL_MAX = 500;

function sanitise(line: string, max: number): string {
  return line.replace(/[\r\n]+/g, " ").slice(0, max);
}

export function isBugReportValid(report: BugReport): boolean {
  if (!report.title || report.title.trim().length < 3) return false;
  if (!report.description || report.description.trim().length < 10) return false;
  return true;
}

export async function notifyDiscordBug(
  report: BugReport,
  userId: string,
  userName: string,
): Promise<boolean> {
  if (!isBugReportValid(report)) return false;
  const url = getBugWebhookUrl();
  if (!url) return false;

  const lines = [
    `🐛 **${sanitise(report.title.trim(), TITLE_MAX)}**`,
    `_by: ${sanitise(userName || userId, 80)} (${sanitise(userId, 80)})_`,
  ];
  if (report.category) lines.push(`Category: \`${report.category}\``);
  if (report.url) lines.push(`Page: ${sanitise(report.url, URL_MAX)}`);
  if (report.userAgent) lines.push(`UA: \`${sanitise(report.userAgent, 200)}\``);
  lines.push("");
  lines.push(sanitiseMultiline(report.description.trim(), DESCRIPTION_MAX));

  return await postToDiscord({
    url,
    username: "VETA Bug Reports",
    content: lines.join("\n"),
  });
}

function sanitiseMultiline(s: string, max: number): string {
  return s.replace(/\r/g, "").slice(0, max);
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 60 * 1000;

export interface HeartbeatSnapshot {
  version: string;
  environment: string;
  uptimeMs: number;
  services: Record<string, boolean>;
  ts: number;
}

function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const DISCORD_MAX_MESSAGE_CHARS = 1900;

export function buildHeartbeatMessage(snap: HeartbeatSnapshot): string {
  const sha = snap.version.length > 7 ? snap.version.slice(0, 7) : snap.version;
  const entries = Object.entries(snap.services).sort(([a], [b]) => a.localeCompare(b));
  const up = entries.filter(([, ok]) => ok).length;
  const total = entries.length;
  const allUp = up === total;
  const headerEmoji = allUp ? "✅" : up >= total - 2 ? "⚠️" : "🚨";
  const header = `${headerEmoji} **VETA** \`${sha}\` (${snap.environment}) — ${up}/${total} services up · uptime ${formatUptime(snap.uptimeMs)}`;
  const lines: string[] = entries.map(([name, ok]) => `${ok ? "🟢" : "🔴"} \`${name}\``);
  let body = `${header}\n${lines.join(" ")}`;
  if (body.length > DISCORD_MAX_MESSAGE_CHARS) {
    body = body.slice(0, DISCORD_MAX_MESSAGE_CHARS - 1) + "…";
  }
  return body;
}

export async function sendHeartbeat(snap: HeartbeatSnapshot): Promise<boolean> {
  const url = getAlertsWebhookUrl();
  if (!url) return false;
  return await postToDiscord({
    url,
    username: "VETA Heartbeat",
    content: buildHeartbeatMessage(snap),
  });
}

export interface HeartbeatOptions {
  version: string;
  environment: string;
  startedAt: number;
  getServices: () => Record<string, boolean> | null;
  intervalMs?: number;
  sender?: (snap: HeartbeatSnapshot) => Promise<boolean>;
}

export function startHeartbeat(opts: HeartbeatOptions): { stop: () => void } {
  const envInterval = Number(Deno.env.get("DISCORD_HEARTBEAT_INTERVAL_MS"));
  const intervalMs = opts.intervalMs
    ?? (Number.isFinite(envInterval) && envInterval > 0 ? envInterval : DEFAULT_HEARTBEAT_INTERVAL_MS);
  const send = opts.sender ?? sendHeartbeat;
  const fire = () => {
    const services = opts.getServices();
    if (!services) return;
    send({
      version: opts.version,
      environment: opts.environment,
      uptimeMs: Date.now() - opts.startedAt,
      services,
      ts: Date.now(),
    }).catch(() => {});
  };
  fire();
  const handle = setInterval(fire, intervalMs);
  return { stop: () => clearInterval(handle) };
}
