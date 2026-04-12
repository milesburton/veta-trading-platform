import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { corsOptions, json } from "../lib/http.ts";
import { createConsumer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("RISK_ENGINE_PORT")) || 5_032;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";

interface RiskConfig {
  fatFingerPct: number;
  maxOpenOrders: number;
  duplicateWindowMs: number;
  maxOrdersPerSecond: number;
  maxAdvPct: number;
}

const config: RiskConfig = {
  fatFingerPct: 5.0,
  maxOpenOrders: 50,
  duplicateWindowMs: 500,
  maxOrdersPerSecond: 10,
  maxAdvPct: 10.0,
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
const volumes: Record<string, number> = {};

const activeOrderCounts: Map<string, number> = new Map();

interface WorkingOrder {
  userId: string;
  symbol: string;
  side: "BUY" | "SELL";
  orderId: string;
}
const workingOrders: WorkingOrder[] = [];

const rateBuckets: Map<string, { tokens: number; lastRefill: number }> = new Map();

interface Position {
  symbol: string;
  netQty: number;
  avgPrice: number;
  costBasis: number;
  realisedPnl: number;
  fillCount: number;
}
const positions: Map<string, Map<string, Position>> = new Map();

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

function checkSelfCross(req: CheckRequest): { code: string; message: string } | null {
  const oppositeSide = req.side === "BUY" ? "SELL" : "BUY";
  const conflict = workingOrders.find(
    (o) => o.userId === req.userId && o.symbol === req.symbol && o.side === oppositeSide,
  );
  if (conflict) {
    return {
      code: "SELF_CROSS",
      message: `Self-cross: you have a working ${oppositeSide} on ${req.symbol} (${conflict.orderId}) — submitting a ${req.side} would cross your own order`,
    };
  }
  return null;
}

function checkOrderSizeVsAdv(req: CheckRequest): { code: string; message: string } | null {
  const adv = volumes[req.symbol];
  if (!adv || adv <= 0) return null;

  const pctOfAdv = (req.quantity / adv) * 100;
  if (pctOfAdv > config.maxAdvPct) {
    return {
      code: "ORDER_SIZE_VS_ADV",
      message: `Order quantity ${req.quantity.toLocaleString()} is ${pctOfAdv.toFixed(1)}% of ADV ${adv.toLocaleString()} (limit: ${config.maxAdvPct}%)`,
    };
  }
  return null;
}

function checkRateLimit(req: CheckRequest): { code: string; message: string } | null {
  const now = Date.now();
  let bucket = rateBuckets.get(req.userId);
  if (!bucket) {
    bucket = { tokens: config.maxOrdersPerSecond, lastRefill: now };
    rateBuckets.set(req.userId, bucket);
  }

  const elapsed = (now - bucket.lastRefill) / 1_000;
  bucket.tokens = Math.min(config.maxOrdersPerSecond, bucket.tokens + elapsed * config.maxOrdersPerSecond);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    return {
      code: "RATE_LIMIT",
      message: `Rate limit exceeded: max ${config.maxOrdersPerSecond} orders/second for user ${req.userId}`,
    };
  }

  bucket.tokens -= 1;
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

  const selfCross = checkSelfCross(req);
  if (selfCross) reasons.push(`[${selfCross.code}] ${selfCross.message}`);

  const advCheck = checkOrderSizeVsAdv(req);
  if (advCheck) reasons.push(`[${advCheck.code}] ${advCheck.message}`);

  const rateLimit = checkRateLimit(req);
  if (rateLimit) reasons.push(`[${rateLimit.code}] ${rateLimit.message}`);

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
      const assets = (await res.json()) as Array<{
        symbol: string;
        price: number;
        volume?: number;
      }>;
      for (const a of assets) {
        if (a.price > 0) prices[a.symbol] = a.price;
        if (a.volume && a.volume > 0) volumes[a.symbol] = a.volume;
      }
    }
  } catch {
    // best-effort
  }
}

function trackOrderCounts() {
  createConsumer(`risk-engine-orders-${Date.now()}`, [
    "orders.submitted",
    "orders.routed",
    "orders.filled",
    "orders.expired",
    "orders.rejected",
    "orders.cancelled",
  ])
    .then((consumer) => {
      consumer.onMessage((topic, raw) => {
        const msg = raw as {
          userId?: string;
          clientOrderId?: string;
          orderId?: string;
          asset?: string;
          symbol?: string;
          side?: string;
          filledQty?: number;
          avgFillPrice?: number;
          quantity?: number;
        };
        const userId = msg.userId;
        if (!userId) return;
        const symbol = msg.asset ?? msg.symbol;
        const orderId = msg.orderId ?? msg.clientOrderId ?? "";

        if (topic === "orders.submitted") {
          activeOrderCounts.set(userId, (activeOrderCounts.get(userId) ?? 0) + 1);
        } else if (
          topic === "orders.filled" ||
          topic === "orders.expired" ||
          topic === "orders.rejected" ||
          topic === "orders.cancelled"
        ) {
          const count = activeOrderCounts.get(userId) ?? 0;
          if (count > 0) activeOrderCounts.set(userId, count - 1);

          const idx = workingOrders.findIndex(
            (o) => o.userId === userId && o.orderId === orderId,
          );
          if (idx >= 0) workingOrders.splice(idx, 1);
        }

        if (topic === "orders.routed" && symbol && msg.side) {
          workingOrders.push({
            userId,
            symbol,
            side: msg.side as "BUY" | "SELL",
            orderId,
          });
        }

        if (topic === "orders.filled" && symbol && msg.filledQty && msg.avgFillPrice) {
          updatePosition(
            userId,
            symbol,
            msg.side as "BUY" | "SELL",
            msg.filledQty,
            msg.avgFillPrice,
          );
        }
      });
    })
    .catch(() => {});
}

