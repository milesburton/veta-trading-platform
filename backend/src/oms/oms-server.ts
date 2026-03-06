/**
 * Order Management System (OMS)
 *
 * Subscribes to: orders.new, orders.kill, orders.resume
 * Publishes to:  orders.submitted, orders.routed, orders.rejected,
 *                orders.cancelled, orders.resumed, orders.kill.audit, orders.resume.audit
 *
 * Kill/resume events are captured by observability for regulatory audit.
 * HTTP surface: GET /health
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("OMS_PORT")) || 5_002;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const USER_SERVICE_URL = `http://${Deno.env.get("USER_SERVICE_HOST") ?? "localhost"}:${Deno.env.get("USER_SERVICE_PORT") ?? "5008"}`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const KNOWN_STRATEGIES = new Set(["LIMIT", "TWAP", "POV", "VWAP"]);

// ── Trading limits cache ──────────────────────────────────────────────────────

interface TradingLimits {
  max_order_qty: number;
  max_daily_notional: number;
  allowed_strategies: string[];
}

/** Default permissive limits used when user-service is unavailable. */
const DEFAULT_LIMITS: TradingLimits = {
  max_order_qty: 10_000,
  max_daily_notional: 1_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
};

const limitsCache = new Map<string, { limits: TradingLimits; expiresAt: number }>();

