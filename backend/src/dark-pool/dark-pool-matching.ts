export interface DarkOrder {
  orderId: string;
  clientOrderId?: string;
  userId?: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  remainingQty: number;
  limitPrice: number;
  admittedAt: number;
  deadlineAt: number;
  strategy: string;
  algoParams?: Record<string, unknown>;
  desk?: string;
}

export interface SymbolPool {
  buys: DarkOrder[];
  sells: DarkOrder[];
}

export interface DarkFill {
  execId: string;
  buyOrderId: string;
  sellOrderId: string;
  buyClientOrderId?: string;
  sellClientOrderId?: string;
  buyUserId?: string;
  sellUserId?: string;
  asset: string;
  matchedQty: number;
  midPrice: number;
  settlementDate: string;
  ts: number;
}

/**
 * FIFO midpoint matching for one symbol's dark pool. Price is not used
 * for priority — every match crosses at the current midpoint — only
 * admission time and eligibility (does the resting order's limit allow a
 * trade at midPrice) determine who matches. Mutates `pool` in place
 * (filters out orders left with zero remaining quantity, same as the
 * order book itself), and returns the fills generated this cycle.
 *
 * `execIdFactory` and `settlementDateFactory` are injected rather than
 * imported directly so this function has no I/O or global-counter
 * dependency of its own — callers supply their own id/date generation
 * (a monotonic counter and settlementDate("equity") in production, fixed
 * values in tests).
 */
export function matchSymbol(
  pool: SymbolPool,
  asset: string,
  midPrice: number,
  now: number,
  execIdFactory: () => string,
  settlementDateFactory: () => string
): DarkFill[] {
  pool.buys.sort((a, b) => a.admittedAt - b.admittedAt);
  pool.sells.sort((a, b) => a.admittedAt - b.admittedAt);

  const fills: DarkFill[] = [];

  let bi = 0;
  let si = 0;

  while (bi < pool.buys.length && si < pool.sells.length) {
    const buy = pool.buys[bi];
    const sell = pool.sells[si];

    if (now >= buy.deadlineAt) {
      bi++;
      continue;
    }
    if (now >= sell.deadlineAt) {
      si++;
      continue;
    }

    const buyEligible = buy.limitPrice >= midPrice;
    const sellEligible = sell.limitPrice <= midPrice;

    if (!buyEligible) {
      bi++;
      continue;
    }
    if (!sellEligible) {
      si++;
      continue;
    }

    const matchedQty = Math.min(buy.remainingQty, sell.remainingQty);
    if (matchedQty <= 0) {
      if (buy.remainingQty <= 0) bi++;
      if (sell.remainingQty <= 0) si++;
      continue;
    }

    buy.remainingQty -= matchedQty;
    sell.remainingQty -= matchedQty;

    fills.push({
      execId: execIdFactory(),
      buyOrderId: buy.orderId,
      sellOrderId: sell.orderId,
      buyClientOrderId: buy.clientOrderId,
      sellClientOrderId: sell.clientOrderId,
      buyUserId: buy.userId,
      sellUserId: sell.userId,
      asset,
      matchedQty,
      midPrice,
      settlementDate: settlementDateFactory(),
      ts: now,
    });

    if (buy.remainingQty <= 0) bi++;
    if (sell.remainingQty <= 0) si++;
  }

  pool.buys = pool.buys.filter((o) => o.remainingQty > 0);
  pool.sells = pool.sells.filter((o) => o.remainingQty > 0);

  return fills;
}

/** Builds the orders.filled payload for one side of a dark-pool match. Dark pool trades carry no market impact or fees by construction. */
export function buildOrdersFilled(
  fill: DarkFill,
  side: "BUY" | "SELL",
  order: DarkOrder
): Record<string, unknown> {
  const isFullFill = order.remainingQty === 0;
  return {
    execId: `${fill.execId}-${side}`,
    childId: `${order.orderId}-dark-${fill.ts}`,
    parentOrderId: order.orderId,
    clientOrderId: order.clientOrderId,
    userId: order.userId,
    algo: "DARK",
    asset: fill.asset,
    side,
    requestedQty: order.quantity,
    filledQty: fill.matchedQty,
    remainingQty: order.remainingQty,
    avgFillPrice: fill.midPrice,
    midPrice: fill.midPrice,
    marketImpactBps: 0,
    venue: "DARK1",
    counterparty: "DARK1",
    liquidityFlag: "CROSS",
    commissionUSD: 0,
    secFeeUSD: 0,
    finraTafUSD: 0,
    totalFeeUSD: 0,
    settlementDate: fill.settlementDate,
    desk: order.desk ?? "equity",
    marketType: "dark",
    execType: isFullFill ? "2" : "1",
    ts: fill.ts,
  };
}

/** Builds the fix.execution payload for one side of a dark-pool match. */
export function buildFixExecution(
  fill: DarkFill,
  side: "BUY" | "SELL",
  order: DarkOrder
): Record<string, unknown> {
  const isFullFill = order.remainingQty === 0;
  return {
    execId: `${fill.execId}-${side}`,
    clOrdId: `${order.orderId}-dark-${fill.ts}`,
    origClOrdId: order.orderId,
    symbol: fill.asset,
    side: side === "BUY" ? "1" : "2",
    ordType: "2",
    execType: isFullFill ? "2" : "1",
    ordStatus: isFullFill ? "2" : "1",
    leavesQty: order.remainingQty,
    cumQty: order.quantity - order.remainingQty,
    avgPx: fill.midPrice,
    lastQty: fill.matchedQty,
    lastPx: fill.midPrice,
    venue: "DARK1",
    counterparty: "DARK1",
    commission: 0,
    settlDate: fill.settlementDate,
    transactTime: new Date(fill.ts).toISOString(),
    ts: fill.ts,
  };
}