function updatePosition(
  userId: string,
  symbol: string,
  side: "BUY" | "SELL",
  qty: number,
  price: number,
): void {
  let userPositions = positions.get(userId);
  if (!userPositions) {
    userPositions = new Map();
    positions.set(userId, userPositions);
  }
  let pos = userPositions.get(symbol);
  if (!pos) {
    pos = { symbol, netQty: 0, avgPrice: 0, costBasis: 0, realisedPnl: 0, fillCount: 0 };
    userPositions.set(symbol, pos);
  }

  pos.fillCount += 1;
  const signedQty = side === "BUY" ? qty : -qty;
  const prevNetQty = pos.netQty;

  const isReducing =
    prevNetQty !== 0 &&
    ((prevNetQty > 0 && signedQty < 0) || (prevNetQty < 0 && signedQty > 0));

  if (isReducing) {
    const closedQty = Math.min(Math.abs(signedQty), Math.abs(prevNetQty));
    pos.realisedPnl += closedQty * (price - pos.avgPrice) * (prevNetQty > 0 ? 1 : -1);
  }

  pos.netQty += signedQty;

  if (pos.netQty === 0) {
    pos.avgPrice = 0;
    pos.costBasis = 0;
  } else if (prevNetQty !== 0 && Math.sign(prevNetQty) !== Math.sign(pos.netQty)) {
    pos.avgPrice = price;
    pos.costBasis = pos.netQty * price;
  } else if (!isReducing) {
    pos.costBasis += signedQty * price;
    pos.avgPrice = Math.abs(pos.costBasis / pos.netQty);
  }
}

function formatPosition(p: Position) {
  const mark = prices[p.symbol] ?? p.avgPrice;
  const unrealisedPnl = p.netQty * (mark - p.avgPrice);
  return {
    symbol: p.symbol,
    netQty: p.netQty,
    avgPrice: Number(p.avgPrice.toFixed(4)),
    costBasis: Number(p.costBasis.toFixed(2)),
    markPrice: Number(mark.toFixed(4)),
    unrealisedPnl: Number(unrealisedPnl.toFixed(2)),
    realisedPnl: Number(p.realisedPnl.toFixed(2)),
    totalPnl: Number((unrealisedPnl + p.realisedPnl).toFixed(2)),
    fillCount: p.fillCount,
  };
}

fetchPrices();
setInterval(fetchPrices, 5_000);
trackOrderCounts();

Deno.serve({ port: PORT }, async (req) => {
  if (req.method === "OPTIONS") {
    return corsOptions();
  }

  const url = new URL(req.url);
  const path = url.pathname;

  if (path === "/health" && req.method === "GET") {
    return json({
      service: "risk-engine",
      version: VERSION,
      status: "ok",
      pricesTracked: Object.keys(prices).length,
      volumesTracked: Object.keys(volumes).length,
      activeUsers: activeOrderCounts.size,
      workingOrders: workingOrders.length,
      positionsTracked: positions.size,
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
      if (body.maxOrdersPerSecond !== undefined) config.maxOrdersPerSecond = Math.max(1, body.maxOrdersPerSecond);
      if (body.maxAdvPct !== undefined) config.maxAdvPct = Math.max(0.1, body.maxAdvPct);
      return json(config);
    } catch {
      return json({ error: "invalid json" }, 400);
    }
  }

  const positionsMatch = path.match(/^\/positions\/([^/]+)$/);
  if (positionsMatch && req.method === "GET") {
    const userId = positionsMatch[1];
    const userPositions = positions.get(userId);
    if (!userPositions || userPositions.size === 0) {
      return json({ userId, positions: [] });
    }
    const posArr = [...userPositions.values()].map((p) => formatPosition(p));
    return json({ userId, positions: posArr });
  }

  if (path === "/positions" && req.method === "GET") {
    const allPositions: Record<
      string,
      Array<{
        symbol: string;
        netQty: number;
        avgPrice: number;
        markPrice: number;
        unrealisedPnl: number;
      }>
    > = {};
    for (const [userId, userPos] of positions) {
      allPositions[userId] = [...userPos.values()].map((p) => formatPosition(p));
    }
    return json({ positions: allPositions });
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

  return json({ error: "Not Found" }, 404);
});

console.log(`[risk-engine] Listening on port ${PORT}`);
