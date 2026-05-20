// fallow-ignore-file unused-file
import { lookupPanel, renderGrafanaPanel } from "./grafana-renderer.ts";

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
  attachment?: { filename: string; bytes: Uint8Array };
}

async function postToDiscord(opts: DiscordPostOptions): Promise<boolean> {
  try {
    if (opts.attachment) {
      const form = new FormData();
      form.append(
        "payload_json",
        JSON.stringify({
          username: opts.username,
          content: opts.content,
          attachments: [{ id: 0, filename: opts.attachment.filename }],
        }),
      );
      form.append(
        "files[0]",
        new Blob([opts.attachment.bytes as BlobPart], { type: "image/png" }),
        opts.attachment.filename,
      );
      const res = await fetch(opts.url, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok;
    }
    const res = await fetch(opts.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: opts.username, content: opts.content }),
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

  const panel = lookupPanel(alert.source);
  const bytes = panel
    ? await renderGrafanaPanel({ panelUid: panel.panelUid, panelId: panel.panelId })
    : null;

  const attachment = bytes
    ? { filename: buildAttachmentFilename(alert.source), bytes }
    : undefined;

  await postToDiscord({
    url,
    username: "VETA Alerts",
    content: lines.join("\n"),
    attachment,
  });
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

const FILENAME_SAFE_RE = /[^A-Za-z0-9._-]+/g;
const FILENAME_MAX = 60;
function buildAttachmentFilename(source: string | undefined): string {
  const cleaned = (source ?? "panel").replace(FILENAME_SAFE_RE, "-").slice(0, FILENAME_MAX);
  const safe = cleaned.replace(/^[.-]+/, "") || "panel";
  return `alert-${safe}-${Date.now()}.png`;
}

const DISCORD_MAX_MESSAGE_CHARS = 1900;

export async function sendDailySummary(content: string): Promise<boolean> {
  const url = getAlertsWebhookUrl();
  if (!url) return false;
  const body = content.length > DISCORD_MAX_MESSAGE_CHARS
    ? content.slice(0, DISCORD_MAX_MESSAGE_CHARS - 1) + "…"
    : content;
  return await postToDiscord({
    url,
    username: "VETA Daily",
    content: body,
  });
}
