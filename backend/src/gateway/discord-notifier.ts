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

function getWebhookUrl(): string | null {
  const url = Deno.env.get("DISCORD_WEBHOOK_URL") ?? "";
  if (!url.startsWith("https://discord.com/api/webhooks/")) return null;
  if (url.includes("REPLACE_ME")) return null;
  return url;
}

export async function notifyDiscord(alert: AlertPayload, userId: string): Promise<void> {
  const url = getWebhookUrl();
  if (!url) return;
  if (alert.severity !== "CRITICAL" && alert.severity !== "WARNING") return;

  const emoji = SEVERITY_EMOJI[alert.severity ?? ""] ?? "•";
  const lines = [
    `${emoji} **${alert.severity}** ${alert.source ? `\\[${alert.source}]` : ""} ${alert.message ?? ""}`,
  ];
  if (alert.detail) lines.push(`> ${alert.detail}`);
  lines.push(`_user: ${userId}_`);

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "VETA Alerts", content: lines.join("\n") }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Discord outage must not affect trading
  }
}
