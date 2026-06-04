// fallow-ignore-file unused-file
import { logger } from "@veta/logger";

export interface TicketAlertPayload {
  severity?: string;
  source?: string;
  message?: string;
  detail?: string;
  ts?: number;
}

interface CreateIssueResult {
  created: boolean;
  issueNumber: number | null;
  url: string | null;
  reason: string | null;
}

interface GithubIssueSearchHit {
  number: number;
  html_url: string;
  state: string;
  title: string;
  created_at: string;
}

const GH_API = "https://api.github.com";
const DEDUPE_WINDOW_MS = 60 * 60 * 1000;

function readTokenEnv(): string | null {
  const token = Deno.env.get("GITHUB_TICKETING_TOKEN") ?? "";
  if (token.length < 20) return null;
  if (token.includes("REPLACE_ME")) return null;
  return token;
}

function readRepoEnv(): string | null {
  const repo = Deno.env.get("GITHUB_TICKETING_REPO") ?? "";
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) return null;
  return repo;
}

function buildTitle(alert: TicketAlertPayload): string {
  const source = alert.source ?? "platform";
  const message = (alert.message ?? "alert").replace(/[\r\n]+/g, " ").slice(0, 100);
  return `[${alert.severity ?? "CRITICAL"}] ${source}: ${message}`;
}

function buildBody(alert: TicketAlertPayload, userId: string, runId: string | null): string {
  const ts = alert.ts ?? Date.now();
  const ttl = new Date(ts).toISOString();
  const lines = [
    `**Severity:** ${alert.severity ?? "CRITICAL"}`,
    `**Source:** \`${alert.source ?? "unknown"}\``,
    `**Triggered at:** ${ttl}`,
    `**Triggered by:** ${userId}`,
    "",
    `**Message:** ${alert.message ?? "(no message)"}`,
  ];
  if (alert.detail) {
    lines.push("", "**Detail:**", "```", alert.detail.slice(0, 2000), "```");
  }
  lines.push("");
  lines.push("---");
  lines.push("_Auto-created from a Discord platform alert._");
  if (runId) lines.push(`_Correlation: ${runId}_`);
  return lines.join("\n");
}

async function findOpenDuplicate(
  repo: string,
  token: string,
  title: string
): Promise<GithubIssueSearchHit | null> {
  const q = `repo:${repo} is:issue is:open in:title "${title.replace(/"/g, "")}"`;
  const url = `${GH_API}/search/issues?q=${encodeURIComponent(q)}&per_page=5`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "veta-gateway-ticketing",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: GithubIssueSearchHit[] };
    const items = body.items ?? [];
    const now = Date.now();
    for (const item of items) {
      const createdAt = new Date(item.created_at).getTime();
      if (now - createdAt < DEDUPE_WINDOW_MS) return item;
    }
    return null;
  } catch {
    return null;
  }
}

async function commentOnIssue(
  repo: string,
  token: string,
  issueNumber: number,
  body: string
): Promise<boolean> {
  try {
    const res = await fetch(`${GH_API}/repos/${repo}/issues/${issueNumber}/comments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "veta-gateway-ticketing",
      },
      body: JSON.stringify({ body }),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function createIssue(
  repo: string,
  token: string,
  title: string,
  body: string,
  labels: string[]
): Promise<{ ok: boolean; number: number | null; url: string | null }> {
  try {
    const res = await fetch(`${GH_API}/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "veta-gateway-ticketing",
      },
      body: JSON.stringify({ title, body, labels }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { ok: false, number: null, url: null };
    const json = (await res.json()) as { number: number; html_url: string };
    return { ok: true, number: json.number, url: json.html_url };
  } catch {
    return { ok: false, number: null, url: null };
  }
}

export async function createTicketForAlert(
  alert: TicketAlertPayload,
  userId: string,
  runId: string | null = null
): Promise<CreateIssueResult> {
  if (alert.severity !== "CRITICAL") {
    return { created: false, issueNumber: null, url: null, reason: "non-critical" };
  }
  const token = readTokenEnv();
  if (!token) {
    return { created: false, issueNumber: null, url: null, reason: "no-token" };
  }
  const repo = readRepoEnv();
  if (!repo) {
    return { created: false, issueNumber: null, url: null, reason: "no-repo" };
  }

  const title = buildTitle(alert);
  const body = buildBody(alert, userId, runId);
  const labels = [
    "prod-issue",
    "auto-created",
    `severity:${(alert.severity ?? "critical").toLowerCase()}`,
  ];
  if (alert.source) labels.push(`source:${alert.source.toLowerCase().slice(0, 40)}`);

  const dup = await findOpenDuplicate(repo, token, title);
  if (dup) {
    const noted = await commentOnIssue(repo, token, dup.number, `Another occurrence:\n\n${body}`);
    if (noted) {
      logger.info("[ticketing] commented on existing", { issue: dup.number, url: dup.html_url });
    }
    return {
      created: false,
      issueNumber: dup.number,
      url: dup.html_url,
      reason: "deduped-onto-existing",
    };
  }

  const result = await createIssue(repo, token, title, body, labels);
  if (!result.ok) {
    return { created: false, issueNumber: null, url: null, reason: "github-api-failed" };
  }
  logger.info("[ticketing] issue created", { issue: result.number, url: result.url });
  return { created: true, issueNumber: result.number, url: result.url, reason: null };
}

export const _internalForTests = {
  buildTitle,
  buildBody,
  readTokenEnv,
  readRepoEnv,
};
