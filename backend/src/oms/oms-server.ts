/**
 * Order Management System (OMS)
 *
 * Subscribes to: orders.new, orders.kill, orders.resume
 * Publishes to:  orders.submitted, orders.routed, orders.fi.rfq, orders.rejected,
 *                orders.cancelled, orders.resumed, orders.kill.audit, orders.resume.audit
 *
 * Routing logic:
 *   equity  + lit          → orders.routed (→ algo strategies → EMS)
 *   equity  + dark pool    → orders.routed with destinationVenue=DARK1 (→ dark-pool service)
 *   fi      (bond)         → orders.fi.rfq (→ rfq-service)
 *   derivatives + listed   → orders.routed with destinationVenue=XNAS (→ EMS)
 *   derivatives + otc      → orders.routed with destinationVenue=OTC-OPTIONS (→ otc-options service)
 *
 * Information barriers: desk access validated per user before routing.
 * Kill/resume events are captured by observability for regulatory audit.
 * HTTP surface: GET /health
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";
import { CORS_HEADERS, corsOptions, json } from "../lib/http.ts";

const PORT = Number(Deno.env.get("OMS_PORT")) || 5_002;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const RISK_ENGINE_URL = `http://${Deno.env.get("RISK_ENGINE_HOST") ?? "localhost"}:${Deno.env.get("RISK_ENGINE_PORT") ?? "5032"}`;
const USER_SERVICE_URL = `http://${
  Deno.env.get("USER_SERVICE_HOST") ?? "localhost"
}:${Deno.env.get("USER_SERVICE_PORT") ?? "5008"}`;
const JOURNAL_URL = `http://${Deno.env.get("JOURNAL_HOST") ?? "localhost"}:${
  Deno.env.get("JOURNAL_PORT") ?? "5009"
}`;

/** Minimum block size for dark pool routing (shares). */
const DARK_POOL_MIN_BLOCK = Number(
  Deno.env.get("DARK_POOL_MIN_BLOCK") ?? "10000",
);

const KNOWN_STRATEGIES = new Set([
  "LIMIT",
  "TWAP",
  "POV",
  "VWAP",
  "ICEBERG",
  "SNIPER",
  "ARRIVAL_PRICE",
  "IS",
  "MOMENTUM",
]);

type Desk = "equity" | "fi" | "derivatives" | "fx" | "commodities";
type MarketType = "lit" | "dark" | "otc";

interface TradingLimits {
  max_order_qty: number;
  max_daily_notional: number;
  allowed_strategies: string[];
  allowed_desks: string[];
  dark_pool_access: boolean;
}

const DEFAULT_LIMITS: TradingLimits = {
  max_order_qty: 10_000,
  max_daily_notional: 1_000_000,
  allowed_strategies: [
    "LIMIT",
    "TWAP",
    "POV",
    "VWAP",
    "ICEBERG",
    "SNIPER",
    "ARRIVAL_PRICE",
    "IS",
    "MOMENTUM",
  ],
  allowed_desks: ["equity"],
  dark_pool_access: false,
};

const MARKET_SIM_URL = `http://${
  Deno.env.get("MARKET_SIM_HOST") ?? "localhost"
}:${Deno.env.get("MARKET_SIM_PORT") ?? "5000"}`;

const limitsCache = new Map<
  string,
  { limits: TradingLimits; expiresAt: number }
>();

async function getUserLimits(userId: string): Promise<TradingLimits> {
  const now = Date.now();
  const cached = limitsCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.limits;
  limitsCache.delete(userId);

  try {
    const res = await fetch(
      `${USER_SERVICE_URL}/users/${encodeURIComponent(userId)}/limits`,
      {
        signal: AbortSignal.timeout(3_000),
      },
    );
    if (!res.ok) return DEFAULT_LIMITS;
    const data = await res.json() as {
      max_order_qty: number;
      max_daily_notional: number;
      allowed_strategies: string[];
      allowed_desks?: string[];
      dark_pool_access?: boolean;
    };
    const limits: TradingLimits = {
      max_order_qty: data.max_order_qty,
      max_daily_notional: data.max_daily_notional,
      allowed_strategies: data.allowed_strategies,
      allowed_desks: data.allowed_desks ?? ["equity"],
      dark_pool_access: data.dark_pool_access ?? false,
    };
    limitsCache.set(userId, { limits, expiresAt: now + 30_000 });
    return limits;
  } catch {
    return DEFAULT_LIMITS;
  }
}

