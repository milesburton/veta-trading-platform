import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createConsumer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("RISK_ENGINE_PORT")) || 5_032;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";

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

interface RiskConfig {
  fatFingerPct: number;
  maxOpenOrders: number;
  duplicateWindowMs: number;
}

const config: RiskConfig = {
  fatFingerPct: 5.0,
  maxOpenOrders: 50,
  duplicateWindowMs: 500,
};

interface CheckRequest {
  orderId?: string;
  userId: string;
  userRole?: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  strategy?: string;
  instrumentType?: string;
}

interface CheckResult {
  allowed: boolean;
  reasons: string[];
  warnings: string[];
}

const prices: Record<string, number> = {};

const activeOrderCounts: Map<string, number> = new Map();

interface RecentOrder {
  userId: string;
  symbol: string;
  side: string;
  quantity: number;
  limitPrice: number;
  ts: number;
}
const recentOrders: RecentOrder[] = [];
const MAX_RECENT = 500;

function pruneRecent() {
  const cutoff = Date.now() - 5_000;
  while (recentOrders.length > 0 && recentOrders[0].ts < cutoff) {
    recentOrders.shift();
  }
  while (recentOrders.length > MAX_RECENT) {
    recentOrders.shift();
  }
}

function checkFatFingerPrice(req: CheckRequest): { code: string; message: string } | null {
  const mid = prices[req.symbol];
  if (!mid || mid <= 0) return null;

  const deviation = Math.abs(req.limitPrice - mid) / mid;
  const threshold = config.fatFingerPct / 100;

  if (deviation > threshold) {
    const pct = (deviation * 100).toFixed(1);
    const dir = req.limitPrice > mid ? "above" : "below";
    return {
      code: "FAT_FINGER_PRICE",
      message: `Limit price ${req.limitPrice.toFixed(2)} is ${pct}% ${dir} mid ${mid.toFixed(2)} (threshold: ${config.fatFingerPct}%)`,
    };
  }
  return null;
}

function checkDuplicateOrder(req: CheckRequest): { code: string; message: string } | null {
  pruneRecent();
  const now = Date.now();
  const cutoff = now - config.duplicateWindowMs;

  for (const r of recentOrders) {
    if (
      r.ts >= cutoff &&
      r.userId === req.userId &&
      r.symbol === req.symbol &&
      r.side === req.side &&
      r.quantity === req.quantity &&
      r.limitPrice === req.limitPrice
    ) {
      return {
        code: "DUPLICATE_ORDER",
        message: `Duplicate order detected: ${req.side} ${req.quantity} ${req.symbol} @ ${req.limitPrice} within ${config.duplicateWindowMs}ms`,
      };
    }
  }

  recentOrders.push({
    userId: req.userId,
    symbol: req.symbol,
    side: req.side,
    quantity: req.quantity,
    limitPrice: req.limitPrice,
    ts: now,
  });

  return null;
}

function checkMaxOpenOrders(req: CheckRequest): { code: string; message: string } | null {
  const count = activeOrderCounts.get(req.userId) ?? 0;
  if (count >= config.maxOpenOrders) {
    return {
      code: "MAX_OPEN_ORDERS",
      message: `User ${req.userId} has ${count} active orders (limit: ${config.maxOpenOrders})`,
    };
  }
  return null;
}

function runChecks(req: CheckRequest): CheckResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const fatFinger = checkFatFingerPrice(req);
  if (fatFinger) reasons.push(`[${fatFinger.code}] ${fatFinger.message}`);

  const duplicate = checkDuplicateOrder(req);
  if (duplicate) reasons.push(`[${duplicate.code}] ${duplicate.message}`);

  const maxOrders = checkMaxOpenOrders(req);
  if (maxOrders) reasons.push(`[${maxOrders.code}] ${maxOrders.message}`);

  return {
    allowed: reasons.length === 0,
    reasons,
    warnings,
  };
}

async function fetchPrices(): Promise<void> {
  try {
    const res = await fetch(
      `http://${MARKET_SIM_HOST}:${MARKET_SIM_PORT}/assets`,
      { signal: AbortSignal.timeout(3_000) },
    );
    if (res.ok) {
      const assets = (await res.json()) as Array<{ symbol: string; price: number }>;
      for (const a of assets) {
        if (a.price > 0) prices[a.symbol] = a.price;
      }
    }
  } catch {
    // best-effort
  }
}

function trackOrderCounts() {
  createConsumer(`risk-engine-orders-${Date.now()}`, [
    "orders.submitted",
    "orders.filled",
    "orders.expired",
    "orders.rejected",
    "orders.cancelled",
  ])
    .then((consumer) => {
      consumer.onMessage((topic, raw) => {
        const msg = raw as { userId?: string; clientOrderId?: string };
        const userId = msg.userId;
        if (!userId) return;

        if (topic === "orders.submitted") {
          activeOrderCounts.set(userId, (activeOrderCounts.get(userId) ?? 0) + 1);
        } else {
          const count = activeOrderCounts.get(userId) ?? 0;
          if (count > 0) activeOrderCounts.set(userId, count - 1);
        }
      });
    })
    .catch(() => {});
}

fetchPrices();
setInterval(fetchPrices, 5_000);
trackOrderCounts();

Deno.serve({ port: PORT }, async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  if (path === "/health" && req.method === "GET") {
    return json({
      service: "risk-engine",
      version: VERSION,
      status: "ok",
      pricesTracked: Object.keys(prices).length,
      activeUsers: activeOrderCounts.size,
      config,
    });
  }

  if (path === "/config" && req.method === "GET") {
    return json(config);
  }

  if (path === "/config" && req.method === "PUT") {
    try {
      const body = (await req.json()) as Partial<RiskConfig>;
      if (body.fatFingerPct !== undefined) config.fatFingerPct = Math.max(0.1, body.fatFingerPct);
      if (body.maxOpenOrders !== undefined) config.maxOpenOrders = Math.max(1, body.maxOpenOrders);
      if (body.duplicateWindowMs !== undefined) config.duplicateWindowMs = Math.max(50, body.duplicateWindowMs);
      return json(config);
    } catch {
      return json({ error: "invalid json" }, 400);
    }
  }

  if (path === "/check" && req.method === "POST") {
    try {
      const body = (await req.json()) as CheckRequest;
      if (!body.userId || !body.symbol || !body.side || !body.quantity || !body.limitPrice) {
        return json({ error: "missing required fields" }, 400);
      }
      const result = runChecks(body);
      return json(result);
    } catch {
      return json({ error: "invalid json" }, 400);
    }
  }

  return new Response("Not Found", { status: 404, headers: CORS });
});

console.log(`[risk-engine] Listening on port ${PORT}`);
