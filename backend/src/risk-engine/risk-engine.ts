import "@veta/bootstrap";
import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { corsOptions, json, parseBody } from "@veta/http";
import { logger } from "@veta/logger";
import { createConsumer, createProducer, type MsgProducer } from "@veta/messaging";
import {
  CheckRequestSchema,
  type RiskConfig,
  RiskConfigUpdateSchema,
  TestPositionSchema,
  TestTickSchema,
} from "@veta/schemas/risk";
import {
  type Position,
  type RecentOrder,
  type RiskState,
  runChecks,
  userTotalPnl,
  type WorkingOrder,
} from "./checks.ts";
import { createConfigStore } from "./configStore.ts";

const PORT = Number(Deno.env.get("RISK_ENGINE_PORT")) || 5_032;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const TEST_MODE = Deno.env.get("RISK_ENGINE_TEST_MODE") === "1";

const config: RiskConfig = {
  fatFingerPct: 5.0,
  maxOpenOrders: 50,
  duplicateWindowMs: 500,
  maxOrdersPerSecond: 10,
  maxAdvPct: 10.0,
  maxGrossNotional: 5_000_000,
  maxDailyLoss: -50_000,
  maxConcentrationPct: 25,
  haltMovePercent: 10,
  breakerCooldownMs: 60_000,
  breakersEnabled: true,
  selfCrossEnabled: true,
};

const configStore = createConfigStore(config);

if (!TEST_MODE) {
  configStore.load().then(() => {
    Object.assign(config, configStore.current().config);
  });
}

const prices: Record<string, number> = {};
const volumes: Record<string, number> = {};
const openPrices: Record<string, number> = {};

interface BreakerFire {
  type: "market-move" | "user-pnl";
  scope: "symbol" | "user";
  target: string;
  observedValue: number;
  threshold: number;
  firedAt: number;
}
const breakerCooldown = new Map<string, number>();
const breakerHistory: BreakerFire[] = [];
const BREAKER_HISTORY_MAX = 200;
let breakerFireCount = 0;
let breakerProducer: MsgProducer | null = null;

const activeOrderCounts: Map<string, number> = new Map();
const workingOrders: WorkingOrder[] = [];
const rateBuckets: Map<string, { tokens: number; lastRefill: number }> = new Map();
const positions: Map<string, Map<string, Position>> = new Map();
const recentOrders: RecentOrder[] = [];

const riskState: RiskState = {
  config,
  prices,
  volumes,
  recentOrders,
  activeOrderCounts,
  workingOrders,
  rateBuckets,
  positions,
  onPnlBreaker: (userId, observedPnl) => fireUserPnlBreaker(userId, observedPnl),
};

