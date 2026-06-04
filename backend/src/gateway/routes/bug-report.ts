// fallow-ignore-file unused-file
import { CORS_HEADERS } from "@veta/http";
import { type GatewayContext, isResponse } from "../context.ts";
import { type BugReport, isBugReportValid, notifyDiscordBug } from "../discord-notifier.ts";
import { platformStats } from "../platform-stats.ts";

const ALLOWED_CATEGORIES = new Set(["ui", "data", "auth", "performance", "other"]);

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function parseReport(body: unknown): BugReport | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || typeof b.description !== "string") return null;
  const category =
    typeof b.category === "string" && ALLOWED_CATEGORIES.has(b.category)
      ? (b.category as BugReport["category"])
      : undefined;
  const url = typeof b.url === "string" ? b.url : undefined;
  return { title: b.title, description: b.description, category, url };
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
  const reportWithUA: BugReport = { ...report, userAgent };
  platformStats.recordBug({
    title: report.title,
    userId: authResult.user.id,
    ts: Date.now(),
  });
  const sent = await notifyDiscordBug(
    reportWithUA,
    authResult.user.id,
    authResult.user.name ?? authResult.user.id
  );

  if (!sent) {
    return jsonResponse(
      { ok: false, error: "bug report received but Discord webhook not configured" },
      202
    );
  }
  return jsonResponse({ ok: true }, 200);
}