async function getUserLimits(userId: string): Promise<TradingLimits> {
  const now = Date.now();
  const cached = limitsCache.get(userId);
  if (cached) {
    if (cached.expiresAt > now) return cached.limits;
    limitsCache.delete(userId); // evict expired entry
  }

  try {
    const res = await fetch(`${USER_SERVICE_URL}/users/${encodeURIComponent(userId)}/limits`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return DEFAULT_LIMITS;
    const data = await res.json() as { max_order_qty: number; max_daily_notional: number; allowed_strategies: string[] };
    const limits: TradingLimits = {
      max_order_qty: data.max_order_qty,
      max_daily_notional: data.max_daily_notional,
      allowed_strategies: data.allowed_strategies,
    };
    limitsCache.set(userId, { limits, expiresAt: now + 30_000 }); // cache for 30s
    return limits;
  } catch {
    return DEFAULT_LIMITS;
  }
}

// Monotonically increasing sequence number for this session
let seqNum = 1;

function nextOrderId(): string {
  return `oms-${Date.now()}-${seqNum++}`;
}

// ── Bus connections ───────────────────────────────────────────────────────────

const producer = await createProducer("oms").catch((err) => {
  console.warn("[oms] Redpanda unavailable — orders will not be published to bus:", err.message);
  return null;
});

// Subscribe to orders.new — published by gateway when GUI submits
const consumer = await createConsumer("oms-new-orders", ["orders.new"]).catch((err) => {
  console.warn("[oms] Cannot subscribe to orders.new:", err.message);
  return null;
});

// Subscribe to kill/resume commands — published by gateway from GUI killswitch
const killConsumer = await createConsumer("oms-kill-orders", ["orders.kill", "orders.resume"]).catch((err) => {
  console.warn("[oms] Cannot subscribe to orders.kill/orders.resume:", err.message);
  return null;
});

interface NewOrder {
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  expiresAt: number;
  strategy?: string;
  algoParams?: Record<string, unknown>;
  clientOrderId?: string;
  userId?: string;
  userRole?: string;
}

type KillScope = "all" | "user" | "algo" | "market" | "symbol";

interface KillCommand {
  scope: KillScope;
  scopeValue?: string;
  targetUserId?: string;
  issuedBy: string;
  issuedByRole: string;
  ts: number;
}

interface ResumeCommand {
  scope: KillScope;
  scopeValue?: string;
  targetUserId?: string;
  resumeAt?: number;
  issuedBy: string;
  issuedByRole: string;
  ts: number;
}

interface ActiveOrder {
  orderId: string;
  clientOrderId: string;
  userId?: string;
  asset: string;
  strategy: string;
  status: "queued" | "executing";
}

const activeOrders = new Map<string, ActiveOrder>();

consumer?.onMessage(async (_topic, raw) => {
  const order = raw as NewOrder;

  if (!order.asset || !order.side || !order.quantity) {
    console.warn("[oms] Malformed order — missing required fields");
    await producer?.send("orders.rejected", {
      clientOrderId: order.clientOrderId,
      userId: order.userId,
      reason: "Missing required fields: asset, side, quantity",
      ts: Date.now(),
    }).catch(() => {});
    return;
  }

  const strategy = (order.strategy ?? "LIMIT").toUpperCase();
  if (!KNOWN_STRATEGIES.has(strategy)) {
    console.warn(`[oms] Unknown strategy "${strategy}" — rejecting order`);
    await producer?.send("orders.rejected", {
      clientOrderId: order.clientOrderId,
      userId: order.userId,
      reason: `Unknown strategy: ${strategy}`,
      ts: Date.now(),
    }).catch(() => {});
    return;
  }

  if (order.userRole === "admin") {
    console.warn(`[oms] Order rejected — admin user ${order.userId} attempted to submit an order`);
    await producer?.send("orders.rejected", {
      clientOrderId: order.clientOrderId,
      userId: order.userId,
      reason: "Admin accounts are not permitted to submit orders",
      ts: Date.now(),
    }).catch(() => {});
    return;
  }

  if (order.userId) {
    const limits = await getUserLimits(order.userId);

    if (order.quantity > limits.max_order_qty) {
      console.warn(`[oms] Order rejected — quantity ${order.quantity} exceeds limit ${limits.max_order_qty} for user ${order.userId}`);
      await producer?.send("orders.rejected", {
        clientOrderId: order.clientOrderId,
        userId: order.userId,
        reason: `Order quantity ${order.quantity} exceeds your limit of ${limits.max_order_qty}`,
        ts: Date.now(),
      }).catch(() => {});
      return;
    }

    if (!limits.allowed_strategies.includes(strategy)) {
      console.warn(`[oms] Order rejected — strategy ${strategy} not permitted for user ${order.userId}`);
      await producer?.send("orders.rejected", {
        clientOrderId: order.clientOrderId,
        userId: order.userId,
        reason: `Strategy ${strategy} is not permitted for your account`,
        ts: Date.now(),
      }).catch(() => {});
      return;
    }

    const notional = order.quantity * (order.limitPrice ?? 0);
    if (notional > limits.max_daily_notional) {
      console.warn(`[oms] Order rejected — notional ${notional} exceeds daily limit ${limits.max_daily_notional} for user ${order.userId}`);
      await producer?.send("orders.rejected", {
        clientOrderId: order.clientOrderId,
        userId: order.userId,
        reason: `Order notional $${notional.toLocaleString()} exceeds your daily limit of $${limits.max_daily_notional.toLocaleString()}`,
        ts: Date.now(),
      }).catch(() => {});
      return;
    }
  }

  const orderId = nextOrderId();
  const ts = Date.now();
  const expiresInSecs = Number(order.expiresAt ?? 0);
  const timeInForce = expiresInSecs <= 0 ? "GTC" : expiresInSecs <= 60 ? "IOC" : "DAY";
  const destinationVenue = "XNAS";
  const accountId = "ACC-001";

  const enriched = {
    orderId,
    clientOrderId: order.clientOrderId,
    userId: order.userId,
    ts,
    timeInForce,
    destinationVenue,
    accountId,
    asset: order.asset,
    side: order.side,
    quantity: order.quantity,
    limitPrice: order.limitPrice,
    expiresAt: order.expiresAt,
    strategy,
    algoParams: order.algoParams ?? {},
  };

  console.log(`[oms] Accepted ${strategy} order ${orderId}: ${order.side} ${order.quantity} ${order.asset} (user=${order.userId ?? "unknown"})`);

  if (order.clientOrderId) {
    activeOrders.set(order.clientOrderId, {
      orderId,
      clientOrderId: order.clientOrderId,
      userId: order.userId,
      asset: order.asset,
      strategy,
      status: "queued",
    });
  }

  await producer?.send("orders.submitted", enriched).catch(() => {});
  await producer?.send("orders.routed", { ...enriched, routedAt: Date.now() }).catch(() => {});
});

killConsumer?.onMessage(async (topic, raw) => {
  const ts = Date.now();

  if (topic === "orders.kill") {
    const cmd = raw as KillCommand;
    const { scope, scopeValue, targetUserId, issuedBy, issuedByRole } = cmd;

    if (issuedByRole !== "admin" && targetUserId && targetUserId !== issuedBy) {
      console.warn(`[oms] Kill rejected — trader ${issuedBy} attempted to kill orders for user ${targetUserId}`);
      return;
    }

    const isOwned = (order: ActiveOrder) => issuedByRole === "admin" || order.userId === issuedBy;

    const toCancel: ActiveOrder[] = [];
    for (const order of activeOrders.values()) {
      if (scope === "all") {
        if (isOwned(order)) toCancel.push(order);
      } else if (scope === "user") {
        const targetId = (issuedByRole === "admin" && targetUserId) ? targetUserId : issuedBy;
        if (order.userId === targetId) toCancel.push(order);
      } else if (scope === "algo") {
        if (order.strategy === scopeValue && isOwned(order)) toCancel.push(order);
      } else if (scope === "market") {
        if ((!scopeValue || order.asset.startsWith(scopeValue) || scopeValue === "*") && isOwned(order)) toCancel.push(order);
      } else if (scope === "symbol") {
        if (order.asset === scopeValue && isOwned(order)) toCancel.push(order);
      }
    }

    if (toCancel.length === 0) {
      console.log(`[oms] Kill command from ${issuedBy}: no matching active orders (scope=${scope} scopeValue=${scopeValue ?? "—"})`);
      return;
    }

    console.log(`[oms] Kill command from ${issuedBy} (role=${issuedByRole}): cancelling ${toCancel.length} orders (scope=${scope} scopeValue=${scopeValue ?? "—"})`);

    for (const order of toCancel) {
      activeOrders.delete(order.clientOrderId);
      await producer?.send("orders.cancelled", {
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        userId: order.userId,
        asset: order.asset,
        strategy: order.strategy,
        reason: `Killswitch: ${scope}${scopeValue ? `=${scopeValue}` : ""}`,
        issuedBy,
        issuedByRole,
        ts,
      }).catch(() => {});
    }

    await producer?.send("orders.kill.audit", {
      scope,
      scopeValue,
      targetUserId,
      issuedBy,
      issuedByRole,
      cancelledCount: toCancel.length,
      cancelledIds: toCancel.map((o) => o.clientOrderId),
      ts,
    }).catch(() => {});
  }

  if (topic === "orders.resume") {
    const cmd = raw as ResumeCommand;
    const { scope, scopeValue, targetUserId, resumeAt, issuedBy, issuedByRole } = cmd;

    const effectiveAt = resumeAt && resumeAt > ts ? resumeAt : ts;
    const delayMs = effectiveAt - ts;

    const doResume = async () => {
      console.log(`[oms] Resume command from ${issuedBy} (role=${issuedByRole}): scope=${scope} scopeValue=${scopeValue ?? "—"}`);
      await producer?.send("orders.resumed", {
        scope,
        scopeValue,
        targetUserId,
        issuedBy,
        issuedByRole,
        ts: Date.now(),
      }).catch(() => {});

      // Regulatory audit log
      await producer?.send("orders.resume.audit", {
        scope,
        scopeValue,
        targetUserId,
        issuedBy,
        issuedByRole,
        resumeAt: effectiveAt,
        ts: Date.now(),
      }).catch(() => {});
    };

    if (delayMs > 0) {
      console.log(`[oms] Resume scheduled in ${delayMs}ms (at ${new Date(effectiveAt).toISOString()})`);
      setTimeout(() => { doResume().catch(() => {}); }, delayMs);
    } else {
      await doResume();
    }
  }
});

console.log(`[oms] Listening for orders.new on message bus`);

// ── Health endpoint ───────────────────────────────────────────────────────────

serve((req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (url.pathname === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({ service: "oms", version: VERSION, status: "ok" }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }
  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}, { port: PORT });
