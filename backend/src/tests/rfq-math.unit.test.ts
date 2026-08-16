import { assertEquals } from "jsr:@std/assert@0.217";
import {
  type BondSpec,
  type DealerProfile,
  type DealerQuote,
  computeDealerYieldAndPrice,
  isUstBond,
  priceBond,
  selectBestQuote,
  specialisationBonus,
} from "../rfq/rfq-math.ts";

function bond(overrides: Partial<BondSpec> = {}): BondSpec {
  return {
    isin: "US912828XX00",
    symbol: "T10Y",
    description: "10Y Treasury",
    couponRate: 0.04,
    maturityDate: "2036-01-01",
    totalPeriods: 20,
    periodsPerYear: 2,
    faceValue: 1000,
    yieldAtOrder: 0.045,
    creditRating: "AAA",
    ...overrides,
  };
}

// ── priceBond ────────────────────────────────────────────────────────────────

Deno.test("[rfq-math] priceBond returns clean price near 1.0 at par-ish yield", () => {
  const price = priceBond(bond(), 0.04); // coupon rate == yield → close to par
  assertEquals(Math.abs(price - 1) < 0.02, true, `expected near-par price, got ${price}`);
});

Deno.test("[rfq-math] priceBond falls as yield rises, above the coupon rate", () => {
  const lowYield = priceBond(bond(), 0.03);
  const highYield = priceBond(bond(), 0.06);
  assertEquals(highYield < lowYield, true);
});

Deno.test("[rfq-math] priceBond handles the zero-yield edge case without dividing by zero", () => {
  const price = priceBond(bond({ couponRate: 0.04, totalPeriods: 10, periodsPerYear: 2, faceValue: 1000 }), 0);
  // sum of coupons + face, undiscounted: (0.04*1000/2)*10 + 1000, as a fraction of face
  const expected = ((0.04 * 1000 / 2) * 10 + 1000) / 1000;
  assertEquals(price, expected);
});

Deno.test("[rfq-math] priceBond of a zero-coupon bond at zero yield is exactly par", () => {
  const price = priceBond(bond({ couponRate: 0, totalPeriods: 10, periodsPerYear: 2 }), 0);
  assertEquals(price, 1);
});

// ── isUstBond ────────────────────────────────────────────────────────────────

Deno.test("[rfq-math] isUstBond is true for AAA + US9128-prefixed ISIN", () => {
  assertEquals(isUstBond({ creditRating: "AAA", isin: "US9128283F19" }), true);
});

Deno.test("[rfq-math] isUstBond is false without the ISIN prefix, even if AAA", () => {
  assertEquals(isUstBond({ creditRating: "AAA", isin: "US0378331005" }), false);
});

Deno.test("[rfq-math] isUstBond is false without AAA rating, even with the ISIN prefix", () => {
  assertEquals(isUstBond({ creditRating: "AA", isin: "US9128283F19" }), false);
});

// ── specialisationBonus ────────────────────────────────────────────────────

Deno.test("[rfq-math] a UST-specialist dealer gets a bonus on UST bonds", () => {
  const dealer: Pick<DealerProfile, "specialisation"> = { specialisation: "UST" };
  assertEquals(specialisationBonus(dealer, true), 0.5);
});

Deno.test("[rfq-math] a UST-specialist dealer gets no bonus on non-UST bonds", () => {
  const dealer: Pick<DealerProfile, "specialisation"> = { specialisation: "UST" };
  assertEquals(specialisationBonus(dealer, false), 0);
});

Deno.test("[rfq-math] a Corp-specialist dealer gets a bonus on non-UST bonds", () => {
  const dealer: Pick<DealerProfile, "specialisation"> = { specialisation: "Corp" };
  assertEquals(specialisationBonus(dealer, false), 0.5);
});

Deno.test("[rfq-math] an all-rounder dealer never gets a specialisation bonus", () => {
  const dealer: Pick<DealerProfile, "specialisation"> = { specialisation: "all" };
  assertEquals(specialisationBonus(dealer, true), 0);
  assertEquals(specialisationBonus(dealer, false), 0);
});

// ── computeDealerYieldAndPrice ──────────────────────────────────────────────

Deno.test("[rfq-math] a BUY quote yields above the reference yield (dealer sells at ask)", () => {
  const spec = bond({ yieldAtOrder: 0.045 });
  const { yield: y } = computeDealerYieldAndPrice(spec, "BUY", 3.0);
  assertEquals(y > spec.yieldAtOrder, true);
});

Deno.test("[rfq-math] a SELL quote yields below the reference yield (dealer bids)", () => {
  const spec = bond({ yieldAtOrder: 0.045 });
  const { yield: y } = computeDealerYieldAndPrice(spec, "SELL", 3.0);
  assertEquals(y < spec.yieldAtOrder, true);
});

Deno.test("[rfq-math] zero spread yields exactly the reference yield", () => {
  const spec = bond({ yieldAtOrder: 0.045 });
  const buy = computeDealerYieldAndPrice(spec, "BUY", 0);
  const sell = computeDealerYieldAndPrice(spec, "SELL", 0);
  assertEquals(buy.yield, spec.yieldAtOrder);
  assertEquals(sell.yield, spec.yieldAtOrder);
  assertEquals(buy.price, sell.price);
});

// ── selectBestQuote ──────────────────────────────────────────────────────────

function quote(overrides: Partial<DealerQuote> = {}): DealerQuote {
  return {
    dealerId: "GSCO",
    dealerName: "Goldman Sachs",
    price: 1.0,
    yield: 0.045,
    spreadBps: 3,
    notional: 1_000_000,
    receivedAt: Date.now(),
    ...overrides,
  };
}

Deno.test("[rfq-math] selectBestQuote returns undefined for an empty list", () => {
  assertEquals(selectBestQuote([], "BUY"), undefined);
});

Deno.test("[rfq-math] selectBestQuote for BUY picks the lowest yield", () => {
  const quotes = [quote({ dealerId: "A", yield: 0.05 }), quote({ dealerId: "B", yield: 0.045 }), quote({ dealerId: "C", yield: 0.048 })];
  assertEquals(selectBestQuote(quotes, "BUY")?.dealerId, "B");
});

Deno.test("[rfq-math] selectBestQuote for SELL picks the highest yield", () => {
  const quotes = [quote({ dealerId: "A", yield: 0.05 }), quote({ dealerId: "B", yield: 0.045 }), quote({ dealerId: "C", yield: 0.048 })];
  assertEquals(selectBestQuote(quotes, "SELL")?.dealerId, "A");
});

Deno.test("[rfq-math] selectBestQuote keeps the first quote on an exact tie", () => {
  const quotes = [quote({ dealerId: "first", yield: 0.045 }), quote({ dealerId: "second", yield: 0.045 })];
  assertEquals(selectBestQuote(quotes, "BUY")?.dealerId, "first");
});

Deno.test("[rfq-math] selectBestQuote with a single quote returns it regardless of side", () => {
  const quotes = [quote({ dealerId: "solo" })];
  assertEquals(selectBestQuote(quotes, "BUY")?.dealerId, "solo");
  assertEquals(selectBestQuote(quotes, "SELL")?.dealerId, "solo");
});
