import { assert } from "jsr:@std/assert@0.217";

import {
  BreakerFireSchema,
  CheckRequestSchema,
  CheckResultSchema,
  RiskConfigSchema,
  RiskConfigUpdateSchema,
  TestPositionSchema,
  TestTickSchema,
} from "../schemas/risk.ts";

Deno.test("[risk-schema] CheckRequestSchema accepts full request", () => {
  const ok = CheckRequestSchema.safeParse({
    orderId: "o1",
    userId: "user-1",
    userRole: "trader",
    symbol: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 192.0,
    strategy: "LIMIT",
    instrumentType: "equity",
  });
  assert(ok.success, JSON.stringify(ok));
});

Deno.test("[risk-schema] CheckRequestSchema accepts minimal request", () => {
  assert(
    CheckRequestSchema.safeParse({
      userId: "user-1",
      symbol: "AAPL",
      side: "BUY",
      quantity: 100,
      limitPrice: 192.0,
    }).success,
  );
});

Deno.test("[risk-schema] CheckRequestSchema rejects missing required fields", () => {
  for (const missing of ["userId", "symbol", "side", "quantity", "limitPrice"]) {
    const body: Record<string, unknown> = {
      userId: "u",
      symbol: "AAPL",
      side: "BUY",
      quantity: 100,
      limitPrice: 192,
    };
    delete body[missing];
    const res = CheckRequestSchema.safeParse(body);
    assert(!res.success, `expected rejection without ${missing}`);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      assert(paths.includes(missing), `expected issue on ${missing}, got ${JSON.stringify(paths)}`);
    }
  }
});

Deno.test("[risk-schema] CheckRequestSchema rejects zero quantity/limitPrice", () => {
  assert(
    !CheckRequestSchema.safeParse({
      userId: "u",
      symbol: "AAPL",
      side: "BUY",
      quantity: 0,
      limitPrice: 192,
    }).success,
  );
  assert(
    !CheckRequestSchema.safeParse({
      userId: "u",
      symbol: "AAPL",
      side: "BUY",
      quantity: 100,
      limitPrice: 0,
    }).success,
  );
});

Deno.test("[risk-schema] CheckRequestSchema rejects bad side", () => {
  assert(
    !CheckRequestSchema.safeParse({
      userId: "u",
      symbol: "AAPL",
      side: "HOLD",
      quantity: 100,
      limitPrice: 192,
    }).success,
  );
});

Deno.test("[risk-schema] RiskConfigUpdateSchema accepts all fields", () => {
  const ok = RiskConfigUpdateSchema.safeParse({
    fatFingerPct: 5,
    maxOpenOrders: 50,
    duplicateWindowMs: 500,
    maxOrdersPerSecond: 10,
    maxAdvPct: 10,
    maxGrossNotional: 5_000_000,
    maxDailyLoss: -50_000,
    maxConcentrationPct: 25,
    haltMovePercent: 10,
    breakerCooldownMs: 60_000,
    breakersEnabled: true,
  });
  assert(ok.success, JSON.stringify(ok));
});

Deno.test("[risk-schema] RiskConfigUpdateSchema accepts empty body (all optional)", () => {
  assert(RiskConfigUpdateSchema.safeParse({}).success);
});

Deno.test("[risk-schema] RiskConfigUpdateSchema accepts partial body", () => {
  assert(
    RiskConfigUpdateSchema.safeParse({ fatFingerPct: 3, maxOpenOrders: 25 }).success,
  );
});

Deno.test("[risk-schema] RiskConfigUpdateSchema rejects non-number fatFingerPct", () => {
  assert(
    !RiskConfigUpdateSchema.safeParse({ fatFingerPct: "high" }).success,
  );
});

Deno.test("[risk-schema] RiskConfigUpdateSchema rejects non-integer maxOpenOrders", () => {
  assert(
    !RiskConfigUpdateSchema.safeParse({ maxOpenOrders: 5.5 }).success,
  );
});

Deno.test("[risk-schema] RiskConfigUpdateSchema rejects non-boolean breakersEnabled", () => {
  assert(
    !RiskConfigUpdateSchema.safeParse({ breakersEnabled: "true" }).success,
  );
});

Deno.test("[risk-schema] RiskConfigUpdateSchema allows maxDailyLoss at any sign (business rule handled in handler)", () => {
  assert(RiskConfigUpdateSchema.safeParse({ maxDailyLoss: 0 }).success);
  assert(RiskConfigUpdateSchema.safeParse({ maxDailyLoss: 5_000 }).success);
  assert(RiskConfigUpdateSchema.safeParse({ maxDailyLoss: -100_000 }).success);
});

Deno.test("[risk-schema] RiskConfigSchema requires every field", () => {
  assert(!RiskConfigSchema.safeParse({}).success);
  assert(!RiskConfigSchema.safeParse({ fatFingerPct: 5 }).success);
});

Deno.test("[risk-schema] CheckResultSchema shape", () => {
  const ok = CheckResultSchema.safeParse({
    allowed: true,
    reasons: [],
    warnings: [],
  });
  assert(ok.success);
  assert(
    !CheckResultSchema.safeParse({ allowed: true, reasons: [], warnings: "none" }).success,
  );
});

Deno.test("[risk-schema] BreakerFireSchema accepts both breaker types", () => {
  assert(
    BreakerFireSchema.safeParse({
      type: "market-move",
      scope: "symbol",
      target: "AAPL",
      observedValue: 12.5,
      threshold: 10,
      firedAt: Date.now(),
    }).success,
  );
  assert(
    BreakerFireSchema.safeParse({
      type: "user-pnl",
      scope: "user",
      target: "user-1",
      observedValue: -60_000,
      threshold: -50_000,
      firedAt: Date.now(),
    }).success,
  );
});

Deno.test("[risk-schema] BreakerFireSchema rejects unknown type", () => {
  assert(
    !BreakerFireSchema.safeParse({
      type: "unknown",
      scope: "symbol",
      target: "AAPL",
      observedValue: 12.5,
      threshold: 10,
      firedAt: 1,
    }).success,
  );
});

Deno.test("[risk-schema] TestPositionSchema requires core fields", () => {
  assert(
    TestPositionSchema.safeParse({
      userId: "user-1",
      symbol: "AAPL",
      netQty: 100,
      avgPrice: 192.0,
    }).success,
  );
  assert(
    TestPositionSchema.safeParse({
      userId: "user-1",
      symbol: "AAPL",
      netQty: -100,
      avgPrice: 192.0,
      realisedPnl: -500,
    }).success,
  );
  assert(
    !TestPositionSchema.safeParse({
      userId: "user-1",
      symbol: "AAPL",
      netQty: 100,
    }).success,
  );
});

Deno.test("[risk-schema] TestTickSchema accepts empty body", () => {
  assert(TestTickSchema.safeParse({}).success);
});

Deno.test("[risk-schema] TestTickSchema accepts prices and openPrices", () => {
  assert(
    TestTickSchema.safeParse({
      prices: { AAPL: 192, MSFT: 420 },
      openPrices: { AAPL: 190 },
    }).success,
  );
});
