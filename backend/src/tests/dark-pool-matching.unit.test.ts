import { assertEquals } from "jsr:@std/assert@0.217";
import {
  buildFixExecution,
  buildOrdersFilled,
  type DarkOrder,
  type DarkFill,
  matchSymbol,
  type SymbolPool,
} from "../dark-pool/dark-pool-matching.ts";

const NOW = 1_700_000_000_000;
let execIdSeq = 1;
function execIdFactory(): string {
  return `DX${String(execIdSeq++).padStart(8, "0")}`;
}
function settlementDateFactory(): string {
  return "2026-08-20";
}

function order(overrides: Partial<DarkOrder> = {}): DarkOrder {
  return {
    orderId: "ORD1",
    asset: "AAPL",
    side: "BUY",
    quantity: 10_000,
    remainingQty: 10_000,
    limitPrice: 190,
    admittedAt: NOW,
    deadlineAt: NOW + 30_000,
    strategy: "LIMIT",
    ...overrides,
  };
}

function pool(buys: DarkOrder[], sells: DarkOrder[]): SymbolPool {
  return { buys, sells };
}

Deno.test("[dark-pool-matching] a buy and sell that both cross the midpoint match fully", () => {
  execIdSeq = 1;
  const buy = order({ orderId: "B1", side: "BUY", quantity: 10_000, remainingQty: 10_000, limitPrice: 191 });
  const sell = order({ orderId: "S1", side: "SELL", quantity: 10_000, remainingQty: 10_000, limitPrice: 189 });
  const p = pool([buy], [sell]);

  const fills = matchSymbol(p, "AAPL", 190, NOW, execIdFactory, settlementDateFactory);

  assertEquals(fills.length, 1);
  assertEquals(fills[0].matchedQty, 10_000);
  assertEquals(fills[0].midPrice, 190);
  assertEquals(fills[0].buyOrderId, "B1");
  assertEquals(fills[0].sellOrderId, "S1");
});

Deno.test("[dark-pool-matching] a buy whose limit is below the midpoint is not eligible", () => {
  const buy = order({ orderId: "B1", side: "BUY", limitPrice: 188 });
  const sell = order({ orderId: "S1", side: "SELL", limitPrice: 189 });
  const p = pool([buy], [sell]);

  const fills = matchSymbol(p, "AAPL", 190, NOW, execIdFactory, settlementDateFactory);
  assertEquals(fills.length, 0);
});

Deno.test("[dark-pool-matching] a sell whose limit is above the midpoint is not eligible", () => {
  const buy = order({ orderId: "B1", side: "BUY", limitPrice: 195 });
  const sell = order({ orderId: "S1", side: "SELL", limitPrice: 192 });
  const p = pool([buy], [sell]);

  const fills = matchSymbol(p, "AAPL", 190, NOW, execIdFactory, settlementDateFactory);
  assertEquals(fills.length, 0);
});

Deno.test("[dark-pool-matching] a partial fill leaves the larger order resting with reduced remainingQty", () => {
  const buy = order({ orderId: "B1", quantity: 15_000, remainingQty: 15_000, limitPrice: 191 });
  const sell = order({ orderId: "S1", side: "SELL", quantity: 10_000, remainingQty: 10_000, limitPrice: 189 });
  const p = pool([buy], [sell]);

  const fills = matchSymbol(p, "AAPL", 190, NOW, execIdFactory, settlementDateFactory);

  assertEquals(fills.length, 1);
  assertEquals(fills[0].matchedQty, 10_000);
  assertEquals(p.buys.length, 1, "the partially-filled buy should remain in the pool");
  assertEquals(p.buys[0].remainingQty, 5_000);
  assertEquals(p.sells.length, 0, "the fully-filled sell should be removed from the pool");
});

Deno.test("[dark-pool-matching] orders past their deadline are skipped, not matched", () => {
  const buy = order({ orderId: "B1", deadlineAt: NOW - 1, limitPrice: 191 });
  const sell = order({ orderId: "S1", side: "SELL", limitPrice: 189 });
  const p = pool([buy], [sell]);

  const fills = matchSymbol(p, "AAPL", 190, NOW, execIdFactory, settlementDateFactory);
  assertEquals(fills.length, 0);
});

