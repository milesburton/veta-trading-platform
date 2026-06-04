// fallow-ignore-file unused-file
import { CORS_HEADERS } from "@veta/http";
import type { GatewayContext } from "../context.ts";
import {
  type LoadgenAnnouncement,
  type LoadgenEvent,
  notifyDiscordLoadgen,
} from "../discord-notifier.ts";

const ALLOWED_EVENTS = new Set<LoadgenEvent>(["start", "stop"]);

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export function parseAnnouncement(body: unknown): LoadgenAnnouncement | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.event !== "string" || !ALLOWED_EVENTS.has(b.event as LoadgenEvent)) return null;
  if (typeof b.runner !== "string" || b.runner.length === 0) return null;
  const note = typeof b.note === "string" ? b.note : undefined;
  return { event: b.event as LoadgenEvent, runner: b.runner, note };
}

// fallow-ignore-next-line unused-export
export async function handleLoadgenAnnounceRoute(
  req: Request,
  path: string,
  _context: GatewayContext
): Promise<Response | null> {
  if (path !== "/loadgen-announce") return null;
  if (req.method !== "POST") return null;

  const expected = Deno.env.get("LOADGEN_ANNOUNCE_TOKEN") ?? "";
  if (expected.length === 0) {
    // Endpoint disabled when no token is configured. Returning 404 (rather
    // than 503) keeps the surface invisible to anyone scanning for it.
    return null;
  }
  const provided = req.headers.get("x-loadgen-token") ?? "";
  if (provided !== expected) return jsonResponse({ error: "forbidden" }, 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }

  const announcement = parseAnnouncement(body);
  if (!announcement) {
    return jsonResponse(
      { error: "expected { event: 'start'|'stop', runner: string, note?: string }" },
      400
    );
  }

  const sent = await notifyDiscordLoadgen(announcement);
  if (!sent) {
    return jsonResponse({ ok: false, error: "received but Discord webhook not configured" }, 202);
  }
  return jsonResponse({ ok: true }, 200);
}
