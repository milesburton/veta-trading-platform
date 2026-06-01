import {
  assert,
  assertEquals,
} from "jsr:@std/assert@0.217";

import {
  type CheckRequest,
  type RiskConfig,
} from "@veta/schemas/risk";

import {
  type Position as _Position,
  type WorkingOrder as _WorkingOrder,
  type RecentOrder as _RecentOrder,
  type RiskState,
  checkFatFingerPrice,
  checkDuplicateOrder,
  checkMaxOpenOrders,
  checkSelfCross,
  checkOrderSizeVsAdv,
  checkRateLimit,
  checkPositionNotional,
  checkDailyPnlStop,
  checkConcentration,
  runChecks,
  userGrossNotional,
  userTotalPnl,
  userSymbolNotional,
  orderNotional,
} from "./checks.ts";

function createTestState(config?: Partial<RiskConfig>): RiskState {
  const defaultConfig: RiskConfig = {
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
  
  const mergedConfig = { ...defaultConfig, ...config };
  
  return {
    config: mergedConfig,
    prices: {},
    volumes: {},
    recentOrders: [],
    activeOrderCounts: new Map(),
    workingOrders: [],
    rateBuckets: new Map(),
    positions: new Map(),
  };
}

function createTestRequest(
  overrides: Partial<CheckRequest> = {},
): CheckRequest {
  return {
    userId: "test-user",
    symbol: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 192.0,
    ...overrides,
  };
}

Deno.test("[risk-engine] checkFatFingerPrice: order near mid passes", () => {
  const state = createTestState();
  state.prices["AAPL"] = 192.0;
  const req = createTestRequest({ limitPrice: 192.0 });
  const result = checkFatFingerPrice(state, req);
  assertEquals(result, null);
});

Deno.test("[risk-engine] checkFatFingerPrice: order far from mid is rejected", () => {
  const state = createTestState({ fatFingerPct: 2.0 });
  state.prices["AAPL"] = 192.0;
  const req = createTestRequest({ limitPrice: 300.0 });
  const result = checkFatFingerPrice(state, req);
  assert(result !== null);
  assert(result?.code === "FAT_FINGER_PRICE");
  assertEquals(result?.message.includes("FAT_FINGER_PRICE"), true);
});

Deno.test("[risk-engine] checkDuplicateOrder: identical order within window is rejected", () => {
  const state = createTestState();
  const req = createTestRequest();
  
  // First order should pass
  const firstResult = checkDuplicateOrder(state, req);
  assertEquals(firstResult, null);
  
  // Second identical order should be rejected
  const secondResult = checkDuplicateOrder(state, req);
  assert(secondResult !== null);
  assert(secondResult?.code === "DUPLICATE_ORDER");
});

Deno.test("[risk-engine] checkDuplicateOrder: different symbol is not a duplicate", () => {
  const state = createTestState();
  const req1 = createTestRequest({ symbol: "AAPL" });
  const req2 = createTestRequest({ symbol: "MSFT" });
  
  checkDuplicateOrder(state, req1);
  const result = checkDuplicateOrder(state, req2);
  assertEquals(result, null);
});

Deno.test("[risk-engine] checkMaxOpenOrders: allows when under limit", () => {
  const state = createTestState();
  state.activeOrderCounts.set("test-user", 49);
  const req = createTestRequest();
  const result = checkMaxOpenOrders(state, req);
  assertEquals(result, null);
});

Deno.test("[risk-engine] checkMaxOpenOrders: rejects when at limit", () => {
  const state = createTestState({ maxOpenOrders: 2 });
  state.activeOrderCounts.set("test-user", 2);
  const req = createTestRequest();
  const result = checkMaxOpenOrders(state, req);
  assert(result !== null);
  assert(result?.code === "MAX_OPEN_ORDERS");
});

Deno.test("[risk-engine] checkSelfCross: BUY is allowed when no opposite working order exists", () => {
  const state = createTestState();
  const req = createTestRequest({ side: "BUY" });
  const result = checkSelfCross(state, req);
  assertEquals(result, null);
});

Deno.test("[risk-engine] checkSelfCross: rejects when opposite working order exists", () => {
  const state = createTestState();
  state.workingOrders.push({
    userId: "test-user",
    symbol: "AAPL",
    side: "SELL",
    orderId: "test-order-1",
  });
  const req = createTestRequest({ side: "BUY" });
  const result = checkSelfCross(state, req);
  assert(result !== null);
  assert(result?.code === "SELF_CROSS");
});

Deno.test("[risk-engine] checkOrderSizeVsAdv: small order passes", () => {
  const state = createTestState();
  state.volumes["AAPL"] = 100000;
  const req = createTestRequest({ quantity: 10 });
  const result = checkOrderSizeVsAdv(state, req);
  assertEquals(result, null);
});

Deno.test("[risk-engine] checkOrderSizeVsAdv: oversized order is rejected", () => {
  const state = createTestState({ maxAdvPct: 0.001 });
  state.volumes["AAPL"] = 100000;
  const req = createTestRequest({ quantity: 50000 });
  const result = checkOrderSizeVsAdv(state, req);
  assert(result !== null);
  assert(result?.code === "ORDER_SIZE_VS_ADV");
});

Deno.test("[risk-engine] checkRateLimit: allows within limit", () => {
  const state = createTestState({ maxOrdersPerSecond: 3 });
  const req = createTestRequest();
  const result = checkRateLimit(state, req);
  assertEquals(result, null);
});

Deno.test("[risk-engine] checkRateLimit: rejects when exceeding limit", () => {
  const state = createTestState({ maxOrdersPerSecond: 1 });
  const req = createTestRequest();
  
  // First order should pass
  checkRateLimit(state, req);
  
  // Second order should be rejected
  const result = checkRateLimit(state, req);
  assert(result !== null);
  assert(result?.code === "RATE_LIMIT");
});

Deno.test("[risk-engine] checkPositionNotional: allows under limit", () => {
  const state = createTestState({ maxGrossNotional: 5_000_000 });
  const req = createTestRequest({ quantity: 100, limitPrice: 192.0 });
  const result = checkPositionNotional(state, req);
  assertEquals(result, null);
});

Deno.test("[risk-engine] checkPositionNotional: rejects when post-trade > limit", () => {
  const state = createTestState({ maxGrossNotional: 10_000 });
  const req = createTestRequest({ quantity: 200, limitPrice: 100 });
  const result = checkPositionNotional(state, req);
  assert(result !== null);
  assert(result?.code === "POSITION_NOTIONAL_LIMIT");
});

Deno.test("[risk-engine] checkDailyPnlStop: allows for user with no positions", () => {
  const state = createTestState();
  const req = createTestRequest();
  const result = checkDailyPnlStop(state, req);
  assertEquals(result, null);
});

Deno.test("[risk-engine] checkDailyPnlStop: rejects when total P&L at/below threshold", () => {
  const state = createTestState({ maxDailyLoss: -10_000 });
  const userPositions = new Map();
  userPositions.set("AAPL", {
    symbol: "AAPL",
    netQty: 0,
    avgPrice: 0,
    costBasis: 0,
    realisedPnl: -15_000,
    fillCount: 0,
  });
  state.positions.set("test-user", userPositions);
  const req = createTestRequest();
  const result = checkDailyPnlStop(state, req);
  assert(result !== null);
  assert(result?.code === "DAILY_LOSS_STOP");
});

Deno.test("[risk-engine] checkConcentration: allows diverse book", () => {
  const state = createTestState({ maxConcentrationPct: 25 });
  const userPositions = new Map();
  userPositions.set("MSFT", {
    symbol: "MSFT",
    netQty: 1000,
    avgPrice: 300,
    costBasis: 300000,
    realisedPnl: 0,
    fillCount: 0,
  });
  userPositions.set("NVDA", {
    symbol: "NVDA",
    netQty: 1000,
    avgPrice: 300,
    costBasis: 300000,
    realisedPnl: 0,
    fillCount: 0,
  });
  userPositions.set("GOOGL", {
    symbol: "GOOGL",
    netQty: 1000,
    avgPrice: 300,
    costBasis: 300000,
    realisedPnl: 0,
    fillCount: 0,
  });
  state.positions.set("test-user", userPositions);
  const req = createTestRequest({ symbol: "AMZN", quantity: 10, limitPrice: 100 });
  const result = checkConcentration(state, req);
  assertEquals(result, null);
});

Deno.test("[risk-engine] checkConcentration: rejects when single symbol > pct", () => {
  const state = createTestState({ maxConcentrationPct: 25 });
  const userPositions = new Map();
  userPositions.set("MSFT", {
    symbol: "MSFT",
    netQty: 10,
    avgPrice: 10,
    costBasis: 100,
    realisedPnl: 0,
    fillCount: 0,
  });
  state.positions.set("test-user", userPositions);
  const req = createTestRequest({ symbol: "AAPL", quantity: 100, limitPrice: 100 });
  const result = checkConcentration(state, req);
  assert(result !== null);
  assert(result?.code === "CONCENTRATION_LIMIT");
});

Deno.test("[risk-engine] userGrossNotional: calculates correctly", () => {
  const state = createTestState();
  const userPositions = new Map();
  userPositions.set("AAPL", {
    symbol: "AAPL",
    netQty: 100,
    avgPrice: 192.0,
    costBasis: 19200,
    realisedPnl: 0,
    fillCount: 0,
  });
  state.positions.set("test-user", userPositions);
  const result = userGrossNotional(state, "test-user");
  assertEquals(result, 19200);
});

Deno.test("[risk-engine] userTotalPnl: calculates correctly", () => {
  const state = createTestState();
  const userPositions = new Map();
  userPositions.set("AAPL", {
    symbol: "AAPL",
    netQty: 100,
    avgPrice: 192.0,
    costBasis: 19200,
    realisedPnl: 0,
    fillCount: 0,
  });
  state.positions.set("test-user", userPositions);
  const result = userTotalPnl(state, "test-user");
  assertEquals(result, 0);
});

Deno.test("[risk-engine] userSymbolNotional: calculates correctly", () => {
  const state = createTestState();
  const userPositions = new Map();
  userPositions.set("AAPL", {
    symbol: "AAPL",
    netQty: 100,
    avgPrice: 192.0,
    costBasis: 19200,
    realisedPnl: 0,
    fillCount: 0,
  });
  state.positions.set("test-user", userPositions);
  const result = userSymbolNotional(state, "test-user", "AAPL");
  assertEquals(result, 19200);
});

Deno.test("[risk-engine] orderNotional: calculates correctly", () => {
  const req = createTestRequest({ quantity: 100, limitPrice: 192.0 });
  const result = orderNotional(req);
  assertEquals(result, 19200);
});

Deno.test("[risk-engine] runChecks: all checks pass", () => {
  const state = createTestState();
  state.prices["AAPL"] = 192.0;
  state.volumes["AAPL"] = 100000;
  // Set up user positions to avoid concentration limit issues
  const userPositions = new Map();
  userPositions.set("AAPL", {
    symbol: "AAPL",
    netQty: 0,
    avgPrice: 0,
    costBasis: 0,
    realisedPnl: 0,
    fillCount: 0,
  });
  state.positions.set("test-user", userPositions);
  const req = createTestRequest({ quantity: 10, limitPrice: 192.0 });
  const result = runChecks(state, req);
  assertEquals(result.allowed, true);
  assertEquals(result.reasons.length, 0);
});

Deno.test("[risk-engine] runChecks: some checks fail", () => {
  const state = createTestState({ maxAdvPct: 0.001, maxGrossNotional: 1000 });
  state.prices["AAPL"] = 192.0;
  state.volumes["AAPL"] = 100000;
  const req = createTestRequest({ quantity: 50000, limitPrice: 192.0 });
  const result = runChecks(state, req);
  assertEquals(result.allowed, false);
  assert(result.reasons.length > 0);
});