Deno.test("[dark-pool-matching] matching is FIFO by admission time, not by price", () => {
  const earlyBuy = order({ orderId: "B-early", admittedAt: NOW - 5_000, limitPrice: 190, quantity: 5_000, remainingQty: 5_000 });
  const lateBuy = order({ orderId: "B-late", admittedAt: NOW, limitPrice: 200, quantity: 5_000, remainingQty: 5_000 });
  const sell = order({ orderId: "S1", side: "SELL", limitPrice: 189, quantity: 5_000, remainingQty: 5_000 });
  const p = pool([lateBuy, earlyBuy], [sell]);

  const fills = matchSymbol(p, "AAPL", 190, NOW, execIdFactory, settlementDateFactory);

  assertEquals(fills.length, 1);
  assertEquals(fills[0].buyOrderId, "B-early", "the earlier-admitted buy should match first despite the later buy's better limit price");
});

Deno.test("[dark-pool-matching] multiple sequential matches drain both sides of the book", () => {
  const buy = order({ orderId: "B1", quantity: 20_000, remainingQty: 20_000, limitPrice: 191 });
  const sell1 = order({ orderId: "S1", side: "SELL", admittedAt: NOW - 1_000, quantity: 8_000, remainingQty: 8_000, limitPrice: 189 });
  const sell2 = order({ orderId: "S2", side: "SELL", admittedAt: NOW, quantity: 12_000, remainingQty: 12_000, limitPrice: 189 });
  const p = pool([buy], [sell1, sell2]);

  const fills = matchSymbol(p, "AAPL", 190, NOW, execIdFactory, settlementDateFactory);

  assertEquals(fills.length, 2);
  assertEquals(fills[0].matchedQty, 8_000);
  assertEquals(fills[1].matchedQty, 12_000);
  assertEquals(p.buys.length, 0);
  assertEquals(p.sells.length, 0);
});

Deno.test("[dark-pool-matching] an empty pool on either side produces no fills", () => {
  const buy = order({ orderId: "B1" });
  assertEquals(matchSymbol(pool([buy], []), "AAPL", 190, NOW, execIdFactory, settlementDateFactory).length, 0);
  const sell = order({ orderId: "S1", side: "SELL" });
  assertEquals(matchSymbol(pool([], [sell]), "AAPL", 190, NOW, execIdFactory, settlementDateFactory).length, 0);
});

// ── buildOrdersFilled / buildFixExecution ───────────────────────────────────

function fill(overrides: Partial<DarkFill> = {}): DarkFill {
  return {
    execId: "DX00000001",
    buyOrderId: "B1",
    sellOrderId: "S1",
    asset: "AAPL",
    matchedQty: 10_000,
    midPrice: 190,
    settlementDate: "2026-08-20",
    ts: NOW,
    ...overrides,
  };
}

Deno.test("[dark-pool-matching] buildOrdersFilled marks a full fill when remainingQty is zero", () => {
  const o = order({ orderId: "B1", quantity: 10_000, remainingQty: 0 });
  const payload = buildOrdersFilled(fill(), "BUY", o);
  assertEquals(payload.execType, "2");
  assertEquals(payload.marketImpactBps, 0);
  assertEquals(payload.commissionUSD, 0);
  assertEquals(payload.venue, "DARK1");
});

Deno.test("[dark-pool-matching] buildOrdersFilled marks a partial fill when remainingQty is nonzero", () => {
  const o = order({ orderId: "B1", quantity: 15_000, remainingQty: 5_000 });
  const payload = buildOrdersFilled(fill(), "BUY", o);
  assertEquals(payload.execType, "1");
});

Deno.test("[dark-pool-matching] buildFixExecution maps side to FIX 1/2 codes", () => {
  const o = order({ orderId: "B1", remainingQty: 0 });
  const buyPayload = buildFixExecution(fill(), "BUY", o);
  const sellPayload = buildFixExecution(fill(), "SELL", o);
  assertEquals(buyPayload.side, "1");
  assertEquals(sellPayload.side, "2");
});

Deno.test("[dark-pool-matching] buildFixExecution leavesQty/cumQty reflect the order's remaining quantity", () => {
  const o = order({ orderId: "B1", quantity: 15_000, remainingQty: 5_000 });
  const payload = buildFixExecution(fill(), "BUY", o);
  assertEquals(payload.leavesQty, 5_000);
  assertEquals(payload.cumQty, 10_000);
});