const lotSizeCache = new Map<string, number>();
let lotSizeCacheExpiry = 0;

async function getAssetLotSize(symbol: string): Promise<number> {
  const now = Date.now();
  if (now < lotSizeCacheExpiry && lotSizeCache.has(symbol)) {
    return lotSizeCache.get(symbol)!;
  }
  try {
    const res = await fetch(`${MARKET_SIM_URL}/assets`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) return 100;
    const assets = await res.json() as { symbol: string; lotSize?: number }[];
    lotSizeCache.clear();
    for (const a of assets) lotSizeCache.set(a.symbol, a.lotSize ?? 100);
    lotSizeCacheExpiry = now + 60_000;
  } catch {
    return 100;
  }
  return lotSizeCache.get(symbol) ?? 100;
}

function deriveDesk(instrumentType?: string): Desk {
  if (instrumentType === "bond") return "fi";
  if (instrumentType === "option") return "derivatives";
  if (instrumentType === "fx") return "fx";
  if (instrumentType === "commodity") return "commodities";
  return "equity";
}

function deriveMarketType(
  desk: Desk,
  order: NewOrder,
  limits: TradingLimits,
): MarketType {
  if (desk === "fi") return "otc";
  if (desk === "derivatives" && order.optionSpec?.isOtc) return "otc";
  if (desk === "fx" || desk === "commodities") return "lit";
  // Route equity block orders to dark pool when user has access
  if (
    desk === "equity" &&
    limits.dark_pool_access &&
    order.quantity >= DARK_POOL_MIN_BLOCK
  ) return "dark";
  return "lit";
}

function deriveDestinationVenue(desk: Desk, marketType: MarketType): string {
  if (desk === "fi") return "RFQ";
  if (desk === "fx") return "EBS";
  if (desk === "commodities") return "XCME";
  if (marketType === "dark") return "DARK1";
  if (marketType === "otc") return "OTC-OPTIONS";
  return "XNAS";
}

interface BondSpec {
  isin: string;
  symbol: string;
  description: string;
  couponRate: number;
  maturityDate: string;
  totalPeriods: number;
  periodsPerYear: number;
  faceValue: number;
  yieldAtOrder: number;
  creditRating: string;
}

interface OptionSpec {
  optionType: "call" | "put";
  strike: number;
  expirySecs: number;
  isOtc?: boolean;
}

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
  instrumentType?: string;
  bondSpec?: BondSpec;
  optionSpec?: OptionSpec;
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
  desk: Desk;
  status: "pending" | "working";
}

let seqNum = 1;
function nextOrderId(): string {
  return `oms-${Date.now()}-${seqNum++}`;
}

const producer = await createProducer("oms").catch((err) => {
  console.warn(
    "[oms] Redpanda unavailable — orders will not be published to bus:",
    err.message,
  );
  return null;
});

const consumer = await createConsumer("oms-new-orders", ["orders.new"]).catch(
  (err) => {
    console.warn("[oms] Cannot subscribe to orders.new:", err.message);
    return null;
  },
);

