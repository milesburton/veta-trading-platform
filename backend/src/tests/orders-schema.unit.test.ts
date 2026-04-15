import { assert, assertEquals } from "jsr:@std/assert@0.217";

import {
  FillEventSchema,
  OrderCancelledSchema,
  OrderChildSchema,
  OrderKillAuditSchema,
  OrderKillCommandSchema,
  OrderNewSchema,
  OrderRejectedSchema,
  OrderResumeCommandSchema,
  OrderSubmittedSchema,
  RoutedOrderSchema,
} from "../schemas/orders.ts";

Deno.test("[orders-schema] OrderNewSchema accepts minimal GUI submission", () => {
  const result = OrderNewSchema.safeParse({
    clientOrderId: "client-1",
    userId: "user-1",
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 192.0,
  });
  assert(result.success, JSON.stringify(result));
});

Deno.test("[orders-schema] OrderNewSchema accepts RFQ-style submission with orderId + desk", () => {
  const result = OrderNewSchema.safeParse({
    orderId: "order-1",
    clientOrderId: "client-1",
    userId: "user-1",
    userRole: "trader",
    asset: "US10Y",
    side: "BUY",
    quantity: 1_000_000,
    limitPrice: 99.5,
    strategy: "LIMIT",
    desk: "fi",
    ts: Date.now(),
  });
  assert(result.success, JSON.stringify(result));
});

Deno.test("[orders-schema] OrderNewSchema rejects missing userId", () => {
  const result = OrderNewSchema.safeParse({
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 192.0,
  });
  assert(!result.success);
  if (!result.success) {
    const paths = result.error.issues.map((i) => i.path.join("."));
    assert(paths.includes("userId"));
  }
});

Deno.test("[orders-schema] OrderNewSchema rejects invalid side", () => {
  const result = OrderNewSchema.safeParse({
    userId: "u1",
    asset: "AAPL",
    side: "HOLD",
    quantity: 100,
  });
  assert(!result.success);
});

Deno.test("[orders-schema] OrderNewSchema rejects zero/negative quantity", () => {
  assert(
    !OrderNewSchema.safeParse({
      userId: "u1",
      asset: "AAPL",
      side: "BUY",
      quantity: 0,
    }).success,
  );
  assert(
    !OrderNewSchema.safeParse({
      userId: "u1",
      asset: "AAPL",
      side: "BUY",
      quantity: -5,
    }).success,
  );
});

Deno.test("[orders-schema] OrderSubmittedSchema accepts full OMS payload", () => {
  const result = OrderSubmittedSchema.safeParse({
    orderId: "order-1",
    clientOrderId: "client-1",
    userId: "user-1",
    ts: Date.now(),
    timeInForce: "DAY",
    destinationVenue: "XNAS",
    accountId: "acc-1",
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 192.0,
    strategy: "LIMIT",
    desk: "equity",
    marketType: "lit",
  });
  assert(result.success, JSON.stringify(result));
});

Deno.test("[orders-schema] RoutedOrderSchema extends submitted with routedAt", () => {
  const result = RoutedOrderSchema.safeParse({
    orderId: "order-1",
    userId: "user-1",
    ts: Date.now(),
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    routedAt: Date.now(),
  });
  assert(result.success);
});

Deno.test("[orders-schema] RoutedOrderSchema rejects without routedAt", () => {
  const result = RoutedOrderSchema.safeParse({
    orderId: "order-1",
    userId: "user-1",
    ts: Date.now(),
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
  });
  assert(!result.success);
});

Deno.test("[orders-schema] OrderChildSchema accepts base limit algo payload", () => {
  const result = OrderChildSchema.safeParse({
    childId: "child-1",
    parentOrderId: "order-1",
    clientOrderId: "client-1",
    algo: "LIMIT",
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 192.0,
    ts: Date.now(),
  });
  assert(result.success, JSON.stringify(result));
});

Deno.test("[orders-schema] OrderChildSchema accepts VWAP-specific payload", () => {
  const result = OrderChildSchema.safeParse({
    childId: "child-1",
    parentOrderId: "order-1",
    algo: "VWAP",
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 192.0,
    ts: Date.now(),
    vwap: 192.1,
    deviation: 0.05,
    numSlices: 10,
    sliceIndex: 3,
  });
  assert(result.success, JSON.stringify(result));
});

Deno.test("[orders-schema] OrderChildSchema accepts momentum-specific payload", () => {
  const result = OrderChildSchema.safeParse({
    childId: "child-1",
    parentOrderId: "order-1",
    algo: "MOMENTUM",
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    ts: Date.now(),
    entryPrice: 191.5,
    signalBps: 12.5,
    trancheIndex: 2,
  });
  assert(result.success);
});

