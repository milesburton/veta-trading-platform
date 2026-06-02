import type { CheckRequest, CheckResult, RiskConfig } from "@veta/schemas/risk";

export interface Position {
  symbol: string;
  netQty: number;
  avgPrice: number;
  costBasis: number;
  realisedPnl: number;
  fillCount: number;
}

export interface WorkingOrder {
  userId: string;
  symbol: string;
  side: "BUY" | "SELL";
  orderId: string;
}

export interface RecentOrder {
  userId: string;
  symbol: string;
  side: string;
  quantity: number;
  limitPrice: number;
  ts: number;
}

export interface RiskState {
  config: RiskConfig;
  prices: Record<string, number>;
  volumes: Record<string, number>;
  recentOrders: RecentOrder[];
  activeOrderCounts: Map<string, number>;
  workingOrders: WorkingOrder[];
  rateBuckets: Map<string, { tokens: number; lastRefill: number }>;
  positions: Map<string, Map<string, Position>>;
  onPnlBreaker?: (userId: string, observedPnl: number) => void;
  now?: () => number;
}

const RECENT_PRUNE_MS = 5_000;
export const MAX_RECENT = 500;

function now(state: RiskState): number {
  return (state.now ?? Date.now)();
}

function markPriceFor(state: RiskState, symbol: string, fallback: number): number {
  const px = state.prices[symbol];
  return px && px > 0 ? px : fallback;
}

export function userGrossNotional(state: RiskState, userId: string): number {
  const userPositions = state.positions.get(userId);
  if (!userPositions) return 0;
  let total = 0;
  for (const p of userPositions.values()) {
    total += Math.abs(p.netQty * markPriceFor(state, p.symbol, p.avgPrice));
  }
  return total;
}

export function userTotalPnl(state: RiskState, userId: string): number {
  const userPositions = state.positions.get(userId);
  if (!userPositions) return 0;
  let total = 0;
  for (const p of userPositions.values()) {
    const mark = markPriceFor(state, p.symbol, p.avgPrice);
    total += p.realisedPnl + p.netQty * (mark - p.avgPrice);
  }
  return total;
}

export function userSymbolNotional(
  state: RiskState,
  userId: string,
  symbol: string,
): number {
  const userPositions = state.positions.get(userId);
  if (!userPositions) return 0;
  const p = userPositions.get(symbol);
  if (!p) return 0;
  return Math.abs(p.netQty * markPriceFor(state, p.symbol, p.avgPrice));
}

export function orderNotional(req: CheckRequest): number {
  return req.quantity * req.limitPrice;
}

export function pruneRecent(state: RiskState): void {
  const cutoff = now(state) - RECENT_PRUNE_MS;
  while (state.recentOrders.length > 0 && state.recentOrders[0].ts < cutoff) {
    state.recentOrders.shift();
  }
  while (state.recentOrders.length > MAX_RECENT) {
    state.recentOrders.shift();
  }
}

type CheckHit = { code: string; message: string } | null;

export function checkFatFingerPrice(state: RiskState, req: CheckRequest): CheckHit {
  const mid = state.prices[req.symbol];
  if (!mid || mid <= 0) return null;
  const deviation = Math.abs(req.limitPrice - mid) / mid;
  const threshold = state.config.fatFingerPct / 100;
  if (deviation > threshold) {
    const pct = (deviation * 100).toFixed(1);
    const dir = req.limitPrice > mid ? "above" : "below";
    return {
      code: "FAT_FINGER_PRICE",
      message: `Limit price ${req.limitPrice.toFixed(2)} is ${pct}% ${dir} mid ${mid.toFixed(2)} (threshold: ${state.config.fatFingerPct}%)`,
    };
  }
  return null;
}

export function checkDuplicateOrder(state: RiskState, req: CheckRequest): CheckHit {
  pruneRecent(state);
  const t = now(state);
  const cutoff = t - state.config.duplicateWindowMs;
  for (const r of state.recentOrders) {
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
        message: `Duplicate order detected: ${req.side} ${req.quantity} ${req.symbol} @ ${req.limitPrice} within ${state.config.duplicateWindowMs}ms`,
      };
    }
  }
  state.recentOrders.push({
    userId: req.userId,
    symbol: req.symbol,
    side: req.side,
    quantity: req.quantity,
    limitPrice: req.limitPrice,
    ts: t,
  });
  return null;
}

export function checkMaxOpenOrders(state: RiskState, req: CheckRequest): CheckHit {
  const count = state.activeOrderCounts.get(req.userId) ?? 0;
  if (count >= state.config.maxOpenOrders) {
    return {
      code: "MAX_OPEN_ORDERS",
      message: `User ${req.userId} has ${count} active orders (limit: ${state.config.maxOpenOrders})`,
    };
  }
  return null;
}

