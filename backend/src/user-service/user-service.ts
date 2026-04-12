import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { usersPool } from "../lib/db.ts";
import { createProducer } from "../lib/messaging.ts";

const AUTH_ROLES = ["trader", "admin", "compliance", "sales", "external-client", "viewer", "desk-head", "risk-manager"] as const;
type AuthRole = typeof AUTH_ROLES[number];

function parseOAuthClients(config: string): Map<string, {
  clientId: string;
  redirectUris: string[];
  scopes: string[];
}> {
  const result = new Map<string, {
    clientId: string;
    redirectUris: string[];
    scopes: string[];
  }>();

  for (const rawEntry of config.split(";")) {
    const entry = rawEntry.trim();
    if (!entry) continue;

    // Supported formats:
    // 1) clientId:redirect1,redirect2|scope1,scope2
    // 2) clientId|redirect1,redirect2|scope1,scope2
    let clientId = "";
    let redirectPart = "postmessage";
    let scopePart = "openid,profile";

    if (entry.includes("|")) {
      const [first = "", second = "postmessage", third = "openid,profile"] = entry.split("|");
      if (first.includes(":")) {
        const sep = first.indexOf(":");
        clientId = first.slice(0, sep).trim();
        redirectPart = first.slice(sep + 1).trim() || second.trim() || "postmessage";
        scopePart = third.trim() || "openid,profile";
      } else {
        clientId = first.trim();
        redirectPart = second.trim() || "postmessage";
        scopePart = third.trim() || "openid,profile";
      }
    } else {
      const sep = entry.indexOf(":");
      clientId = (sep >= 0 ? entry.slice(0, sep) : entry).trim();
      redirectPart = sep >= 0 ? entry.slice(sep + 1).trim() || "postmessage" : "postmessage";
    }

    if (!clientId) continue;
    result.set(clientId, {
      clientId,
      redirectUris: redirectPart.split(",").map((value) => value.trim()).filter(Boolean),
      scopes: scopePart.split(",").map((value) => value.trim()).filter(Boolean),
    });
  }

  return result;
}

function parseUserSecrets(config: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const rawEntry of config.split(";")) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const sep = entry.indexOf(":");
    if (sep <= 0) continue;
    const userId = normalizeUserId(entry.slice(0, sep));
    const secret = entry.slice(sep + 1).trim();
    if (!userId || !secret) continue;
    result.set(userId, secret);
  }
  return result;
}

const OAUTH_CLIENTS = new Map<string, {
  clientId: string;
  redirectUris: string[];
  scopes: string[];
}>(parseOAuthClients(
  Deno.env.get("OAUTH2_CLIENTS") ?? "veta-web:postmessage|openid,profile;veta-automation:postmessage|openid,profile",
));

const OAUTH_USER_SECRETS = parseUserSecrets(Deno.env.get("OAUTH2_USER_SECRETS") ?? "");
const OAUTH_SHARED_SECRET = Deno.env.get("OAUTH2_SHARED_SECRET") ?? "veta-dev-passcode";

const oauthCodes = new Map<string, {
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  expiresAt: number;
}>();

setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of oauthCodes) {
    if (entry.expiresAt <= now) oauthCodes.delete(code);
  }
}, 30_000);

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

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function normalizeUserId(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function jsonError(error: string, status = 400, extra?: Record<string, string>): Response {
  return json({ error }, status, extra);
}

function _isAuthRole(role: string): role is AuthRole {
  return AUTH_ROLES.includes(role as AuthRole);
}

function canViewUserDirectory(role: string): boolean {
  return role === "admin" || role === "compliance";
}

function getOAuthClient(clientId: string | undefined, redirectUri: string | undefined) {
  if (!clientId) return null;
  const client = OAUTH_CLIENTS.get(clientId);
  if (!client) return null;
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) return null;
  return client;
}

async function createSessionForUser(client: Awaited<ReturnType<typeof usersPool.connect>>, userId: string) {
  const { rows } = await client.queryArray(
    "SELECT id, name, role, avatar_emoji, firm FROM users.users WHERE id = $1",
    [userId],
  );
  if (rows.length === 0) return null;
  const [id, name, role, avatar_emoji, firm] = rows[0];
  const token = randomToken();
  await client.queryArray(
    "INSERT INTO users.sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, now(), now() + interval '8 hours')",
    [token, id],
  );
  producer?.send("user.session", { event: "login", userId: id, ts: Date.now() }).catch(() => {});
  return {
    token,
    user: {
      id: id as string,
      name: name as string,
      role: role as AuthRole,
      avatar_emoji: avatar_emoji as string,
      firm: (firm as string | null) ?? null,
    },
  };
}

