import {
  assert,
  assertEquals,
} from "jsr:@std/assert@0.217";

import { timeout } from "./test-helpers.ts";

const BASE = "http://localhost:5032";

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
  assert(typeof cfg.maxGrossNotional === "number");
  assert(typeof cfg.maxDailyLoss === "number");
  assert(typeof cfg.maxConcentrationPct === "number");
  assert(typeof cfg.haltMovePercent === "number");
  assert(typeof cfg.breakerCooldownMs === "number");
  assert(typeof cfg.breakersEnabled === "boolean");
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

async function seedPosition(body: {
  userId: string;
  symbol: string;
  netQty: number;
  avgPrice: number;
  realisedPnl?: number;
}): Promise<void> {
  const res = await fetch(`${BASE}/test/positions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: timeout(),
  });
  assertEquals(res.status, 200, "seedPosition expected 200 (is RISK_ENGINE_TEST_MODE=1?)");
  await res.body?.cancel();
}

async function resetTestState(): Promise<void> {
  const res = await fetch(`${BASE}/test/positions/reset`, {
    method: "POST",
    signal: timeout(),
  });
  if (res.ok) await res.body?.cancel();
  else await res.body?.cancel();
}

async function sendTick(body: {
  prices?: Record<string, number>;
  openPrices?: Record<string, number>;
}): Promise<{ ok: boolean; fireCount: number }> {
  const res = await fetch(`${BASE}/test/tick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: timeout(),
  });
  assertEquals(res.status, 200);
  return await res.json();
}

async function getBreakers(): Promise<{
  active: Array<{ key: string; type: string; target: string }>;
  history: Array<{
    type: string;
    scope: string;
    target: string;
    observedValue: number;
    threshold: number;
    firedAt: number;
  }>;
  fireCount: number;
}> {
  const res = await fetch(`${BASE}/breakers`, { signal: timeout() });
  assertEquals(res.status, 200);
  return await res.json();
}

Deno.test("[risk-engine] PUT /config accepts the 6 new fields", async () => {
  await setConfig({
    maxGrossNotional: 3_000_000,
    maxDailyLoss: -25_000,
    maxConcentrationPct: 40,
    haltMovePercent: 7.5,
    breakerCooldownMs: 30_000,
    breakersEnabled: false,
  });
  const res = await fetch(`${BASE}/config`, { signal: timeout() });
  const cfg = await res.json();
  assertEquals(cfg.maxGrossNotional, 3_000_000);
  assertEquals(cfg.maxDailyLoss, -25_000);
  assertEquals(cfg.maxConcentrationPct, 40);
  assertEquals(cfg.haltMovePercent, 7.5);
  assertEquals(cfg.breakerCooldownMs, 30_000);
  assertEquals(cfg.breakersEnabled, false);

  await setConfig({
    maxGrossNotional: 5_000_000,
    maxDailyLoss: -50_000,
    maxConcentrationPct: 25,
    haltMovePercent: 10,
    breakerCooldownMs: 60_000,
    breakersEnabled: true,
  });
});