Deno.test("[orders-schema] FillEventSchema accepts full EMS payload", () => {
  const result = FillEventSchema.safeParse({
    execId: "exec-1",
    childId: "child-1",
    parentOrderId: "order-1",
    clientOrderId: "client-1",
    userId: "user-1",
    algo: "LIMIT",
    asset: "AAPL",
    side: "BUY",
    requestedQty: 100,
    filledQty: 100,
    remainingQty: 0,
    avgFillPrice: 192.05,
    midPrice: 192.0,
    marketImpactBps: 2.5,
    venue: "XNAS",
    counterparty: "MMCO",
    liquidityFlag: "MAKER",
    commissionUSD: 0.5,
    secFeeUSD: 0.001,
    finraTafUSD: 0.0002,
    totalFeeUSD: 0.5012,
    settlementDate: "2026-04-17",
    desk: "equity",
    marketType: "lit",
    ts: Date.now(),
  });
  assert(result.success, JSON.stringify(result));
});

Deno.test("[orders-schema] FillEventSchema accepts minimal RFQ fill", () => {
  const result = FillEventSchema.safeParse({
    execId: "exec-1",
    childId: "child-1",
    parentOrderId: "order-1",
    algo: "RFQ",
    asset: "US10Y",
    side: "BUY",
    filledQty: 1_000_000,
    avgFillPrice: 99.5,
  });
  assert(result.success, JSON.stringify(result));
});

Deno.test("[orders-schema] FillEventSchema rejects zero filledQty", () => {
  const result = FillEventSchema.safeParse({
    childId: "c",
    parentOrderId: "p",
    algo: "LIMIT",
    asset: "AAPL",
    side: "BUY",
    filledQty: 0,
    avgFillPrice: 192.0,
  });
  assert(!result.success);
});

Deno.test("[orders-schema] OrderRejectedSchema requires reason + userId", () => {
  assert(
    OrderRejectedSchema.safeParse({
      clientOrderId: "client-1",
      userId: "user-1",
      reason: "limit_exceeded",
      ts: Date.now(),
    }).success,
  );
  assert(
    !OrderRejectedSchema.safeParse({
      clientOrderId: "client-1",
      userId: "user-1",
      ts: Date.now(),
    }).success,
  );
});

Deno.test("[orders-schema] OrderCancelledSchema accepts kill-switch cancellation", () => {
  const result = OrderCancelledSchema.safeParse({
    clientOrderId: "client-1",
    userId: "user-1",
    asset: "AAPL",
    strategy: "LIMIT",
    desk: "equity",
    reason: "kill-switch",
    issuedBy: "risk-admin",
    issuedByRole: "admin",
    ts: Date.now(),
  });
  assert(result.success, JSON.stringify(result));
});

Deno.test("[orders-schema] OrderKillCommandSchema accepts each scope", () => {
  for (const scope of ["all", "user", "algo", "market", "symbol"] as const) {
    const result = OrderKillCommandSchema.safeParse({
      scope,
      scopeValue: scope === "user" ? undefined : "AAPL",
      targetUserId: scope === "user" ? "u1" : undefined,
      issuedBy: "admin",
      issuedByRole: "admin",
      ts: Date.now(),
    });
    assert(result.success, `scope=${scope} failed: ${JSON.stringify(result)}`);
  }
});

Deno.test("[orders-schema] OrderKillCommandSchema rejects unknown scope", () => {
  const result = OrderKillCommandSchema.safeParse({
    scope: "universe",
    issuedBy: "admin",
    issuedByRole: "admin",
    ts: Date.now(),
  });
  assert(!result.success);
});

Deno.test("[orders-schema] OrderResumeCommandSchema accepts optional resumeAt", () => {
  assert(
    OrderResumeCommandSchema.safeParse({
      scope: "user",
      targetUserId: "u1",
      issuedBy: "admin",
      issuedByRole: "admin",
      ts: Date.now(),
    }).success,
  );
  assert(
    OrderResumeCommandSchema.safeParse({
      scope: "user",
      targetUserId: "u1",
      resumeAt: Date.now() + 60_000,
      issuedBy: "admin",
      issuedByRole: "admin",
      ts: Date.now(),
    }).success,
  );
});

Deno.test("[orders-schema] OrderKillAuditSchema requires cancelledCount + ids", () => {
  const result = OrderKillAuditSchema.safeParse({
    scope: "user",
    targetUserId: "u1",
    issuedBy: "admin",
    issuedByRole: "admin",
    ts: Date.now(),
    cancelledCount: 3,
    cancelledIds: ["o1", "o2", "o3"],
  });
  assert(result.success, JSON.stringify(result));

  const missing = OrderKillAuditSchema.safeParse({
    scope: "user",
    targetUserId: "u1",
    issuedBy: "admin",
    issuedByRole: "admin",
    ts: Date.now(),
  });
  assert(!missing.success);
});

Deno.test("[orders-schema] OrderKillCommandSchema parsed data strips unknown fields", () => {
  const result = OrderKillCommandSchema.safeParse({
    scope: "symbol",
    scopeValue: "AAPL",
    issuedBy: "admin",
    issuedByRole: "admin",
    ts: Date.now(),
    extraField: "should_be_stripped",
  });
  assert(result.success);
  if (result.success) {
    assertEquals((result.data as Record<string, unknown>).extraField, undefined);
  }
});