export function checkSelfCross(state: RiskState, req: CheckRequest): CheckHit {
  if (state.config.selfCrossEnabled === false) return null;
  const oppositeSide = req.side === "BUY" ? "SELL" : "BUY";
  const conflict = state.workingOrders.find(
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

export function checkOrderSizeVsAdv(state: RiskState, req: CheckRequest): CheckHit {
  const adv = state.volumes[req.symbol];
  if (!adv || adv <= 0) return null;
  const pctOfAdv = (req.quantity / adv) * 100;
  if (pctOfAdv > state.config.maxAdvPct) {
    return {
      code: "ORDER_SIZE_VS_ADV",
      message: `Order quantity ${req.quantity.toLocaleString()} is ${pctOfAdv.toFixed(1)}% of ADV ${adv.toLocaleString()} (limit: ${state.config.maxAdvPct}%)`,
    };
  }
  return null;
}

export function checkRateLimit(state: RiskState, req: CheckRequest): CheckHit {
  const t = now(state);
  let bucket = state.rateBuckets.get(req.userId);
  if (!bucket) {
    bucket = { tokens: state.config.maxOrdersPerSecond, lastRefill: t };
    state.rateBuckets.set(req.userId, bucket);
  }
  const elapsed = (t - bucket.lastRefill) / 1_000;
  bucket.tokens = Math.min(
    state.config.maxOrdersPerSecond,
    bucket.tokens + elapsed * state.config.maxOrdersPerSecond,
  );
  bucket.lastRefill = t;
  if (bucket.tokens < 1) {
    return {
      code: "RATE_LIMIT",
      message: `Rate limit exceeded: max ${state.config.maxOrdersPerSecond} orders/second for user ${req.userId}`,
    };
  }
  bucket.tokens -= 1;
  return null;
}

export function checkPositionNotional(state: RiskState, req: CheckRequest): CheckHit {
  const proposed = orderNotional(req);
  const current = userGrossNotional(state, req.userId);
  const postTrade = current + proposed;
  if (postTrade > state.config.maxGrossNotional) {
    return {
      code: "POSITION_NOTIONAL_LIMIT",
      message: `Gross notional post-trade $${postTrade.toFixed(0)} would exceed limit $${state.config.maxGrossNotional.toFixed(0)}`,
    };
  }
  return null;
}

export function checkDailyPnlStop(state: RiskState, req: CheckRequest): CheckHit {
  const pnl = userTotalPnl(state, req.userId);
  if (pnl <= state.config.maxDailyLoss) {
    state.onPnlBreaker?.(req.userId, pnl);
    return {
      code: "DAILY_LOSS_STOP",
      message: `User P&L $${pnl.toFixed(2)} at/beyond loss limit $${state.config.maxDailyLoss.toFixed(2)}`,
    };
  }
  return null;
}

export function checkConcentration(state: RiskState, req: CheckRequest): CheckHit {
  const proposed = orderNotional(req);
  const currentSymbol = userSymbolNotional(state, req.userId, req.symbol);
  const currentGross = userGrossNotional(state, req.userId);
  const postSymbol = currentSymbol + proposed;
  const postGross = currentGross + proposed;
  if (postGross <= 0) return null;
  const pct = (postSymbol / postGross) * 100;
  if (pct > state.config.maxConcentrationPct) {
    return {
      code: "CONCENTRATION_LIMIT",
      message: `Post-trade concentration in ${req.symbol} would be ${pct.toFixed(1)}% (limit ${state.config.maxConcentrationPct}%)`,
    };
  }
  return null;
}

export function checkMaxPositionSize(state: RiskState, req: CheckRequest): CheckHit {
  const proposed = orderNotional(req);
  const currentSymbol = userSymbolNotional(state, req.userId, req.symbol);
  const postSymbol = currentSymbol + proposed;

  if (postSymbol > state.config.maxGrossNotional) {
    return {
      code: "MAX_POSITION_SIZE",
      message: `Position in ${req.symbol} would exceed max gross notional $${state.config.maxGrossNotional.toFixed(0)}`,
    };
  }

  return null;
}

export function runChecks(state: RiskState, req: CheckRequest): CheckResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const checks: Array<(s: RiskState, r: CheckRequest) => CheckHit> = [
    checkFatFingerPrice,
    checkDuplicateOrder,
    checkMaxOpenOrders,
    checkSelfCross,
    checkOrderSizeVsAdv,
    checkRateLimit,
    checkPositionNotional,
    checkDailyPnlStop,
    checkConcentration,
    checkMaxPositionSize,
  ];
  for (const check of checks) {
    const hit = check(state, req);
    if (hit) reasons.push(`[${hit.code}] ${hit.message}`);
  }
  return {
    allowed: reasons.length === 0,
    reasons,
    warnings,
  };
}