async function derivePkceChallenge(verifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function verifyOAuthCredentials(userId: string, providedPassword: string | undefined): boolean {
  const candidate = (providedPassword ?? "").trim();
  if (!candidate) return false;

  const userSecret = OAUTH_USER_SECRETS.get(userId);
  if (userSecret) return userSecret === candidate;

  if (!OAUTH_SHARED_SECRET) return false;
  return OAUTH_SHARED_SECRET === candidate;
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

function splitCsv(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter((x) => x.length > 0);
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

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    return json({ service: "user-service", version: VERSION, status: "ok" });
  }

  if (req.method === "GET" && path === "/users") {
    const caller = await getUserFromToken(getCookieToken(req));
    if (!caller) return json({ error: "unauthenticated" }, 401);
    if (!canViewUserDirectory(caller.role)) {
      return json({ error: "forbidden — admin or compliance only" }, 403);
    }
    const client = await usersPool.connect();
    try {
      const { rows } = await client.queryArray(
        "SELECT id, name, role, avatar_emoji, firm FROM users.users ORDER BY role DESC, name",
      );
      return json(rows.map(([id, name, role, avatar_emoji, firm]) => ({ id, name, role, avatar_emoji, firm: firm ?? null })));
    } finally { client.release(); }
  }

  if (req.method === "GET" && path === "/personas") {
    const demoMode = (Deno.env.get("VETA_DEMO_MODE") ?? "true").toLowerCase() !== "false";
    if (!demoMode) return json({ error: "demo mode disabled" }, 404);
    const client = await usersPool.connect();
    try {
      const { rows } = await client.queryArray(
        `SELECT u.id, u.name, u.role, u.avatar_emoji, u.description,
                l.trading_style, l.primary_desk, l.allowed_strategies, l.max_order_qty, l.dark_pool_access
         FROM users.users u
         LEFT JOIN users.trading_limits l ON l.user_id = u.id
         WHERE u.role IN ('trader','desk-head','compliance','sales','admin','external-client')
         ORDER BY
           CASE u.role
             WHEN 'trader' THEN 1
             WHEN 'desk-head' THEN 2
             WHEN 'sales' THEN 3
             WHEN 'external-client' THEN 4
             WHEN 'compliance' THEN 5
             WHEN 'admin' THEN 6
             ELSE 7
           END,
           l.primary_desk NULLS LAST,
           l.trading_style NULLS LAST,
           u.name`,
      );
      return json({
        personas: rows.map((r) => ({
          id: r[0] as string,
          name: r[1] as string,
          role: r[2] as string,
          avatar_emoji: r[3] as string,
          description: (r[4] as string) ?? "",
          trading_style: (r[5] as string) ?? null,
          primary_desk: (r[6] as string) ?? null,
          allowed_strategies: r[7] ? splitCsv(r[7] as string) : [],
          max_order_qty: (r[8] as number) ?? 0,
          dark_pool_access: (r[9] as boolean) ?? false,
        })),
      });
    } finally { client.release(); }
  }

  if (req.method === "POST" && path === "/sessions") {
    return jsonError(
      "legacy /sessions login is disabled; use OAuth2 /oauth/authorize + /oauth/token",
      410,
    );
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
        "SELECT max_order_qty, max_daily_notional, allowed_strategies, allowed_desks, dark_pool_access, trading_style, primary_desk FROM users.trading_limits WHERE user_id = $1",
        [user.id],
      );
      const limits = rows.length > 0
        ? {
            max_order_qty: rows[0][0] as number,
            max_daily_notional: rows[0][1] as number,
            allowed_strategies: splitCsv(rows[0][2] as string),
            allowed_desks: splitCsv(rows[0][3] as string),
            dark_pool_access: rows[0][4] as boolean,
            trading_style: rows[0][5] as string,
            primary_desk: rows[0][6] as string,
          }
        : { max_order_qty: 10000, max_daily_notional: 1_000_000, allowed_strategies: ["LIMIT","TWAP","POV","VWAP"], allowed_desks: ["equity-cash"], dark_pool_access: false, trading_style: "high_touch", primary_desk: "equity-cash" };
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
          "SELECT max_order_qty, max_daily_notional, allowed_strategies, allowed_desks, dark_pool_access, trading_style, primary_desk FROM users.trading_limits WHERE user_id = $1",
          [userId],
        );
        if (rows.length === 0) return json({ error: "user not found" }, 404);
        const [max_order_qty, max_daily_notional, allowed_strategies, allowed_desks, dark_pool_access, trading_style, primary_desk] = rows[0];
        return json({
          userId,
          max_order_qty,
          max_daily_notional,
          allowed_strategies: splitCsv(allowed_strategies as string),
          allowed_desks: splitCsv(allowed_desks as string),
          dark_pool_access: dark_pool_access as boolean,
          trading_style: trading_style as string,
          primary_desk: primary_desk as string,
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

  // ---------------------------------------------------------------------------
  // OAuth2 / OIDC-lite provider
  // ---------------------------------------------------------------------------

  if (req.method === "GET" && path === "/.well-known/openid-configuration") {
    const issuer = `${url.protocol}//${url.host}`;
    return json({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["openid", "profile"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  }

  if (req.method === "GET" && path === "/oauth/clients") {
    return json({
      clients: [...OAUTH_CLIENTS.values()].map((client) => ({
        client_id: client.clientId,
        redirect_uris: client.redirectUris,
        scopes: client.scopes,
      })),
    });
  }

  if (req.method === "POST" && (path === "/oauth/authorize" || path === "/auth/authorize")) {
    let body: {
      client_id?: string;
      username?: string;
      userId?: string;
      redirect_uri?: string;
      response_type?: string;
      scope?: string;
      password?: string;
      code_challenge?: string;
      code_challenge_method?: string;
    };
    try { body = await req.json(); } catch { return jsonError("invalid json", 400); }
    if (body.response_type !== "code") return jsonError("unsupported response_type", 400);
    if (body.code_challenge_method !== "S256") return jsonError("invalid code_challenge_method", 400);
    if (!body.code_challenge) return jsonError("code_challenge required", 400);

    const redirectUri = body.redirect_uri ?? "postmessage";
    const oauthClient = getOAuthClient(body.client_id, redirectUri);
    if (!oauthClient) return jsonError("invalid_client", 401);

    const requestedUserId = normalizeUserId(body.username ?? body.userId ?? "");
    if (!requestedUserId) return jsonError("username required", 400);
    if (!await verifyOAuthCredentials(requestedUserId, body.password)) {
      return jsonError("invalid_credentials", 401);
    }

    const client = await usersPool.connect();
    try {
      const { rows } = await client.queryArray(
        "SELECT id FROM users.users WHERE id = $1",
        [requestedUserId],
      );
      if (rows.length === 0) return jsonError("user not found", 404);

      const code = crypto.randomUUID();
      const scope = body.scope?.trim() || oauthClient.scopes.join(" ");
      oauthCodes.set(code, {
        clientId: oauthClient.clientId,
        userId: requestedUserId,
        redirectUri,
        scope,
        codeChallenge: body.code_challenge,
        codeChallengeMethod: "S256",
        expiresAt: Date.now() + 60_000,
      });

      return json({ code, redirect_uri: redirectUri, expires_in: 60, scope, token_type: "none" });
    } finally { client.release(); }
  }

  if (req.method === "POST" && (path === "/oauth/token" || path === "/auth/token")) {
    let body: {
      client_id?: string;
      code?: string;
      grant_type?: string;
      redirect_uri?: string;
      code_verifier?: string;
    };
    try { body = await req.json(); } catch { return jsonError("invalid json", 400); }
    if (body.grant_type !== "authorization_code") return jsonError("unsupported grant_type", 400);
    if (!body.code) return jsonError("code required", 400);
    if (!body.code_verifier) return jsonError("code_verifier required", 400);

    const entry = oauthCodes.get(body.code);
    if (!entry || entry.expiresAt < Date.now()) {
      oauthCodes.delete(body.code);
      return jsonError("invalid_grant", 400);
    }

    const oauthClient = getOAuthClient(body.client_id, body.redirect_uri ?? entry.redirectUri);
    if (!oauthClient || oauthClient.clientId !== entry.clientId || (body.redirect_uri ?? entry.redirectUri) !== entry.redirectUri) {
      return jsonError("invalid_client", 401);
    }

    const derivedChallenge = await derivePkceChallenge(body.code_verifier);
    if (derivedChallenge !== entry.codeChallenge) return jsonError("invalid_grant", 400);
    oauthCodes.delete(body.code);

    const client = await usersPool.connect();
    try {
      const session = await createSessionForUser(client, entry.userId);
      if (!session) return jsonError("user not found", 404);

      return json(
        {
          access_token: session.token,
          token_type: "bearer",
          expires_in: 28800,
          scope: entry.scope,
          user: session.user,
        },
        200,
        { "Set-Cookie": `veta_user=${session.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800` },
      );
    } finally { client.release(); }
  }

  if (req.method === "POST" && (path === "/oauth/register" || path === "/auth/register")) {
    let body: { username?: string; userId?: string; name?: string; password?: string };
    try { body = await req.json(); } catch { return jsonError("invalid json", 400); }
    if (!(body.username || body.userId) || !body.name) return jsonError("username and name required", 400);

    const userId = normalizeUserId(body.username ?? body.userId ?? "");
    if (userId.length < 2) return jsonError("username too short", 400);
    if (!await verifyOAuthCredentials(userId, body.password)) return jsonError("invalid_credentials", 401);

    const client = await usersPool.connect();
    try {
      const { rows: existing } = await client.queryArray(
        "SELECT id FROM users.users WHERE id = $1", [userId],
      );
      if (existing.length > 0) return jsonError("username already exists", 409);

      await client.queryArray(
        "INSERT INTO users.users (id, name, role, avatar_emoji) VALUES ($1, $2, 'viewer', '👁')",
        [userId, body.name],
      );
      await client.queryArray(
        "INSERT INTO users.trading_limits (user_id, max_order_qty, max_daily_notional, allowed_strategies, allowed_desks, dark_pool_access) VALUES ($1, 0, 0, '', '', false)",
        [userId],
      );
      producer?.send("user.session", { event: "register", userId, ts: Date.now() }).catch(() => {});
      return json({ userId, name: body.name, role: "viewer" }, 201);
    } finally { client.release(); }
  }

  // ---------------------------------------------------------------------------

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}

console.log(`[user-service] running on port ${PORT}`);
Deno.serve({ port: PORT }, handle);
