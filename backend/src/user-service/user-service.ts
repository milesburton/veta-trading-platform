import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { usersPool } from "../lib/db.ts";
import { createProducer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("USER_SERVICE_PORT")) || 5_008;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const producer = await createProducer("user-service").catch((err) => {
  console.warn("[user-service] Redpanda unavailable:", err.message);
  return null;
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function getCookieToken(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/veta_user=([^;]+)/);
  return match ? match[1] : null;
}

function json(data: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...(extra ?? {}) },
  });
}

async function getUserFromToken(token: string | null) {
  if (!token) return null;
  const client = await usersPool.connect();
  try {
    const { rows } = await client.queryArray(
      `SELECT u.id, u.name, u.role, u.avatar_emoji, u.firm
       FROM users.sessions s JOIN users.users u ON u.id = s.user_id
       WHERE s.token = $1 AND s.expires_at > now()`,
      [token],
    );
    if (rows.length === 0) return null;
    const [id, name, role, avatar_emoji, firm] = rows[0];
    return { id, name, role, avatar_emoji, firm: firm ?? null } as { id: string; name: string; role: string; avatar_emoji: string; firm: string | null };
  } finally { client.release(); }
}

// ── Request handler ────────────────────────────────────────────────────────────

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    return json({ service: "user-service", version: VERSION, status: "ok" });
  }

  if (req.method === "GET" && path === "/users") {
    const client = await usersPool.connect();
    try {
      const { rows } = await client.queryArray(
        "SELECT id, name, role, avatar_emoji, firm FROM users.users ORDER BY role DESC, name",
      );
      return json(rows.map(([id, name, role, avatar_emoji, firm]) => ({ id, name, role, avatar_emoji, firm: firm ?? null })));
    } finally { client.release(); }
  }

  if (req.method === "POST" && path === "/sessions") {
    let body: { userId?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    const userId = body.userId;
    if (!userId) return json({ error: "userId required" }, 400);

    const client = await usersPool.connect();
    try {
      const { rows } = await client.queryArray(
        "SELECT id, name, role, avatar_emoji FROM users.users WHERE id = $1", [userId],
      );
      if (rows.length === 0) return json({ error: "user not found" }, 404);
      const [id, name, role, avatar_emoji] = rows[0];
      const token = randomToken();
      const now = new Date();
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1_000);
      await client.queryArray(
        "INSERT INTO users.sessions (token, user_id, created_at, expires_at) VALUES ($1,$2,$3,$4)",
        [token, userId, now, expiresAt],
      );
      producer?.send("user.session", { event: "login", userId, ts: Date.now() }).catch(() => {});
      return json({ id, name, role, avatar_emoji }, 200, {
        "Set-Cookie": `veta_user=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`,
      });
    } finally { client.release(); }
  }

  if (req.method === "DELETE" && path === "/sessions") {
    const token = getCookieToken(req);
    if (token) {
      const client = await usersPool.connect();
      try {
        const { rows } = await client.queryArray(
          "SELECT user_id FROM users.sessions WHERE token = $1", [token],
        );
        if (rows.length > 0) {
          producer?.send("user.session", { event: "logout", userId: rows[0][0], ts: Date.now() }).catch(() => {});
        }
        await client.queryArray("DELETE FROM users.sessions WHERE token = $1", [token]);
      } finally { client.release(); }
    }
    return json({ success: true }, 200, {
      "Set-Cookie": "veta_user=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
    });
  }

  if (req.method === "GET" && path === "/sessions/me") {
    const user = await getUserFromToken(getCookieToken(req));
    if (!user) return json({ error: "unauthenticated" }, 401);
    return json(user);
  }

  if (req.method === "POST" && path === "/sessions/validate") {
    let body: { token?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    const user = await getUserFromToken(body.token ?? null);
    if (!user) return json({ error: "unauthenticated" }, 401);

    const client = await usersPool.connect();
    try {
      const { rows } = await client.queryArray(
        "SELECT max_order_qty, max_daily_notional, allowed_strategies, allowed_desks, dark_pool_access FROM users.trading_limits WHERE user_id = $1",
        [user.id],
      );
      const limits = rows.length > 0
        ? {
            max_order_qty: rows[0][0] as number,
            max_daily_notional: rows[0][1] as number,
            allowed_strategies: (rows[0][2] as string).split(","),
            allowed_desks: (rows[0][3] as string).split(","),
            dark_pool_access: rows[0][4] as boolean,
          }
        : { max_order_qty: 10000, max_daily_notional: 1_000_000, allowed_strategies: ["LIMIT","TWAP","POV","VWAP"], allowed_desks: ["equity"], dark_pool_access: false };
      return json({ user, limits });
    } finally { client.release(); }
  }

  const limitsMatch = path.match(/^\/users\/([^/]+)\/limits$/);
  if (limitsMatch) {
    const userId = limitsMatch[1];
    if (req.method === "GET") {
      const client = await usersPool.connect();
      try {
        const { rows } = await client.queryArray(
          "SELECT max_order_qty, max_daily_notional, allowed_strategies, allowed_desks, dark_pool_access FROM users.trading_limits WHERE user_id = $1",
          [userId],
        );
        if (rows.length === 0) return json({ error: "user not found" }, 404);
        const [max_order_qty, max_daily_notional, allowed_strategies, allowed_desks, dark_pool_access] = rows[0];
        return json({
          userId,
          max_order_qty,
          max_daily_notional,
          allowed_strategies: (allowed_strategies as string).split(","),
          allowed_desks: (allowed_desks as string).split(","),
          dark_pool_access: dark_pool_access as boolean,
        });
      } finally { client.release(); }
    }
    if (req.method === "PUT") {
      const caller = await getUserFromToken(getCookieToken(req));
      if (!caller) return json({ error: "unauthenticated" }, 401);
      if (caller.role !== "admin") return json({ error: "forbidden — admin only" }, 403);
      let body: { max_order_qty?: number; max_daily_notional?: number; allowed_strategies?: string[]; allowed_desks?: string[]; dark_pool_access?: boolean };
      try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

      const client = await usersPool.connect();
      try {
        const { rows } = await client.queryArray(
          "SELECT max_order_qty, max_daily_notional, allowed_strategies, allowed_desks, dark_pool_access FROM users.trading_limits WHERE user_id = $1",
          [userId],
        );
        if (rows.length === 0) return json({ error: "user not found" }, 404);
        const [cur_qty, cur_notional, cur_strategies, cur_desks, cur_dark_pool] = rows[0];
        await client.queryArray(
          "UPDATE users.trading_limits SET max_order_qty=$1, max_daily_notional=$2, allowed_strategies=$3, allowed_desks=$4, dark_pool_access=$5 WHERE user_id=$6",
          [
            body.max_order_qty ?? cur_qty,
            body.max_daily_notional ?? cur_notional,
            body.allowed_strategies ? body.allowed_strategies.join(",") : cur_strategies,
            body.allowed_desks ? body.allowed_desks.join(",") : cur_desks,
            body.dark_pool_access ?? cur_dark_pool,
            userId,
          ],
        );
        return json({ success: true });
      } finally { client.release(); }
    }
  }

  const prefsMatch = path.match(/^\/users\/([^/]+)\/preferences$/);
  if (prefsMatch) {
    const userId = prefsMatch[1];
    if (req.method === "GET") {
      const client = await usersPool.connect();
      try {
        const { rows } = await client.queryArray(
          "SELECT data FROM users.user_preferences WHERE user_id = $1", [userId],
        );
        if (rows.length === 0) return json({ error: "user not found" }, 404);
        return json(rows[0][0] ?? {});
      } finally { client.release(); }
    }
    if (req.method === "PUT") {
      const caller = await getUserFromToken(getCookieToken(req));
      if (!caller) return json({ error: "unauthenticated" }, 401);
      if (caller.id !== userId && caller.role !== "admin") return json({ error: "forbidden" }, 403);
      let body: Record<string, unknown>;
      try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
      const client = await usersPool.connect();
      try {
        await client.queryArray(
          "INSERT INTO users.user_preferences (user_id, data) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data",
          [userId, body],
        );
        return json({ success: true });
      } finally { client.release(); }
    }
  }

  if (req.method === "GET" && path === "/shared-workspaces") {
    const caller = await getUserFromToken(getCookieToken(req));
    if (!caller) return json({ error: "unauthenticated" }, 401);
    const client = await usersPool.connect();
    try {
      const { rows } = await client.queryArray(
        `SELECT sw.id, sw.owner_id, u.name, u.avatar_emoji, sw.name, sw.description, sw.created_at
         FROM users.shared_workspaces sw JOIN users.users u ON u.id = sw.owner_id
         WHERE sw.owner_id != $1 ORDER BY sw.created_at DESC`,
        [caller.id],
      );
      return json(rows.map(([id, ownerId, ownerName, ownerEmoji, name, description, createdAt]) => ({
        id, ownerId, ownerName, ownerEmoji, name, description,
        createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
      })));
    } finally { client.release(); }
  }

  if (req.method === "POST" && path === "/shared-workspaces") {
    const caller = await getUserFromToken(getCookieToken(req));
    if (!caller) return json({ error: "unauthenticated" }, 401);
    let body: { name?: string; description?: string; model?: unknown };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    if (!body.name || !body.model) return json({ error: "name and model required" }, 400);
    const id = crypto.randomUUID();
    const client = await usersPool.connect();
    try {
      await client.queryArray(
        "INSERT INTO users.shared_workspaces (id, owner_id, name, description, model_json) VALUES ($1,$2,$3,$4,$5)",
        [id, caller.id, body.name, body.description ?? "", body.model],
      );
      return json({ id });
    } finally { client.release(); }
  }

  const sharedMatch = path.match(/^\/shared-workspaces\/([^/]+)$/);
  if (sharedMatch) {
    const sharedId = sharedMatch[1];

    if (req.method === "GET") {
      const caller = await getUserFromToken(getCookieToken(req));
      if (!caller) return json({ error: "unauthenticated" }, 401);
      const client = await usersPool.connect();
      try {
        const { rows } = await client.queryArray(
          `SELECT sw.id, sw.owner_id, u.name, u.avatar_emoji, sw.name, sw.description, sw.model_json, sw.created_at
           FROM users.shared_workspaces sw JOIN users.users u ON u.id = sw.owner_id WHERE sw.id = $1`,
          [sharedId],
        );
        if (rows.length === 0) return json({ error: "not found" }, 404);
        const [id, ownerId, ownerName, ownerEmoji, name, description, model, createdAt] = rows[0];
        return json({
          id, ownerId, ownerName, ownerEmoji, name, description, model,
          createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
        });
      } finally { client.release(); }
    }

    if (req.method === "DELETE") {
      const caller = await getUserFromToken(getCookieToken(req));
      if (!caller) return json({ error: "unauthenticated" }, 401);
      const client = await usersPool.connect();
      try {
        const { rows } = await client.queryArray(
          "SELECT owner_id FROM users.shared_workspaces WHERE id = $1", [sharedId],
        );
        if (rows.length === 0) return json({ error: "not found" }, 404);
        if (rows[0][0] !== caller.id && caller.role !== "admin") return json({ error: "forbidden" }, 403);
        await client.queryArray("DELETE FROM users.shared_workspaces WHERE id = $1", [sharedId]);
        return json({ success: true });
      } finally { client.release(); }
    }
  }

  const alertsMatch = path.match(/^\/users\/([^/]+)\/alerts$/);
  if (alertsMatch) {
    const userId = alertsMatch[1];
    if (req.method === "GET") {
      const caller = await getUserFromToken(getCookieToken(req));
      if (!caller) return json({ error: "unauthenticated" }, 401);
      if (caller.id !== userId && caller.role !== "admin") return json({ error: "forbidden" }, 403);
      const client = await usersPool.connect();
      try {
        const { rows } = await client.queryArray(
          "SELECT id, severity, source, message, detail, ts, dismissed, dismissed_at FROM users.user_alerts WHERE user_id=$1 ORDER BY ts DESC LIMIT 200",
          [userId],
        );
        return json(rows.map(([id, severity, source, message, detail, ts, dismissed, dismissedAt]) => ({
          id, severity, source, message, detail: detail ?? undefined,
          ts: ts instanceof Date ? ts.getTime() : ts,
          dismissed: dismissed === true,
          dismissedAt: dismissedAt instanceof Date ? dismissedAt.getTime() : (dismissedAt ?? undefined),
        })));
      } finally { client.release(); }
    }
    if (req.method === "POST") {
      const caller = await getUserFromToken(getCookieToken(req));
      if (!caller) return json({ error: "unauthenticated" }, 401);
      if (caller.id !== userId && caller.role !== "admin") return json({ error: "forbidden" }, 403);
      let body: { id?: string; severity?: string; source?: string; message?: string; detail?: string; ts?: number };
      try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
      if (!body.severity || !body.source || !body.message) return json({ error: "severity, source and message required" }, 400);
      const id = body.id ?? crypto.randomUUID();
      const client = await usersPool.connect();
      try {
        await client.queryArray(
          "INSERT INTO users.user_alerts (id, user_id, severity, source, message, detail, ts) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING",
          [id, userId, body.severity, body.source, body.message, body.detail ?? null, new Date(body.ts ?? Date.now())],
        );
        return json({ id });
      } finally { client.release(); }
    }
  }

  const alertsDismissAllMatch = path.match(/^\/users\/([^/]+)\/alerts\/dismiss-all$/);
  if (req.method === "PUT" && alertsDismissAllMatch) {
    const userId = alertsDismissAllMatch[1];
    const caller = await getUserFromToken(getCookieToken(req));
    if (!caller) return json({ error: "unauthenticated" }, 401);
    if (caller.id !== userId && caller.role !== "admin") return json({ error: "forbidden" }, 403);
    const client = await usersPool.connect();
    try {
      await client.queryArray(
        "UPDATE users.user_alerts SET dismissed=true, dismissed_at=now() WHERE user_id=$1 AND dismissed=false",
        [userId],
      );
      return json({ success: true });
    } finally { client.release(); }
  }

  const alertDismissMatch = path.match(/^\/users\/([^/]+)\/alerts\/([^/]+)\/dismiss$/);
  if (req.method === "PUT" && alertDismissMatch) {
    const userId = alertDismissMatch[1];
    const alertId = alertDismissMatch[2];
    const caller = await getUserFromToken(getCookieToken(req));
    if (!caller) return json({ error: "unauthenticated" }, 401);
    if (caller.id !== userId && caller.role !== "admin") return json({ error: "forbidden" }, 403);
    const client = await usersPool.connect();
    try {
      await client.queryArray(
        "UPDATE users.user_alerts SET dismissed=true, dismissed_at=now() WHERE id=$1 AND user_id=$2",
        [alertId, userId],
      );
      return json({ success: true });
    } finally { client.release(); }
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}

console.log(`[user-service] running on port ${PORT}`);
Deno.serve({ port: PORT }, handle);
