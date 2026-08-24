// fallow-ignore-file unused-file
import { logger } from "@veta/logger";
import { recordGauge } from "@veta/telemetry";

export interface TicketAlertPayload {
  severity?: string;
  source?: string;
  message?: string;
  detail?: string;
  ts?: number;
}

export interface UserTicketPayload {
  kind?: "bug" | "feature" | "comment";
  title: string;
  description: string;
  category?: "ui" | "data" | "auth" | "performance" | "other";
  url?: string;
  userAgent?: string;
  ts?: number;
  attachments?: string[];
}

interface CreateIssueResult {
  created: boolean;
  issueNumber: number | null;
  url: string | null;
  reason: string | null;
}

export type TicketingHealthState =
  | "unknown"
  | "healthy"
  | "missing"
  | "misconfigured"
  | "unauthorised"
  | "forbidden"
  | "rate-limited"
  | "unreachable";

export interface TicketingHealth {
  state: TicketingHealthState;
  healthy: boolean;
  checkedAt: number | null;
  statusCode: number | null;
  repo: string | null;
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
const DEFAULT_TICKETING_REPO = "milesburton/veta-trading-platform";

function readTokenEnv(): string | null {
  const secretFile =
    Deno.env.get("GITHUB_TICKETING_TOKEN_FILE") ?? "/run/secrets/github_ticketing_token";
  let token = "";
  try {
    token = Deno.readTextFileSync(secretFile).trim();
  } catch {
    token = (Deno.env.get("GITHUB_TICKETING_TOKEN") ?? "").trim();
  }
  if (token.length < 20) return null;
  if (token.includes("REPLACE_ME")) return null;
  return token;
}

let ticketingHealth: TicketingHealth = {
  state: "unknown",
  healthy: false,
  checkedAt: null,
  statusCode: null,
  repo: readRepoEnv(),
};

function classifyGithubStatus(status: number, rateRemaining: string | null): TicketingHealthState {
  if (status === 401) return "unauthorised";
  if (status === 403 && rateRemaining === "0") return "rate-limited";
  if (status === 403 || status === 404) return "forbidden";
  if (status === 429) return "rate-limited";
  return status >= 200 && status < 300 ? "healthy" : "unreachable";
}

async function publishTicketingHealth(next: TicketingHealth): Promise<TicketingHealth> {
  ticketingHealth = next;
  await recordGauge("github_ticketing_healthy", next.healthy ? 1 : 0, {
    description: "Whether the GitHub user-ticket integration passed its latest probe",
    attributes: { state: next.state },
  });
  await recordGauge("github_ticketing_last_check_timestamp_seconds", (next.checkedAt ?? 0) / 1000);
  return next;
}

export function getTicketingHealth(): TicketingHealth {
  return { ...ticketingHealth };
}

export async function probeTicketingHealth(): Promise<TicketingHealth> {
  const checkedAt = Date.now();
  const token = readTokenEnv();
  const repo = readRepoEnv();
  if (!token) {
    return await publishTicketingHealth({
      state: "missing",
      healthy: false,
      checkedAt,
      statusCode: null,
      repo,
    });
  }
  if (!repo) {
    return await publishTicketingHealth({
      state: "misconfigured",
      healthy: false,
      checkedAt,
      statusCode: null,
      repo: null,
    });
  }
  try {
    const res = await fetch(`${GH_API}/repos/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "veta-gateway-ticketing-health",
      },
      signal: AbortSignal.timeout(8_000),
    });
    const state = classifyGithubStatus(res.status, res.headers.get("x-ratelimit-remaining"));
    const next = { state, healthy: state === "healthy", checkedAt, statusCode: res.status, repo };
    if (!next.healthy) {
      logger.warn("[ticketing] GitHub health probe failed", {
        state,
        status: res.status,
        requestId: res.headers.get("x-github-request-id") ?? "unknown",
      });
    }
    return await publishTicketingHealth(next);
  } catch (err) {
    logger.warn("[ticketing] GitHub health probe unreachable", {
      err: err instanceof Error ? err.message : String(err),
    });
    return await publishTicketingHealth({
      state: "unreachable",
      healthy: false,
      checkedAt,
      statusCode: null,
      repo,
    });
  }
}

export function startTicketingHealthMonitor(
  intervalMs = 5 * 60_000
): ReturnType<typeof setInterval> {
  probeTicketingHealth().catch(() => {});
  return setInterval(() => probeTicketingHealth().catch(() => {}), intervalMs);
}

function readRepoEnv(): string | null {
  const repo = Deno.env.get("GITHUB_TICKETING_REPO") ?? DEFAULT_TICKETING_REPO;
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

function cleanInline(value: string, max: number): string {
  return value.replace(/[\r\n]+/g, " ").slice(0, max);
}

function normaliseTicketKind(kind: UserTicketPayload["kind"]): Required<UserTicketPayload>["kind"] {
  if (kind === "feature" || kind === "comment") return kind;
  return "bug";
}

function buildUserTicketTitle(ticket: UserTicketPayload): string {
  const kind = normaliseTicketKind(ticket.kind);
  return `[${kind}] ${cleanInline(ticket.title.trim(), 100)}`;
}

function buildUserTicketBody(ticket: UserTicketPayload, userId: string, userName: string): string {
  const kind = normaliseTicketKind(ticket.kind);
  const ts = ticket.ts ?? Date.now();
  const lines = [
    `**Type:** ${kind}`,
    `**Category:** ${ticket.category ?? "other"}`,
    `**Submitted at:** ${new Date(ts).toISOString()}`,
    `**Submitted by:** ${cleanInline(userName || userId, 80)} (${cleanInline(userId, 80)})`,
  ];
  if (ticket.url) lines.push(`**Page:** ${cleanInline(ticket.url, 500)}`);
  if (ticket.userAgent) lines.push(`**User agent:** \`${cleanInline(ticket.userAgent, 200)}\``);
  lines.push("", "**Description:**", "```", ticket.description.trim().slice(0, 4000), "```");
  if (ticket.attachments?.length) {
    lines.push("", "**Attachments:**");
    for (const url of ticket.attachments) {
      const clean = cleanInline(url, 500);
      const safeUrl = clean.replace(/[()\s]/g, (c) => encodeURIComponent(c));
      if (/\.(png|jpe?g|gif|webp)$/i.test(clean)) {
        lines.push(`![attachment](${safeUrl})`);
      } else {
        lines.push(`- [${cleanInline(clean.split("/").pop() ?? clean, 100)}](${safeUrl})`);
      }
    }
  }
  lines.push("", "---", "_Created from an in-app VETA user ticket._");
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
    if (!res.ok) {
      const state = classifyGithubStatus(res.status, res.headers.get("x-ratelimit-remaining"));
      await publishTicketingHealth({
        state,
        healthy: false,
        checkedAt: Date.now(),
        statusCode: res.status,
        repo,
      });
      logger.warn("[ticketing] GitHub issue creation failed", {
        state,
        status: res.status,
        requestId: res.headers.get("x-github-request-id") ?? "unknown",
      });
      return { ok: false, number: null, url: null };
    }
    const json = (await res.json()) as { number: number; html_url: string };
    await publishTicketingHealth({
      state: "healthy",
      healthy: true,
      checkedAt: Date.now(),
      statusCode: res.status,
      repo,
    });
    return { ok: true, number: json.number, url: json.html_url };
  } catch (err) {
    await publishTicketingHealth({
      state: "unreachable",
      healthy: false,
      checkedAt: Date.now(),
      statusCode: null,
      repo,
    });
    logger.warn("[ticketing] GitHub issue creation unreachable", {
      err: err instanceof Error ? err.message : String(err),
    });
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

export async function createTicketForUserReport(
  ticket: UserTicketPayload,
  userId: string,
  userName: string
): Promise<CreateIssueResult> {
  const token = readTokenEnv();
  if (!token) {
    return { created: false, issueNumber: null, url: null, reason: "no-token" };
  }
  const repo = readRepoEnv();
  if (!repo) {
    return { created: false, issueNumber: null, url: null, reason: "no-repo" };
  }

  const kind = normaliseTicketKind(ticket.kind);
  const title = buildUserTicketTitle(ticket);
  const body = buildUserTicketBody(ticket, userId, userName);
  const labels = ["user-ticket", "auto-created", `type:${kind}`];
  if (ticket.category) labels.push(`category:${ticket.category}`);

  const result = await createIssue(repo, token, title, body, labels);
  if (!result.ok) {
    return { created: false, issueNumber: null, url: null, reason: "github-api-failed" };
  }
  logger.info("[ticketing] user ticket issue created", { issue: result.number, url: result.url });
  return { created: true, issueNumber: result.number, url: result.url, reason: null };
}

export const _internalForTests = {
  buildTitle,
  buildBody,
  buildUserTicketTitle,
  buildUserTicketBody,
  readTokenEnv,
  readRepoEnv,
};
