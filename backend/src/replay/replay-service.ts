import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { replayPool } from "../lib/db.ts";

const PORT = Number(Deno.env.get("REPLAY_PORT")) || 5_031;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function getConfig(): Promise<Response> {
  const client = await replayPool.connect();
  try {
    const { rows } = await client.queryObject<{
      recording_enabled: boolean;
      updated_by: string | null;
      updated_at: string;
    }>("SELECT recording_enabled, updated_by, updated_at FROM replay.config WHERE id = 1");
    if (rows.length === 0) return json({ recordingEnabled: false });
    const row = rows[0];
    return json({
      recordingEnabled: row.recording_enabled,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    });
  } finally {
    client.release();
  }
}

async function updateConfig(req: Request): Promise<Response> {
  const body = await req.json() as { enabled: boolean; userId?: string };
  const client = await replayPool.connect();
  try {
    await client.queryArray(
      "UPDATE replay.config SET recording_enabled = $1, updated_by = $2, updated_at = now() WHERE id = 1",
      [body.enabled, body.userId ?? null],
    );
    return json({ recordingEnabled: body.enabled });
  } finally {
    client.release();
  }
}

async function createSession(req: Request): Promise<Response> {
  const body = await req.json() as {
    id: string;
    userId: string;
    userName?: string;
    userRole?: string;
    metadata?: Record<string, unknown>;
  };
  const client = await replayPool.connect();
  try {
    await client.queryArray(
      `INSERT INTO replay.sessions (id, user_id, user_name, user_role, started_at, metadata)
       VALUES ($1, $2, $3, $4, now(), $5)
       ON CONFLICT (id) DO NOTHING`,
      [body.id, body.userId, body.userName ?? null, body.userRole ?? null, JSON.stringify(body.metadata ?? {})],
    );
    return json({ id: body.id }, 201);
  } finally {
    client.release();
  }
}

async function endSession(sessionId: string): Promise<Response> {
  const client = await replayPool.connect();
  try {
    await client.queryArray(
      `UPDATE replay.sessions
       SET ended_at = now(), duration_ms = EXTRACT(EPOCH FROM (now() - started_at)) * 1000
       WHERE id = $1`,
      [sessionId],
    );
    return json({ ok: true });
  } finally {
    client.release();
  }
}

async function uploadChunk(sessionId: string, req: Request): Promise<Response> {
  const body = await req.json() as { seq: number; events: unknown[] };
  const client = await replayPool.connect();
  try {
    await client.queryArray(
      `INSERT INTO replay.chunks (session_id, seq, events)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id, seq) DO UPDATE SET events = $3`,
      [sessionId, body.seq, JSON.stringify(body.events)],
    );
    return json({ ok: true }, 201);
  } finally {
    client.release();
  }
}

async function listSessions(url: URL): Promise<Response> {
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? "50"));
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const client = await replayPool.connect();
  try {
    const { rows } = await client.queryObject<{
      id: string;
      user_id: string;
      user_name: string | null;
      user_role: string | null;
      started_at: string;
      ended_at: string | null;
      duration_ms: number | null;
      metadata: Record<string, unknown>;
    }>(
      "SELECT id, user_id, user_name, user_role, started_at, ended_at, duration_ms, metadata FROM replay.sessions ORDER BY started_at DESC LIMIT $1 OFFSET $2",
      [limit, offset],
    );
    const countResult = await client.queryObject<{ count: string }>(
      "SELECT COUNT(*) as count FROM replay.sessions",
    );
    return json({
      sessions: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        userRole: r.user_role,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        durationMs: r.duration_ms,
        metadata: r.metadata,
      })),
      total: Number(countResult.rows[0]?.count ?? 0),
    });
  } finally {
    client.release();
  }
}

async function getSessionEvents(sessionId: string): Promise<Response> {
  const client = await replayPool.connect();
  try {
    const { rows } = await client.queryObject<{ events: unknown[] }>(
      "SELECT events FROM replay.chunks WHERE session_id = $1 ORDER BY seq",
      [sessionId],
    );
    const allEvents = rows.flatMap((r) => r.events);
    return json({ events: allEvents });
  } finally {
    client.release();
  }
}

async function deleteSession(sessionId: string): Promise<Response> {
  const client = await replayPool.connect();
  try {
    await client.queryArray("DELETE FROM replay.sessions WHERE id = $1", [sessionId]);
    return json({ ok: true });
  } finally {
    client.release();
  }
}

Deno.serve({ port: PORT }, async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  try {
    if (path === "/health" && req.method === "GET") {
      return json({ service: "replay", version: VERSION, status: "ok" });
    }

    if (path === "/config") {
      if (req.method === "GET") return await getConfig();
      if (req.method === "PUT") return await updateConfig(req);
    }

    if (path === "/sessions" && req.method === "GET") {
      return await listSessions(url);
    }
    if (path === "/sessions" && req.method === "POST") {
      return await createSession(req);
    }

    const sessionMatch = path.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const sessionId = sessionMatch[1];
      if (req.method === "DELETE") return await deleteSession(sessionId);
    }

    const endMatch = path.match(/^\/sessions\/([^/]+)\/end$/);
    if (endMatch && req.method === "PUT") {
      return await endSession(endMatch[1]);
    }

    const chunksMatch = path.match(/^\/sessions\/([^/]+)\/chunks$/);
    if (chunksMatch && req.method === "POST") {
      return await uploadChunk(chunksMatch[1], req);
    }

    const eventsMatch = path.match(/^\/sessions\/([^/]+)\/events$/);
    if (eventsMatch && req.method === "GET") {
      return await getSessionEvents(eventsMatch[1]);
    }

    return new Response("Not Found", { status: 404, headers: CORS });
  } catch (err) {
    console.error("[replay-service] Error:", err);
    return json({ error: String(err) }, 500);
  }
});

console.log(`[replay-service] Listening on port ${PORT}`);