async function fetchPrices(): Promise<void> {
  try {
    const res = await fetch(`http://${MARKET_SIM_HOST}:${MARKET_SIM_PORT}/assets`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (res.ok) {
      const assets = (await res.json()) as Array<{
        symbol: string;
        price?: number;
        initialPrice?: number;
        volume?: number;
        dailyVolume?: number;
      }>;
      for (const a of assets) {
        const p = a.price ?? a.initialPrice ?? 0;
        if (p > 0) prices[a.symbol] = p;
        const v = a.volume ?? a.dailyVolume ?? 0;
        if (v > 0) volumes[a.symbol] = v;
      }
    }
  } catch {
    // best-effort
  }
}

function trackOrderCounts() {
  // Stable group id (not timestamped) so each restart rejoins the same
  // Kafka group instead of orphaning the previous one. Orphan groups never
  // commit their offset again, so Redpanda's reported "lag" against them
  // grows unboundedly and trips the RedpandaConsumerLagSustained alert.
  createConsumer("risk-engine-orders", [
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

          const idx = workingOrders.findIndex((o) => o.userId === userId && o.orderId === orderId);
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
            msg.avgFillPrice
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
  price: number
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
    prevNetQty !== 0 && ((prevNetQty > 0 && signedQty < 0) || (prevNetQty < 0 && signedQty > 0));

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

function tryFireBreaker(type: "market-move" | "user-pnl", target: string): boolean {
  const key = `${type}:${target}`;
  const last = breakerCooldown.get(key) ?? 0;
  const now = Date.now();
  if (now - last < config.breakerCooldownMs) return false;
  breakerCooldown.set(key, now);
  return true;
}

function recordBreakerFire(fire: BreakerFire): void {
  breakerHistory.unshift(fire);
  if (breakerHistory.length > BREAKER_HISTORY_MAX) breakerHistory.length = BREAKER_HISTORY_MAX;
  breakerFireCount += 1;
}

function fireMarketMoveBreaker(symbol: string, observedPct: number): void {
  if (!tryFireBreaker("market-move", symbol)) return;
  const ts = Date.now();
  recordBreakerFire({
    type: "market-move",
    scope: "symbol",
    target: symbol,
    observedValue: observedPct,
    threshold: config.haltMovePercent,
    firedAt: ts,
  });
  const killPayload = {
    scope: "symbol",
    scopeValue: symbol,
    issuedBy: "circuit-breaker",
    issuedByRole: "admin",
    ts,
  };
  const breakerPayload = {
    type: "market-move",
    scope: "symbol",
    scopeValue: symbol,
    observedValue: observedPct,
    threshold: config.haltMovePercent,
    ts,
  };
  breakerProducer?.send("orders.kill", killPayload).catch(() => {});
  breakerProducer?.send("risk.breaker", breakerPayload).catch(() => {});
  logger.info(
    `Market-move breaker fired for ${symbol}: ${observedPct.toFixed(
      1
    )}% > ${config.haltMovePercent}%`
  );
}

function fireUserPnlBreaker(userId: string, observedPnl: number): void {
  if (!tryFireBreaker("user-pnl", userId)) return;
  const ts = Date.now();
  recordBreakerFire({
    type: "user-pnl",
    scope: "user",
    target: userId,
    observedValue: observedPnl,
    threshold: config.maxDailyLoss,
    firedAt: ts,
  });
  const killPayload = {
    scope: "user",
    targetUserId: userId,
    issuedBy: "circuit-breaker",
    issuedByRole: "admin",
    ts,
  };
  const breakerPayload = {
    type: "user-pnl",
    scope: "user",
    targetUserId: userId,
    observedValue: observedPnl,
    threshold: config.maxDailyLoss,
    ts,
  };
  breakerProducer?.send("orders.kill", killPayload).catch(() => {});
  breakerProducer?.send("risk.breaker", breakerPayload).catch(() => {});
  logger.info(
    `User P&L breaker fired for ${userId}: $${observedPnl.toFixed(
      2
    )} <= $${config.maxDailyLoss.toFixed(2)}`
  );
}

function evaluateMarketMoveBreaker(): void {
  for (const [symbol, price] of Object.entries(prices)) {
    const open = openPrices[symbol];
    if (!open || open <= 0) continue;
    const movePct = Math.abs((price - open) / open) * 100;
    if (movePct > config.haltMovePercent) {
      fireMarketMoveBreaker(symbol, movePct);
    }
  }
}

function evaluateUserPnlBreakers(): void {
  for (const userId of positions.keys()) {
    const pnl = userTotalPnl(riskState, userId);
    if (pnl <= config.maxDailyLoss) fireUserPnlBreaker(userId, pnl);
  }
}

function evaluateBreakers(): void {
  if (!config.breakersEnabled) return;
  evaluateMarketMoveBreaker();
  evaluateUserPnlBreakers();
}

function consumeMarketTicks(): void {
  // Stable group id (not timestamped) — see trackOrderCounts() above.
  createConsumer("risk-engine-ticks", ["market.ticks"])
    .then((consumer) => {
      consumer.onMessage((_topic, raw) => {
        const tick = raw as {
          prices?: Record<string, number>;
          openPrices?: Record<string, number>;
          volumes?: Record<string, number>;
        };
        if (tick.prices) {
          for (const [s, p] of Object.entries(tick.prices)) {
            if (p > 0) prices[s] = p;
          }
        }
        if (tick.openPrices) {
          for (const [s, p] of Object.entries(tick.openPrices)) {
            if (p > 0) openPrices[s] = p;
          }
        }
        if (tick.volumes) {
          for (const [s, v] of Object.entries(tick.volumes)) {
            if (v > 0) volumes[s] = v;
          }
        }
        evaluateBreakers();
      });
    })
    .catch(() => {});
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
consumeMarketTicks();
createProducer("risk-engine")
  .then((p) => {
    breakerProducer = p;
  })
  .catch((err) => {
    logger.warn("producer init failed", { err: err as Error });
  });

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
      openPricesTracked: Object.keys(openPrices).length,
      activeUsers: activeOrderCounts.size,
      workingOrders: workingOrders.length,
      positionsTracked: positions.size,
      breakerFireCount,
      config,
    });
  }

  if (path === "/breakers" && req.method === "GET") {
    const now = Date.now();
    const active: Array<{
      key: string;
      type: "market-move" | "user-pnl";
      target: string;
      firedAt: number;
      expiresAt: number;
    }> = [];
    for (const [key, firedAt] of breakerCooldown) {
      const expiresAt = firedAt + config.breakerCooldownMs;
      if (expiresAt > now) {
        const [type, ...targetParts] = key.split(":");
        active.push({
          key,
          type: type as "market-move" | "user-pnl",
          target: targetParts.join(":"),
          firedAt,
          expiresAt,
        });
      }
    }
    return json({
      active,
      history: breakerHistory,
      fireCount: breakerFireCount,
      config: {
        cooldownMs: config.breakerCooldownMs,
        enabled: config.breakersEnabled,
        haltMovePercent: config.haltMovePercent,
        maxDailyLoss: config.maxDailyLoss,
      },
    });
  }

  if (TEST_MODE && path === "/test/positions" && req.method === "POST") {
    const parsed = await parseBody(req, TestPositionSchema);
    if (!parsed.ok) return parsed.res;
    const body = parsed.data;
    let userPositions = positions.get(body.userId);
    if (!userPositions) {
      userPositions = new Map();
      positions.set(body.userId, userPositions);
    }
    userPositions.set(body.symbol, {
      symbol: body.symbol,
      netQty: body.netQty,
      avgPrice: body.avgPrice,
      costBasis: body.netQty * body.avgPrice,
      realisedPnl: body.realisedPnl ?? 0,
      fillCount: 1,
    });
    return json({ ok: true });
  }

  if (TEST_MODE && path === "/test/positions/reset" && req.method === "POST") {
    positions.clear();
    breakerCooldown.clear();
    breakerHistory.length = 0;
    breakerFireCount = 0;
    return json({ ok: true });
  }

  if (TEST_MODE && path === "/test/tick" && req.method === "POST") {
    const parsed = await parseBody(req, TestTickSchema);
    if (!parsed.ok) return parsed.res;
    const body = parsed.data;
    if (body.prices) {
      for (const [s, p] of Object.entries(body.prices)) if (p > 0) prices[s] = p;
    }
    if (body.openPrices) {
      for (const [s, p] of Object.entries(body.openPrices)) if (p > 0) openPrices[s] = p;
    }
    evaluateBreakers();
    return json({ ok: true, fireCount: breakerFireCount });
  }

  if (path === "/config" && req.method === "GET") {
    return json({ ...config, version: configStore.versionId() });
  }

  if (path === "/config/history" && req.method === "GET") {
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? "50");
    const history = await configStore.history(Math.min(Math.max(limit, 1), 200));
    return json({ history });
  }

  if (path === "/config" && req.method === "PUT") {
    const parsed = await parseBody(req, RiskConfigUpdateSchema);
    if (!parsed.ok) return parsed.res;
    const body = parsed.data;
    if (body.maxDailyLoss !== undefined && body.maxDailyLoss >= 0) {
      return json({ error: "maxDailyLoss must be negative" }, 400);
    }

    const next: RiskConfig = { ...config };
    if (body.fatFingerPct !== undefined) next.fatFingerPct = Math.max(0.1, body.fatFingerPct);
    if (body.maxOpenOrders !== undefined) next.maxOpenOrders = Math.max(1, body.maxOpenOrders);
    if (body.duplicateWindowMs !== undefined)
      next.duplicateWindowMs = Math.max(50, body.duplicateWindowMs);
    if (body.maxOrdersPerSecond !== undefined)
      next.maxOrdersPerSecond = Math.max(1, body.maxOrdersPerSecond);
    if (body.maxAdvPct !== undefined) next.maxAdvPct = Math.max(0.1, body.maxAdvPct);
    if (body.maxGrossNotional !== undefined)
      next.maxGrossNotional = Math.max(0, body.maxGrossNotional);
    if (body.maxDailyLoss !== undefined) next.maxDailyLoss = body.maxDailyLoss;
    if (body.maxConcentrationPct !== undefined) {
      next.maxConcentrationPct = Math.min(100, Math.max(1, body.maxConcentrationPct));
    }
    if (body.haltMovePercent !== undefined)
      next.haltMovePercent = Math.max(0.1, body.haltMovePercent);
    if (body.breakerCooldownMs !== undefined) {
      next.breakerCooldownMs = Math.max(1_000, body.breakerCooldownMs);
    }
    if (body.breakersEnabled !== undefined) next.breakersEnabled = body.breakersEnabled;
    if (body.selfCrossEnabled !== undefined) next.selfCrossEnabled = body.selfCrossEnabled;

    if (TEST_MODE) {
      Object.assign(config, next);
      return json({ ...config, version: 0 });
    }

    const url = new URL(req.url);
    const createdBy = url.searchParams.get("by") ?? req.headers.get("x-veta-user") ?? "unknown";
    const reason = url.searchParams.get("reason") ?? undefined;
    const version = await configStore.save(next, { createdBy, reason });
    Object.assign(config, version.config);
    return json({ ...config, version: version.id });
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
    const parsed = await parseBody(req, CheckRequestSchema);
    if (!parsed.ok) return parsed.res;
    const result = runChecks(riskState, parsed.data);
    return json({ ...result, riskConfigVersion: configStore.versionId() });
  }

  return json({ error: "Not Found" }, 404);
});

logger.info(`Listening on port ${PORT}`);