const killConsumer = await createConsumer("oms-kill-orders", [
  "orders.kill",
  "orders.resume",
]).catch((err) => {
  console.warn(
    "[oms] Cannot subscribe to orders.kill/orders.resume:",
    err.message,
  );
  return null;
});

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

  if (
    order.userRole === "admin" ||
    order.userRole === "compliance" ||
    order.userRole === "sales" ||
    order.userRole === "external-client" ||
    order.userRole === "viewer" ||
    order.userRole === "desk-head" ||
    order.userRole === "risk-manager"
  ) {
    const roleLabel = order.userRole === "admin"
      ? "Admin"
      : order.userRole === "compliance"
      ? "Compliance"
      : order.userRole === "sales"
      ? "Sales"
      : order.userRole === "viewer"
      ? "Viewer"
      : order.userRole === "desk-head"
      ? "Desk-head (read-only oversight)"
      : order.userRole === "risk-manager"
      ? "Risk Manager (read-only oversight)"
      : "External-client";
    console.warn(
      `[oms] Order rejected — ${order.userRole} user ${order.userId} attempted to submit an order`,
    );
    await producer?.send("orders.rejected", {
      clientOrderId: order.clientOrderId,
      userId: order.userId,
      reason: `${roleLabel} accounts are not permitted to submit orders`,
      ts: Date.now(),
    }).catch(() => {});
    return;
  }

  const desk = deriveDesk(order.instrumentType);

  const limits = order.userId
    ? await getUserLimits(order.userId)
    : DEFAULT_LIMITS;

  if (!limits.allowed_desks.includes(desk)) {
    console.warn(
      `[oms] Order rejected — user ${order.userId} does not have access to ${desk} desk`,
    );
    await producer?.send("orders.rejected", {
      clientOrderId: order.clientOrderId,
      userId: order.userId,
      reason: `Your account does not have access to the ${desk} desk`,
      ts: Date.now(),
    }).catch(() => {});
    return;
  }

  try {
    const riskRes = await fetch(`${RISK_ENGINE_URL}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order.clientOrderId,
        userId: order.userId,
        userRole: order.userRole,
        symbol: order.asset,
        side: order.side,
        quantity: order.quantity,
        limitPrice: order.limitPrice,
        strategy: order.strategy,
        instrumentType: order.instrumentType,
      }),
      signal: AbortSignal.timeout(3_000),
    });
    const riskResult = (await riskRes.json()) as {
      allowed: boolean;
      reasons: string[];
      warnings: string[];
    };
    if (!riskResult.allowed) {
      const reason = riskResult.reasons.join("; ");
      console.warn(`[oms] Risk-engine rejected order ${order.clientOrderId}: ${reason}`);
      await producer?.send("orders.rejected", {
        clientOrderId: order.clientOrderId,
        userId: order.userId,
        reason: `Risk check failed: ${reason}`,
        ts: Date.now(),
      }).catch(() => {});
      return;
    }
    for (const w of riskResult.warnings) {
      console.log(`[oms] Risk warning for ${order.clientOrderId}: ${w}`);
    }
  } catch (err) {
    console.error(`[oms] Risk-engine unreachable — rejecting order ${order.clientOrderId}:`, (err as Error).message);
    await producer?.send("orders.rejected", {
      clientOrderId: order.clientOrderId,
      userId: order.userId,
      reason: "Risk engine unavailable — all orders are blocked until the risk service is restored",
      ts: Date.now(),
    }).catch(() => {});
    return;
  }

  if (desk === "fi") {
    if (!order.bondSpec) {
      await producer?.send("orders.rejected", {
        clientOrderId: order.clientOrderId,
        userId: order.userId,
        reason:
          "Bond orders require bondSpec (isin, couponRate, totalPeriods, yieldAtOrder)",
        ts: Date.now(),
      }).catch(() => {});
      return;
    }
  }

  if (desk === "derivatives") {
    if (
      !order.optionSpec?.optionType || order.optionSpec?.strike === undefined ||
      order.optionSpec?.expirySecs === undefined
    ) {
      await producer?.send("orders.rejected", {
        clientOrderId: order.clientOrderId,
        userId: order.userId,
        reason:
          "Option orders require optionSpec (optionType, strike, expirySecs)",
        ts: Date.now(),
      }).catch(() => {});
      return;
    }
  }

  // FI uses RFQ — no algo strategy applies. OTC options use bilateral flow.
  // FX and commodities use standard algo strategies (same pool as equity).
  const needsStrategyCheck = desk === "equity" || desk === "fx" ||
    desk === "commodities" ||
    (desk === "derivatives" && !order.optionSpec?.isOtc);

  let strategy = (order.strategy ?? "LIMIT").toUpperCase();
  if (desk === "fi") strategy = "LIMIT"; // bonds always LIMIT internally

  if (needsStrategyCheck) {
    if (!KNOWN_STRATEGIES.has(strategy)) {
      await producer?.send("orders.rejected", {
        clientOrderId: order.clientOrderId,
        userId: order.userId,
        reason: `Unknown strategy: ${strategy}`,
        ts: Date.now(),
      }).catch(() => {});
      return;
    }
    if (!limits.allowed_strategies.includes(strategy)) {
      await producer?.send("orders.rejected", {
        clientOrderId: order.clientOrderId,
        userId: order.userId,
        reason: `Strategy ${strategy} is not permitted for your account`,
        ts: Date.now(),
      }).catch(() => {});
      return;
    }
  }

  if (order.quantity > limits.max_order_qty) {
    await producer?.send("orders.rejected", {
      clientOrderId: order.clientOrderId,
      userId: order.userId,
      reason:
        `Order quantity ${order.quantity} exceeds your limit of ${limits.max_order_qty}`,
      ts: Date.now(),
    }).catch(() => {});
    return;
  }

  const notional = order.quantity * (order.limitPrice ?? 0);
  if (notional > limits.max_daily_notional) {
    await producer?.send("orders.rejected", {
      clientOrderId: order.clientOrderId,
      userId: order.userId,
      reason:
        `Order notional $${notional.toLocaleString()} exceeds your daily limit of $${limits.max_daily_notional.toLocaleString()}`,
      ts: Date.now(),
    }).catch(() => {});
    return;
  }

  // Lot size validation — warn but don't hard-reject (algos may work in fractional lots)
  const lotSize = await getAssetLotSize(order.asset);
  if (lotSize > 1 && order.quantity % lotSize !== 0) {
    console.warn(
      `[oms] Order qty ${order.quantity} is not a multiple of lot size ${lotSize} for ${order.asset}`,
    );
    // Attach note to the order but do not reject
  }

  const marketType = deriveMarketType(desk, order, limits);
  const destinationVenue = deriveDestinationVenue(desk, marketType);
  const orderId = nextOrderId();
  const ts = Date.now();
  const expiresInSecs = Number(order.expiresAt ?? 0);
  const timeInForce = expiresInSecs <= 0
    ? "GTC"
    : expiresInSecs <= 60
    ? "IOC"
    : "DAY";

  const enriched = {
    orderId,
    clientOrderId: order.clientOrderId,
    userId: order.userId,
    ts,
    timeInForce,
    destinationVenue,
    accountId: "ACC-001",
    asset: order.asset,
    side: order.side,
    quantity: order.quantity,
    limitPrice: order.limitPrice,
    expiresAt: order.expiresAt,
    strategy,
    algoParams: order.algoParams ?? {},
    instrumentType: order.instrumentType ?? "equity",
    desk,
    marketType,
    bondSpec: order.bondSpec,
    optionSpec: order.optionSpec,
  };

  console.log(
    `[oms] Accepted ${strategy} order ${orderId}: ${order.side} ${order.quantity} ${order.asset} ` +
      `desk=${desk} marketType=${marketType} venue=${destinationVenue} (user=${
        order.userId ?? "unknown"
      })`,
  );

  if (order.clientOrderId) {
    activeOrders.set(order.clientOrderId, {
      orderId,
      clientOrderId: order.clientOrderId,
      userId: order.userId,
      asset: order.asset,
      strategy,
      desk,
      status: "pending",
    });
  }

  await producer?.send("orders.submitted", enriched).catch(() => {});

  if (desk === "fi") {
    // FI orders go to RFQ service — not via algo strategies
    await producer?.send("orders.fi.rfq", { ...enriched, routedAt: Date.now() })
      .catch(() => {});
    console.log(
      `[oms] Bond order ${orderId} routed to RFQ service (${order.bondSpec?.symbol})`,
    );
  } else {
    await producer?.send("orders.routed", { ...enriched, routedAt: Date.now() })
      .catch(() => {});
  }
});

killConsumer?.onMessage(async (topic, raw) => {
  const ts = Date.now();

  if (topic === "orders.kill") {
    const cmd = raw as KillCommand;
    const { scope, scopeValue, targetUserId, issuedBy, issuedByRole } = cmd;

    if (issuedByRole !== "admin" && targetUserId && targetUserId !== issuedBy) {
      console.warn(
        `[oms] Kill rejected — trader ${issuedBy} attempted to kill orders for user ${targetUserId}`,
      );
      return;
    }

    const isOwned = (order: ActiveOrder) =>
      issuedByRole === "admin" || order.userId === issuedBy;

    const toCancel: ActiveOrder[] = [];
    for (const order of activeOrders.values()) {
      if (scope === "all") {
        if (isOwned(order)) toCancel.push(order);
      } else if (scope === "user") {
        const targetId = (issuedByRole === "admin" && targetUserId)
          ? targetUserId
          : issuedBy;
        if (order.userId === targetId) toCancel.push(order);
      } else if (scope === "algo") {
        if (order.strategy === scopeValue && isOwned(order)) {
          toCancel.push(order);
        }
      } else if (scope === "market") {
        if (
          (!scopeValue || order.asset.startsWith(scopeValue) ||
            scopeValue === "*") && isOwned(order)
        ) toCancel.push(order);
      } else if (scope === "symbol") {
        if (order.asset === scopeValue && isOwned(order)) toCancel.push(order);
      }
    }

    if (toCancel.length === 0) {
      console.log(
        `[oms] Kill command from ${issuedBy}: no matching active orders (scope=${scope} scopeValue=${
          scopeValue ?? "—"
        })`,
      );
      return;
    }

    console.log(
      `[oms] Kill command from ${issuedBy} (role=${issuedByRole}): cancelling ${toCancel.length} orders`,
    );

    for (const order of toCancel) {
      activeOrders.delete(order.clientOrderId);
      await producer?.send("orders.cancelled", {
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        userId: order.userId,
        asset: order.asset,
        strategy: order.strategy,
        desk: order.desk,
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
    const {
      scope,
      scopeValue,
      targetUserId,
      resumeAt,
      issuedBy,
      issuedByRole,
    } = cmd;
    const effectiveAt = resumeAt && resumeAt > ts ? resumeAt : ts;
    const delayMs = effectiveAt - ts;

    const doResume = async () => {
      console.log(
        `[oms] Resume command from ${issuedBy} (role=${issuedByRole}): scope=${scope} scopeValue=${
          scopeValue ?? "—"
        }`,
      );
      await producer?.send("orders.resumed", {
        scope,
        scopeValue,
        targetUserId,
        issuedBy,
        issuedByRole,
        ts: Date.now(),
      }).catch(() => {});
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
      console.log(`[oms] Resume scheduled in ${delayMs}ms`);
      setTimeout(() => {
        doResume().catch(() => {});
      }, delayMs);
    } else {
      await doResume();
    }
  }
});

console.log(`[oms] Listening for orders.new on message bus`);

async function expireOrphanedOrders() {
  try {
    const res = await fetch(`${JOURNAL_URL}/orders?limit=500`);
    if (!res.ok) return;
    const orders = await res.json() as Array<{
      id: string;
      clientOrderId?: string;
      status: string;
      expiresAt: number;
      userId?: string;
    }>;
    const now = Date.now();
    for (const order of orders) {
      if (
        (order.status === "pending" || order.status === "working") &&
        order.expiresAt < now
      ) {
        await producer?.send("orders.expired", {
          orderId: order.id,
          clientOrderId: order.clientOrderId ?? order.id,
          userId: order.userId,
          ts: now,
          reason: "expired_on_oms_restart",
        }).catch(() => {});
        console.log(`[oms] Expired orphaned order ${order.id}`);
      }
    }
  } catch { /* journal may not be up yet */ }
}

setTimeout(() => {
  expireOrphanedOrders().catch(() => {});
}, 3_000);
setInterval(() => {
  expireOrphanedOrders().catch(() => {});
}, 15_000);

Deno.serve({ port: PORT }, (req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return corsOptions();
  if (url.pathname === "/health" && req.method === "GET") {
    return json({ service: "oms", version: VERSION, status: "ok" });
  }
  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});
