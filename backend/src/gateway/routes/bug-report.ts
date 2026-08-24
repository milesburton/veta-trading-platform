// fallow-ignore-file unused-file
import { CORS_HEADERS } from "@veta/http";
import { type GatewayContext, isResponse } from "../context.ts";
import {
  isBugReportValid,
  notifyDiscordBug,
  type UserTicketKind,
  type UserTicketReport,
} from "../discord-notifier.ts";
import { platformStats } from "../platform-stats.ts";
import { createTicketForUserReport } from "../ticketing.ts";

const ALLOWED_CATEGORIES = new Set(["ui", "data", "auth", "performance", "other"]);
const ALLOWED_KINDS = new Set(["bug", "feature", "comment"]);
const MAX_ATTACHMENTS = 5;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function parseAttachments(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const publicBaseUrl = Deno.env.get("MINIO_PUBLIC_URL");
  if (!publicBaseUrl) return undefined;

  let base: URL;
  try {
    base = new URL(publicBaseUrl);
  } catch {
    return undefined;
  }

  const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;

  const urls = value
    .filter((v): v is string => typeof v === "string")
    .map((v) => {
      try {
        return new URL(v);
      } catch {
        return null;
      }
    })
    .filter((u): u is URL => u !== null && u.origin === base.origin && u.pathname.startsWith(basePath))
    .map((u) => u.toString())
    .slice(0, MAX_ATTACHMENTS);

  return urls.length > 0 ? urls : undefined;
}

function parseReport(body: unknown): UserTicketReport | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || typeof b.description !== "string") return null;
  const kind =
    typeof b.kind === "string" && ALLOWED_KINDS.has(b.kind) ? (b.kind as UserTicketKind) : "bug";
  const category =
    typeof b.category === "string" && ALLOWED_CATEGORIES.has(b.category)
      ? (b.category as UserTicketReport["category"])
      : undefined;
  const url = typeof b.url === "string" ? b.url : undefined;
  const attachments = parseAttachments(b.attachments);
  return { kind, title: b.title, description: b.description, category, url, attachments };
}

function deliveryError(reason: string | null): string {
  if (reason === "github-api-failed") {
    return "ticket received but Discord delivery and GitHub issue creation failed";
  }
  return "ticket received but no Discord webhook or GitHub ticketing token is configured";
}

export async function handleBugReportRoute(
  req: Request,
  path: string,
  context: GatewayContext
): Promise<Response | null> {
  if (path !== "/bug-report") return null;
  if (req.method !== "POST") return null;

  const authResult = await context.requireAuth(req);
  if (isResponse(authResult)) return authResult;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }

  const report = parseReport(body);
  if (!report || !isBugReportValid(report)) {
    return jsonResponse(
      { error: "title (>= 3 chars) and description (>= 10 chars) required" },
      400
    );
  }

  const userAgent = req.headers.get("user-agent") ?? "unknown";
  const reportWithUA: UserTicketReport = { ...report, userAgent };
  platformStats.recordBug({
    title: report.title,
    userId: authResult.user.id,
    ts: Date.now(),
  });
  const userName = authResult.user.name ?? authResult.user.id;
  const [discordResult, githubResult] = await Promise.allSettled([
    notifyDiscordBug(reportWithUA, authResult.user.id, userName),
    createTicketForUserReport(reportWithUA, authResult.user.id, userName),
  ]);

  const discordDelivered = discordResult.status === "fulfilled" && discordResult.value;
  const ticket =
    githubResult.status === "fulfilled"
      ? {
          created: githubResult.value.created,
          issueNumber: githubResult.value.issueNumber,
          url: githubResult.value.url,
          reason: githubResult.value.reason,
        }
      : {
          created: false,
          issueNumber: null,
          url: null,
          reason: "github-api-failed",
        };

  if (!discordDelivered && !ticket.created) {
    return jsonResponse(
      {
        ok: false,
        discordDelivered,
        ticket,
        error: deliveryError(ticket.reason),
      },
      202
    );
  }
  return jsonResponse({ ok: true, discordDelivered, ticket }, 200);
}