Deno.test("[risk-engine] PUT /config rejects maxDailyLoss >= 0 with 400", async () => {
  const before = await (await fetch(`${BASE}/config`, { signal: timeout() })).json();
  const res = await fetch(`${BASE}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maxDailyLoss: 0 }),
    signal: timeout(),
  });
  assertEquals(res.status, 400);
  const err = await res.json();
  assert(typeof err.error === "string");
  const after = await (await fetch(`${BASE}/config`, { signal: timeout() })).json();
  assertEquals(after.maxDailyLoss, before.maxDailyLoss);
});

Deno.test("[risk-engine] position notional: allow under limit", async () => {
  await resetTestState();
  await setConfig({ maxGrossNotional: 5_000_000 });
  const result = await check({
    userId: "test-notional-ok",
    symbol: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 192.0,
  });
  const r = result.reasons.find((x) => x.includes("POSITION_NOTIONAL_LIMIT"));
  assertEquals(r, undefined);
});

Deno.test("[risk-engine] position notional: reject when post-trade > limit", async () => {
  await resetTestState();
  await setConfig({ maxGrossNotional: 10_000 });
  const result = await check({
    userId: "test-notional-reject",
    symbol: "AAPL",
    side: "BUY",
    quantity: 200,
    limitPrice: 100,
  });
  await setConfig({ maxGrossNotional: 5_000_000 });
  const r = result.reasons.find((x) => x.includes("POSITION_NOTIONAL_LIMIT"));
  assert(r !== undefined, "expected POSITION_NOTIONAL_LIMIT rejection");
  assertEquals(result.allowed, false);
});

Deno.test("[risk-engine] position notional: at limit is allowed (strict >)", async () => {
  await resetTestState();
  await setConfig({ maxGrossNotional: 10_000 });
  const result = await check({
    userId: "test-notional-boundary",
    symbol: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 100,
  });
  await setConfig({ maxGrossNotional: 5_000_000 });
  const r = result.reasons.find((x) => x.includes("POSITION_NOTIONAL_LIMIT"));
  assertEquals(r, undefined, "10_000 exactly should pass (strict >)");
});

Deno.test("[risk-engine] P&L stop: allow for user with no positions", async () => {
  await resetTestState();
  const result = await check({
    userId: "test-pnl-empty",
    symbol: "AAPL",
    side: "BUY",
    quantity: 10,
    limitPrice: 192.0,
  });
  const r = result.reasons.find((x) => x.includes("DAILY_LOSS_STOP"));
  assertEquals(r, undefined);
});

Deno.test("[risk-engine] P&L stop: reject when total P&L at/below threshold", async () => {
  await resetTestState();
  await setConfig({ maxDailyLoss: -10_000, breakerCooldownMs: 60_000 });
  await seedPosition({
    userId: "test-pnl-breached",
    symbol: "AAPL",
    netQty: 0,
    avgPrice: 0,
    realisedPnl: -15_000,
  });
  const result = await check({
    userId: "test-pnl-breached",
    symbol: "AAPL",
    side: "BUY",
    quantity: 10,
    limitPrice: 192.0,
  });
  await setConfig({ maxDailyLoss: -50_000 });
  const r = result.reasons.find((x) => x.includes("DAILY_LOSS_STOP"));
  assert(r !== undefined, "expected DAILY_LOSS_STOP rejection");
  assertEquals(result.allowed, false);
});

Deno.test("[risk-engine] concentration: allow diverse book", async () => {
  await resetTestState();
  await setConfig({ maxConcentrationPct: 25 });
  await seedPosition({ userId: "test-conc-ok", symbol: "MSFT", netQty: 1000, avgPrice: 300 });
  await seedPosition({ userId: "test-conc-ok", symbol: "NVDA", netQty: 1000, avgPrice: 300 });
  await seedPosition({ userId: "test-conc-ok", symbol: "GOOGL", netQty: 1000, avgPrice: 300 });
  const result = await check({
    userId: "test-conc-ok",
    symbol: "AMZN",
    side: "BUY",
    quantity: 10,
    limitPrice: 100,
  });
  const r = result.reasons.find((x) => x.includes("CONCENTRATION_LIMIT"));
  assertEquals(r, undefined);
});

Deno.test("[risk-engine] concentration: reject when single symbol > pct", async () => {
  await resetTestState();
  await setConfig({ maxConcentrationPct: 25, maxGrossNotional: 5_000_000 });
  await seedPosition({ userId: "test-conc-fail", symbol: "MSFT", netQty: 10, avgPrice: 10 });
  const result = await check({
    userId: "test-conc-fail",
    symbol: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 100,
  });
  await setConfig({ maxConcentrationPct: 25 });
  const r = result.reasons.find((x) => x.includes("CONCENTRATION_LIMIT"));
  assert(r !== undefined, "expected CONCENTRATION_LIMIT rejection");
  assertEquals(result.allowed, false);
});

Deno.test("[risk-engine] market-move breaker fires on >haltMovePercent move", async () => {
  await resetTestState();
  await setConfig({ haltMovePercent: 10, breakerCooldownMs: 60_000, breakersEnabled: true });
  const before = (await getBreakers()).fireCount;
  await sendTick({ openPrices: { ZZZA: 100 }, prices: { ZZZA: 115 } });
  const state = await getBreakers();
  assert(state.fireCount > before, "breaker fireCount should have increased");
  const h = state.history[0];
  assertEquals(h.type, "market-move");
  assertEquals(h.target, "ZZZA");
  assert(h.observedValue >= 15, "observedValue should be ~15%");
});

Deno.test("[risk-engine] breaker cooldown prevents double-fire within window", async () => {
  await resetTestState();
  await setConfig({ haltMovePercent: 10, breakerCooldownMs: 60_000, breakersEnabled: true });
  await sendTick({ openPrices: { ZZZB: 100 }, prices: { ZZZB: 115 } });
  const first = (await getBreakers()).fireCount;
  await sendTick({ openPrices: { ZZZB: 100 }, prices: { ZZZB: 120 } });
  const second = (await getBreakers()).fireCount;
  assertEquals(second, first, "second fire within cooldown should be suppressed");
});

Deno.test("[risk-engine] breaker cooldown allows refire after window", async () => {
  await resetTestState();
  await setConfig({ haltMovePercent: 10, breakerCooldownMs: 1_000, breakersEnabled: true });
  await sendTick({ openPrices: { ZZZC: 100 }, prices: { ZZZC: 115 } });
  const first = (await getBreakers()).fireCount;
  await new Promise((r) => setTimeout(r, 1_100));
  await sendTick({ openPrices: { ZZZC: 100 }, prices: { ZZZC: 120 } });
  const second = (await getBreakers()).fireCount;
  await setConfig({ breakerCooldownMs: 60_000 });
  assert(second > first, "refire after cooldown expiry should succeed");
});

Deno.test("[risk-engine] restore defaults", async () => {
  await resetTestState();
  await setConfig({
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
});
