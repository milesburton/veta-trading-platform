import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertGreater,
} from "jsr:@std/assert@0.217";
import {
  checkConcentration,
  checkDailyPnlStop,
  checkDuplicateOrder,
  checkFatFingerPrice,
  checkMaxOpenOrders,
  checkOrderSizeVsAdv,
  checkPositionNotional,
  checkRateLimit,
  checkSelfCross,
  MAX_RECENT,
  orderNotional,
  pruneRecent,
  runChecks,
  userGrossNotional,
  userSymbolNotional,
  userTotalPnl,
} from "../risk-engine/checks.ts";
import type { Position, RiskState } from "../risk-engine/checks.ts";
import type { CheckRequest, RiskConfig } from "../schemas/risk.ts";

const DEFAULT_CONFIG: RiskConfig = {
  fatFingerPct: 5,
  maxOpenOrders: 50,
  duplicateWindowMs: 1_000,
  maxOrdersPerSecond: 10,
  maxAdvPct: 5,
  maxGrossNotional: 1_000_000,
  maxDailyLoss: -10_000,
  maxConcentrationPct: 30,
  haltMovePercent: 5,
  breakerCooldownMs: 60_000,
  breakersEnabled: true,
  selfCrossEnabled: true,
};

function makeState(overrides: Partial<RiskState> = {}): RiskState {
  const nowValue = 1_000_000;
  return {
    config: { ...DEFAULT_CONFIG },
    prices: {},
    volumes: {},
    recentOrders: [],
    activeOrderCounts: new Map(),
    workingOrders: [],
    rateBuckets: new Map(),
    positions: new Map(),
    now: () => nowValue,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<CheckRequest> = {}): CheckRequest {
  return {
    userId: "alice",
    symbol: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 150,
    ...overrides,
  };
}

function setPosition(
  state: RiskState,
  userId: string,
  position: Position,
): void {
  let userPositions = state.positions.get(userId);
  if (!userPositions) {
    userPositions = new Map();
    state.positions.set(userId, userPositions);
  }
  userPositions.set(position.symbol, position);
}

function assertHitCode(
  hit: { code: string; message: string } | null,
  code: string,
  expectedMessagePart?: string,
) {
  assert(hit, `expected ${code} hit`);
  assertEquals(hit.code, code);
  if (expectedMessagePart) {
    assert(hit.message.includes(expectedMessagePart));
  }
}

Deno.test("[risk-checks] orderNotional multiplies quantity by limit price", () => {
  assertEquals(
    orderNotional(makeRequest({ quantity: 100, limitPrice: 150 })),
    15_000,
  );
  assertEquals(
    orderNotional(makeRequest({ quantity: 1, limitPrice: 1.5 })),
    1.5,
  );
});

Deno.test("[risk-checks] userGrossNotional with no positions returns 0", () => {
  const state = makeState();
  assertEquals(userGrossNotional(state, "alice"), 0);
});

Deno.test("[risk-checks] userGrossNotional sums absolute notional across symbols using mark price when available", () => {
  const state = makeState({ prices: { AAPL: 200, MSFT: 400 } });
  setPosition(state, "alice", {
    symbol: "AAPL",
    netQty: 100,
    avgPrice: 150,
    costBasis: 15_000,
    realisedPnl: 0,
    fillCount: 1,
  });
  setPosition(state, "alice", {
    symbol: "MSFT",
    netQty: -50,
    avgPrice: 350,
    costBasis: 17_500,
    realisedPnl: 0,
    fillCount: 1,
  });
  assertEquals(userGrossNotional(state, "alice"), 100 * 200 + 50 * 400);
});

Deno.test("[risk-checks] userGrossNotional falls back to avgPrice when mark unavailable", () => {
  const state = makeState();
  setPosition(state, "alice", {
    symbol: "ZZZZ",
    netQty: 100,
    avgPrice: 50,
    costBasis: 5_000,
    realisedPnl: 0,
    fillCount: 1,
  });
  assertEquals(userGrossNotional(state, "alice"), 100 * 50);
});

Deno.test("[risk-checks] userTotalPnl sums realised plus unrealised across positions", () => {
  const state = makeState({ prices: { AAPL: 160 } });
  setPosition(state, "alice", {
    symbol: "AAPL",
    netQty: 100,
    avgPrice: 150,
    costBasis: 15_000,
    realisedPnl: 200,
    fillCount: 1,
  });
  assertEquals(userTotalPnl(state, "alice"), 200 + 100 * (160 - 150));
});

Deno.test("[risk-checks] userTotalPnl returns 0 for unknown user", () => {
  assertEquals(userTotalPnl(makeState(), "ghost"), 0);
});

Deno.test("[risk-checks] userSymbolNotional returns absolute notional per symbol", () => {
  const state = makeState({ prices: { AAPL: 200 } });
  setPosition(state, "alice", {
    symbol: "AAPL",
    netQty: -100,
    avgPrice: 150,
    costBasis: 15_000,
    realisedPnl: 0,
    fillCount: 1,
  });
  assertEquals(userSymbolNotional(state, "alice", "AAPL"), 100 * 200);
  assertEquals(userSymbolNotional(state, "alice", "MISSING"), 0);
  assertEquals(userSymbolNotional(state, "ghost", "AAPL"), 0);
});

Deno.test("[risk-checks] pruneRecent drops orders older than 5s", () => {
  const state = makeState({
    recentOrders: [
      {
        userId: "alice",
        symbol: "AAPL",
        side: "BUY",
        quantity: 1,
        limitPrice: 1,
        ts: 990_000,
      },
      {
        userId: "alice",
        symbol: "AAPL",
        side: "BUY",
        quantity: 1,
        limitPrice: 1,
        ts: 999_000,
      },
    ],
    now: () => 1_000_000,
  });
  pruneRecent(state);
  assertEquals(state.recentOrders.length, 1);
  assertEquals(state.recentOrders[0].ts, 999_000);
});

Deno.test("[risk-checks] pruneRecent caps array at MAX_RECENT", () => {
  const state = makeState({ now: () => 1_000_000 });
  for (let i = 0; i < MAX_RECENT + 50; i++) {
    state.recentOrders.push({
      userId: "alice",
      symbol: "AAPL",
      side: "BUY",
      quantity: 1,
      limitPrice: 1,
      ts: 999_999,
    });
  }
  pruneRecent(state);
  assertEquals(state.recentOrders.length, MAX_RECENT);
});

Deno.test("[risk-checks] fat-finger scenarios", () => {
  const cases = [
    {
      label: "order at mid passes",
      prices: { AAPL: 150 },
      limitPrice: 150,
      code: null,
      message: undefined,
    },
    {
      label: "4% above mid passes when threshold is 5%",
      prices: { AAPL: 100 },
      limitPrice: 104,
      code: null,
      message: undefined,
    },
    {
      label: "6% above mid is rejected when threshold is 5%",
      prices: { AAPL: 100 },
      limitPrice: 106,
      code: "FAT_FINGER_PRICE",
      message: "above",
    },
    {
      label: "6% below mid says 'below'",
      prices: { AAPL: 100 },
      limitPrice: 94,
      code: "FAT_FINGER_PRICE",
      message: "below",
    },
    {
      label: "missing mid price skips check",
      prices: {},
      limitPrice: 1_000_000,
      code: null,
      message: undefined,
    },
    {
      label: "zero mid price skips check",
      prices: { AAPL: 0 },
      limitPrice: 50,
      code: null,
      message: undefined,
    },
  ] as const;

  for (const testCase of cases) {
    const state = makeState({ prices: testCase.prices });
    const hit = checkFatFingerPrice(
      state,
      makeRequest({ limitPrice: testCase.limitPrice }),
    );
    if (testCase.code === null) {
      assertEquals(hit, null, testCase.label);
      continue;
    }
    assertHitCode(hit, testCase.code, testCase.message);
  }
});

Deno.test("[risk-checks] duplicate: identical order within window is rejected and original is recorded", () => {
  const state = makeState();
  assertEquals(checkDuplicateOrder(state, makeRequest()), null);
  const hit = checkDuplicateOrder(state, makeRequest());
  assert(hit);
  assertEquals(hit!.code, "DUPLICATE_ORDER");
});

Deno.test("[risk-checks] duplicate: order is allowed once window has elapsed", () => {
  let t = 1_000_000;
  const state = makeState({ now: () => t });
  state.config.duplicateWindowMs = 500;
  assertEquals(checkDuplicateOrder(state, makeRequest()), null);
  t += 600;
  assertEquals(checkDuplicateOrder(state, makeRequest()), null);
});

Deno.test("[risk-checks] duplicate: different side, symbol, qty, or price are not duplicates", () => {
  const state = makeState();
  checkDuplicateOrder(state, makeRequest());
  assertEquals(checkDuplicateOrder(state, makeRequest({ side: "SELL" })), null);
  assertEquals(
    checkDuplicateOrder(state, makeRequest({ symbol: "MSFT" })),
    null,
  );
  assertEquals(
    checkDuplicateOrder(state, makeRequest({ quantity: 200 })),
    null,
  );
  assertEquals(
    checkDuplicateOrder(state, makeRequest({ limitPrice: 151 })),
    null,
  );
});

Deno.test("[risk-checks] max open orders threshold behavior", () => {
  const cases = [
    { count: 49, code: null },
    { count: 50, code: "MAX_OPEN_ORDERS" },
  ] as const;

  for (const testCase of cases) {
    const state = makeState();
    state.activeOrderCounts.set("alice", testCase.count);
    const hit = checkMaxOpenOrders(state, makeRequest());
    if (testCase.code === null) {
      assertEquals(hit, null);
      continue;
    }
    assertHitCode(hit, testCase.code);
  }
});

Deno.test("[risk-checks] self-cross: BUY when SELL is working is rejected", () => {
  const state = makeState({
    workingOrders: [
      { userId: "alice", symbol: "AAPL", side: "SELL", orderId: "wO-1" },
    ],
  });
  const hit = checkSelfCross(state, makeRequest({ side: "BUY" }));
  assert(hit);
  assertEquals(hit!.code, "SELF_CROSS");
  assert(hit!.message.includes("wO-1"));
});

Deno.test("[risk-checks] self-cross: BUY when SELL is working for different user passes", () => {
  const state = makeState({
    workingOrders: [
      { userId: "bob", symbol: "AAPL", side: "SELL", orderId: "wO-1" },
    ],
  });
  assertEquals(checkSelfCross(state, makeRequest({ side: "BUY" })), null);
});

Deno.test("[risk-checks] self-cross: BUY when SELL is working for different symbol passes", () => {
  const state = makeState({
    workingOrders: [
      { userId: "alice", symbol: "MSFT", side: "SELL", orderId: "wO-1" },
    ],
  });
  assertEquals(checkSelfCross(state, makeRequest({ side: "BUY" })), null);
});

Deno.test("[risk-checks] ADV scenarios", () => {
  const cases = [
    { volumes: { AAPL: 1_000 }, quantity: 50, code: null },
    { volumes: { AAPL: 1_000 }, quantity: 51, code: "ORDER_SIZE_VS_ADV" },
    { volumes: {}, quantity: 1_000_000, code: null },
    { volumes: { AAPL: 0 }, quantity: 1_000_000, code: null },
  ] as const;

  for (const testCase of cases) {
    const state = makeState({ volumes: testCase.volumes });
    state.config.maxAdvPct = 5;
    const hit = checkOrderSizeVsAdv(
      state,
      makeRequest({ quantity: testCase.quantity }),
    );
    if (testCase.code === null) {
      assertEquals(hit, null);
      continue;
    }
    assertHitCode(hit, testCase.code);
  }
});

Deno.test("[risk-checks] rate-limit: bucket starts full and allows up to N orders/sec", () => {
  const t = 1_000_000;
  const state = makeState({ now: () => t });
  state.config.maxOrdersPerSecond = 3;
  assertEquals(checkRateLimit(state, makeRequest()), null);
  assertEquals(checkRateLimit(state, makeRequest()), null);
  assertEquals(checkRateLimit(state, makeRequest()), null);
  const hit = checkRateLimit(state, makeRequest());
  assert(hit);
  assertEquals(hit!.code, "RATE_LIMIT");
});

Deno.test("[risk-checks] rate-limit: tokens refill at config rate", () => {
  let t = 1_000_000;
  const state = makeState({ now: () => t });
  state.config.maxOrdersPerSecond = 1;
  assertEquals(checkRateLimit(state, makeRequest()), null);
  assert(
    checkRateLimit(state, makeRequest()),
    "expected rejection while bucket empty",
  );
  t += 1_100;
  assertEquals(checkRateLimit(state, makeRequest()), null);
});

Deno.test("[risk-checks] rate-limit: separate users have separate buckets", () => {
  const state = makeState();
  state.config.maxOrdersPerSecond = 1;
  assertEquals(checkRateLimit(state, makeRequest({ userId: "alice" })), null);
  assertEquals(checkRateLimit(state, makeRequest({ userId: "bob" })), null);
});

Deno.test("[risk-checks] position notional threshold behavior", () => {
  const cases = [
    { limit: 100_000, quantity: 100, limitPrice: 50, code: null },
    { limit: 5_000, quantity: 100, limitPrice: 50, code: null },
    {
      limit: 5_000,
      quantity: 101,
      limitPrice: 50,
      code: "POSITION_NOTIONAL_LIMIT",
    },
  ] as const;

  for (const testCase of cases) {
    const state = makeState();
    state.config.maxGrossNotional = testCase.limit;
    const hit = checkPositionNotional(
      state,
      makeRequest({
        quantity: testCase.quantity,
        limitPrice: testCase.limitPrice,
      }),
    );
    if (testCase.code === null) {
      assertEquals(hit, null);
      continue;
    }
    assertHitCode(hit, testCase.code);
  }
});

Deno.test("[risk-checks] daily P&L stop: positive P&L allowed", () => {
  const state = makeState({ prices: { AAPL: 200 } });
  setPosition(state, "alice", {
    symbol: "AAPL",
    netQty: 100,
    avgPrice: 150,
    costBasis: 15_000,
    realisedPnl: 0,
    fillCount: 1,
  });
  state.config.maxDailyLoss = -10_000;
  assertEquals(checkDailyPnlStop(state, makeRequest()), null);
});

Deno.test("[risk-checks] daily P&L stop: P&L at threshold rejected and breaker callback fires", () => {
  let firedFor: string | null = null;
  let firedAt: number | null = null;
  const state = makeState({
    prices: { AAPL: 100 },
    onPnlBreaker: (userId, pnl) => {
      firedFor = userId;
      firedAt = pnl;
    },
  });
  setPosition(state, "alice", {
    symbol: "AAPL",
    netQty: 100,
    avgPrice: 200,
    costBasis: 20_000,
    realisedPnl: 0,
    fillCount: 1,
  });
  state.config.maxDailyLoss = -10_000;
  const hit = checkDailyPnlStop(state, makeRequest());
  assert(hit);
  assertEquals(hit!.code, "DAILY_LOSS_STOP");
  assertEquals(firedFor, "alice");
  assertEquals(firedAt, -10_000);
});

Deno.test("[risk-checks] concentration: single symbol exceeds pct rejected", () => {
  const state = makeState({ prices: { AAPL: 100 } });
  setPosition(state, "alice", {
    symbol: "AAPL",
    netQty: 100,
    avgPrice: 100,
    costBasis: 10_000,
    realisedPnl: 0,
    fillCount: 1,
  });
  state.config.maxConcentrationPct = 50;
  const hit = checkConcentration(
    state,
    makeRequest({ quantity: 100, limitPrice: 100 }),
  );
  assert(hit);
  assertEquals(hit!.code, "CONCENTRATION_LIMIT");
});

Deno.test("[risk-checks] concentration: diverse book passes", () => {
  const state = makeState({ prices: { AAPL: 100, MSFT: 100, NVDA: 100 } });
  setPosition(state, "alice", {
    symbol: "AAPL",
    netQty: 100,
    avgPrice: 100,
    costBasis: 10_000,
    realisedPnl: 0,
    fillCount: 1,
  });
  setPosition(state, "alice", {
    symbol: "MSFT",
    netQty: 100,
    avgPrice: 100,
    costBasis: 10_000,
    realisedPnl: 0,
    fillCount: 1,
  });
  setPosition(state, "alice", {
    symbol: "NVDA",
    netQty: 100,
    avgPrice: 100,
    costBasis: 10_000,
    realisedPnl: 0,
    fillCount: 1,
  });
  state.config.maxConcentrationPct = 50;
  assertEquals(
    checkConcentration(
      state,
      makeRequest({ symbol: "AAPL", quantity: 10, limitPrice: 100 }),
    ),
    null,
  );
});

Deno.test("[risk-checks] concentration: empty book skips (postGross<=0)", () => {
  const state = makeState();
  state.config.maxConcentrationPct = 1;
  assertEquals(
    checkConcentration(state, makeRequest({ quantity: 0, limitPrice: 0 })),
    null,
  );
});

Deno.test("[risk-checks] runChecks aggregates all reasons across failing checks", () => {
  const state = makeState({
    prices: { AAPL: 100 },
    workingOrders: [{
      userId: "alice",
      symbol: "AAPL",
      side: "SELL",
      orderId: "wO-1",
    }],
  });
  state.activeOrderCounts.set("alice", 50);
  const result = runChecks(state, makeRequest({ limitPrice: 200 }));
  assertEquals(result.allowed, false);
  assert(result.reasons.some((r) => r.includes("FAT_FINGER_PRICE")));
  assert(result.reasons.some((r) => r.includes("MAX_OPEN_ORDERS")));
  assert(result.reasons.some((r) => r.includes("SELF_CROSS")));
  assertEquals(result.warnings.length, 0);
});

Deno.test("[risk-checks] runChecks returns allowed=true with empty reasons when nothing fails", () => {
  const state = makeState({
    prices: { AAPL: 150, MSFT: 200, NVDA: 500 },
    volumes: { AAPL: 1_000_000 },
  });
  setPosition(state, "alice", {
    symbol: "MSFT",
    netQty: 1_000,
    avgPrice: 200,
    costBasis: 200_000,
    realisedPnl: 0,
    fillCount: 1,
  });
  setPosition(state, "alice", {
    symbol: "NVDA",
    netQty: 500,
    avgPrice: 500,
    costBasis: 250_000,
    realisedPnl: 0,
    fillCount: 1,
  });
  const result = runChecks(state, makeRequest());
  assertEquals(result.allowed, true);
  assertEquals(result.reasons.length, 0);
});

Deno.test("[risk-checks] math sanity: gross + total pnl interact predictably with prices", () => {
  const state = makeState({ prices: { AAPL: 200 } });
  setPosition(state, "alice", {
    symbol: "AAPL",
    netQty: 100,
    avgPrice: 150,
    costBasis: 15_000,
    realisedPnl: 0,
    fillCount: 1,
  });
  assertEquals(userGrossNotional(state, "alice"), 100 * 200);
  assertAlmostEquals(userTotalPnl(state, "alice"), 100 * (200 - 150));
  assertGreater(
    userGrossNotional(state, "alice"),
    userTotalPnl(state, "alice"),
  );
});
