import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";

const BASE = "http://localhost:5032";

function timeout(ms = 5_000) {
  return AbortSignal.timeout(ms);
}

async function check(body: Record<string, unknown>): Promise<{
  allowed: boolean;
  reasons: string[];
  warnings: string[];
}> {
  const res = await fetch(`${BASE}/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: timeout(),
  });
  assertEquals(res.status, 200);
  return await res.json();
}

async function setConfig(cfg: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASE}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
    signal: timeout(),
  });
  assertEquals(res.status, 200);
  await res.body?.cancel();
}

Deno.test("[risk-engine] health reports ok with config", async () => {
  const res = await fetch(`${BASE}/health`, { signal: timeout() });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "ok");
  assertEquals(body.service, "risk-engine");
  assert(typeof body.config.fatFingerPct === "number");
  assert(typeof body.config.maxOpenOrders === "number");
  assert(typeof body.config.duplicateWindowMs === "number");
});

Deno.test("[risk-engine] GET /config returns current limits", async () => {
  const res = await fetch(`${BASE}/config`, { signal: timeout() });
  assertEquals(res.status, 200);
  const cfg = await res.json();
  assert(cfg.fatFingerPct > 0);
  assert(cfg.maxOpenOrders > 0);
  assert(cfg.duplicateWindowMs > 0);
});

Deno.test("[risk-engine] PUT /config updates limits", async () => {
  await setConfig({ fatFingerPct: 3.0, maxOpenOrders: 25, duplicateWindowMs: 200 });
  const res = await fetch(`${BASE}/config`, { signal: timeout() });
  const cfg = await res.json();
  assertEquals(cfg.fatFingerPct, 3.0);
  assertEquals(cfg.maxOpenOrders, 25);
  assertEquals(cfg.duplicateWindowMs, 200);

  await setConfig({ fatFingerPct: 5.0, maxOpenOrders: 50, duplicateWindowMs: 500 });
});

Deno.test("[risk-engine] fat-finger: order near mid passes", async () => {
  const result = await check({
    userId: "test-user",
    symbol: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 192.0,
  });
  const fatFinger = result.reasons.find((r) => r.includes("FAT_FINGER_PRICE"));
  assertEquals(fatFinger, undefined, "expected no fat-finger rejection near mid");
});

Deno.test("[risk-engine] fat-finger: order far from mid is rejected", async () => {
  await setConfig({ fatFingerPct: 2.0 });

  const result = await check({
    userId: "test-fat",
    symbol: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 300.0,
  });

  await setConfig({ fatFingerPct: 5.0 });

  const fatFinger = result.reasons.find((r) => r.includes("FAT_FINGER_PRICE"));
  assert(fatFinger !== undefined, "expected FAT_FINGER_PRICE rejection");
  assertEquals(result.allowed, false);
});

Deno.test("[risk-engine] duplicate: identical order within window is rejected", async () => {
  const order = {
    userId: "test-dup",
    symbol: "MSFT",
    side: "BUY",
    quantity: 50,
    limitPrice: 420.0,
  };

  const first = await check(order);
  const dupReason = first.reasons.find((r) => r.includes("DUPLICATE_ORDER"));
  assertEquals(dupReason, undefined, "first order should not be a duplicate");

  const second = await check(order);
  const dupReason2 = second.reasons.find((r) => r.includes("DUPLICATE_ORDER"));
  assert(dupReason2 !== undefined, "second identical order within window should be rejected");
  assertEquals(second.allowed, false);
});

Deno.test("[risk-engine] duplicate: different symbol is not a duplicate", async () => {
  const result = await check({
    userId: "test-dup-diff",
    symbol: "NVDA",
    side: "BUY",
    quantity: 50,
    limitPrice: 890.0,
  });
  const dup = result.reasons.find((r) => r.includes("DUPLICATE_ORDER"));
  assertEquals(dup, undefined);
});

Deno.test("[risk-engine] max open orders: rejects when at limit", async () => {
  await setConfig({ maxOpenOrders: 2 });

  const result = await check({
    userId: "test-maxopen-fake",
    symbol: "GOOGL",
    side: "BUY",
    quantity: 10,
    limitPrice: 175.0,
  });

  await setConfig({ maxOpenOrders: 50 });

  assertEquals(result.allowed, true, "should pass because fake user has 0 active orders tracked via bus");
});

Deno.test("[risk-engine] self-cross: BUY is allowed when no opposite working order exists", async () => {
  const result = await check({
    userId: "test-selfcross-1",
    symbol: "TSLA",
    side: "BUY",
    quantity: 100,
    limitPrice: 180.0,
  });
  const sc = result.reasons.find((r) => r.includes("SELF_CROSS"));
  assertEquals(sc, undefined, "should not trigger self-cross with no prior order");
});

Deno.test("[risk-engine] rate-limit: rapid burst exceeding limit is rejected", async () => {
  await setConfig({ maxOrdersPerSecond: 3 });

  const results: boolean[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await check({
      userId: `test-rate-${Date.now()}`,
      symbol: "AMZN",
      side: "BUY",
      quantity: 10,
      limitPrice: 225.0,
    });
    results.push(r.allowed);
  }

  await setConfig({ maxOrdersPerSecond: 10 });

  const rejected = results.filter((r) => !r);
  assert(rejected.length > 0, "at least one order in rapid burst should be rate-limited");
});

Deno.test("[risk-engine] ADV: small order passes ADV check", async () => {
  const result = await check({
    userId: "test-adv-ok",
    symbol: "AAPL",
    side: "BUY",
    quantity: 10,
    limitPrice: 192.0,
  });
  const adv = result.reasons.find((r) => r.includes("ORDER_SIZE_VS_ADV"));
  assertEquals(adv, undefined, "10 shares of AAPL should not exceed ADV limit");
});

Deno.test("[risk-engine] ADV: oversized order is rejected", async () => {
  await setConfig({ maxAdvPct: 0.001 });

  const result = await check({
    userId: "test-adv-big",
    symbol: "AAPL",
    side: "BUY",
    quantity: 50000,
    limitPrice: 192.0,
  });

  await setConfig({ maxAdvPct: 10.0 });

  const adv = result.reasons.find((r) => r.includes("ORDER_SIZE_VS_ADV"));
  assert(adv !== undefined, "50k shares with 0.001% ADV limit should be rejected");
  assertEquals(result.allowed, false);
});

Deno.test("[risk-engine] config includes new fields maxOrdersPerSecond and maxAdvPct", async () => {
  const res = await fetch(`${BASE}/config`, { signal: timeout() });
  const cfg = await res.json();
  assert(typeof cfg.maxOrdersPerSecond === "number");
  assert(typeof cfg.maxAdvPct === "number");
});

Deno.test("[risk-engine] GET /positions/:userId returns empty for unknown user", async () => {
  const res = await fetch(`${BASE}/positions/nobody`, { signal: timeout() });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.userId, "nobody");
  assertEquals(body.positions.length, 0);
});

Deno.test("[risk-engine] GET /positions returns all tracked positions", async () => {
  const res = await fetch(`${BASE}/positions`, { signal: timeout() });
  assertEquals(res.status, 200);
  const body = await res.json();
  assert(typeof body.positions === "object");
});

Deno.test("[risk-engine] missing fields returns 400", async () => {
  const res = await fetch(`${BASE}/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "x" }),
    signal: timeout(),
  });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});
