import { describe, expect, it } from "vitest";
import type { TradingLimits } from "../../../store/authSlice";
import { resolveTicket } from "../resolve-ticket";
import type { TicketContext } from "../ticket-types";

// ---------------------------------------------------------------------------
// Helpers — build a valid baseline context; each test overrides what it needs
// ---------------------------------------------------------------------------

const DEFAULT_LIMITS: TradingLimits = {
  max_order_qty: 10_000,
  max_daily_notional: 1_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
  allowed_desks: ["equity"],
  dark_pool_access: false,
};

function makeCtx(overrides: Partial<TicketContext> = {}): TicketContext {
  return {
    userId: "user-1",
    userRole: "trader",
    limits: DEFAULT_LIMITS,
    killBlocks: [],
    instrument: {
      instrumentType: "equity",
      symbol: "AAPL",
      lotSize: 1,
      currentPrice: 189.5,
      orderBookMid: 189.45,
    },
    draft: {
      side: "BUY",
      quantity: 100,
      limitPrice: 189.5,
      strategy: "LIMIT",
      expiresAtSecs: 300,
      tif: "DAY",
    },
    option: {
      optionType: "call",
      strike: 0,
      expirySecs: 0,
      hasQuote: false,
      isFetching: false,
    },
    bond: {
      symbol: "",
      yieldPct: 0,
      hasQuote: false,
      isFetching: false,
      hasBondDef: false,
    },
    dirtyFields: new Set(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveTicket", () => {
  describe("determinism", () => {
    it("returns identical results for identical context", () => {
      const ctx = makeCtx();
      const a = resolveTicket(ctx);
      const b = resolveTicket(ctx);
      expect(a).toEqual(b);
    });
  });

  describe("role lockout", () => {
    it("locks out admin users", () => {
      const r = resolveTicket(makeCtx({ userRole: "admin" }));
      expect(r.roleLocked).toBe(true);
      expect(r.canSubmit).toBe(false);
      expect(r.roleLockedMessage).toContain("Administrators");
    });

    it("locks out compliance users", () => {
      const r = resolveTicket(makeCtx({ userRole: "compliance" }));
      expect(r.roleLocked).toBe(true);
      expect(r.roleLockedMessage).toContain("Compliance");
    });

    it("locks out sales users", () => {
      const r = resolveTicket(makeCtx({ userRole: "sales" }));
      expect(r.roleLocked).toBe(true);
    });

    it("locks out external-client users", () => {
      const r = resolveTicket(makeCtx({ userRole: "external-client" }));
      expect(r.roleLocked).toBe(true);
    });

    it("allows trader users", () => {
      const r = resolveTicket(makeCtx({ userRole: "trader" }));
      expect(r.roleLocked).toBe(false);
    });
  });

  describe("static validation", () => {
    it("errors when quantity is zero", () => {
      const r = resolveTicket(makeCtx({ draft: { ...makeCtx().draft, quantity: 0 } }));
      expect(r.canSubmit).toBe(false);
      expect(r.errors.some((d) => d.ruleId === "qty-positive")).toBe(true);
    });

    it("errors when limit price is zero for equity", () => {
      const r = resolveTicket(makeCtx({ draft: { ...makeCtx().draft, limitPrice: 0 } }));
      expect(r.canSubmit).toBe(false);
      expect(r.errors.some((d) => d.ruleId === "price-positive")).toBe(true);
    });

    it("does NOT error on zero limit price for options", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, instrumentType: "option" },
        option: {
          optionType: "call",
          strike: 150,
          expirySecs: 86400,
          hasQuote: true,
          isFetching: false,
        },
        draft: { ...makeCtx().draft, limitPrice: 0 },
      });
      const r = resolveTicket(ctx);
      expect(r.errors.some((d) => d.ruleId === "price-positive")).toBe(false);
    });

    it("errors when duration is zero", () => {
      const r = resolveTicket(makeCtx({ draft: { ...makeCtx().draft, expiresAtSecs: 0 } }));
      expect(r.errors.some((d) => d.ruleId === "duration-positive")).toBe(true);
    });

    it("errors when symbol is empty", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, symbol: "" },
      });
      const r = resolveTicket(ctx);
      expect(r.errors.some((d) => d.ruleId === "symbol-required")).toBe(true);
    });
  });

  describe("quantity limit", () => {
    it("errors when qty exceeds max_order_qty", () => {
      const r = resolveTicket(makeCtx({ draft: { ...makeCtx().draft, quantity: 15_000 } }));
      expect(r.canSubmit).toBe(false);
      expect(r.errors.some((d) => d.ruleId === "qty-exceeds-limit")).toBe(true);
    });

    it("allows qty at exactly max_order_qty", () => {
      const r = resolveTicket(makeCtx({ draft: { ...makeCtx().draft, quantity: 10_000 } }));
      expect(r.errors.some((d) => d.ruleId === "qty-exceeds-limit")).toBe(false);
    });
  });

  describe("notional limit", () => {
    it("errors when notional exceeds max_daily_notional", () => {
      const r = resolveTicket(
        makeCtx({ draft: { ...makeCtx().draft, quantity: 5_000, limitPrice: 300 } })
      );
      // 5000 * 300 = $1.5M > $1M limit
      expect(r.errors.some((d) => d.ruleId === "notional-exceeds-limit")).toBe(true);
    });

    it("allows notional at boundary", () => {
      const r = resolveTicket(
        makeCtx({ draft: { ...makeCtx().draft, quantity: 3_333, limitPrice: 300 } })
      );
      // 3333 * 300 = $999,900 < $1M
      expect(r.errors.some((d) => d.ruleId === "notional-exceeds-limit")).toBe(false);
    });
  });

  describe("lot size", () => {
    it("warns when qty is not a multiple of lot size", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, lotSize: 100 },
        draft: { ...makeCtx().draft, quantity: 150 },
      });
      const r = resolveTicket(ctx);
      expect(r.warnings.some((d) => d.ruleId === "lot-size")).toBe(true);
      expect(r.warnings.find((d) => d.ruleId === "lot-size")?.message).toContain("200");
    });

    it("does not warn when qty is a multiple of lot size", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, lotSize: 100 },
        draft: { ...makeCtx().draft, quantity: 200 },
      });
      const r = resolveTicket(ctx);
      expect(r.warnings.some((d) => d.ruleId === "lot-size")).toBe(false);
    });

    it("lot size warnings do NOT block submission", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, lotSize: 100 },
        draft: { ...makeCtx().draft, quantity: 150 },
      });
      const r = resolveTicket(ctx);
      expect(r.warnings.length).toBeGreaterThan(0);
      expect(r.canSubmit).toBe(true); // warnings don't block
    });
  });

  describe("strategy permission", () => {
    it("errors when strategy is not permitted", () => {
      const r = resolveTicket(makeCtx({ draft: { ...makeCtx().draft, strategy: "ICEBERG" } }));
      expect(r.errors.some((d) => d.ruleId === "strategy-not-permitted")).toBe(true);
    });

    it("allows permitted strategy", () => {
      const r = resolveTicket(makeCtx({ draft: { ...makeCtx().draft, strategy: "TWAP" } }));
      expect(r.errors.some((d) => d.ruleId === "strategy-not-permitted")).toBe(false);
    });
  });

  describe("kill switch", () => {
    it("errors when all-scope kill is active", () => {
      const r = resolveTicket(
        makeCtx({
          killBlocks: [
            {
              id: "k1",
              scope: "all",
              scopeValues: [],
              issuedBy: "admin-1",
              issuedAt: Date.now(),
            },
          ],
        })
      );
      expect(r.errors.some((d) => d.ruleId === "kill-switch-blocked")).toBe(true);
      expect(r.canSubmit).toBe(false);
    });

    it("blocks symbol-scoped kill for matching asset", () => {
      const r = resolveTicket(
        makeCtx({
          killBlocks: [
            {
              id: "k2",
              scope: "symbol",
              scopeValues: ["AAPL"],
              issuedBy: "admin-1",
              issuedAt: Date.now(),
            },
          ],
        })
      );
      expect(r.errors.some((d) => d.ruleId === "kill-switch-blocked")).toBe(true);
    });

    it("does NOT block symbol-scoped kill for different asset", () => {
      const r = resolveTicket(
        makeCtx({
          instrument: { ...makeCtx().instrument, symbol: "MSFT" },
          killBlocks: [
            {
              id: "k3",
              scope: "symbol",
              scopeValues: ["AAPL"],
              issuedBy: "admin-1",
              issuedAt: Date.now(),
            },
          ],
        })
      );
      expect(r.errors.some((d) => d.ruleId === "kill-switch-blocked")).toBe(false);
    });

    it("ignores expired kill blocks", () => {
      const r = resolveTicket(
        makeCtx({
          killBlocks: [
            {
              id: "k4",
              scope: "all",
              scopeValues: [],
              issuedBy: "admin-1",
              issuedAt: Date.now() - 60_000,
              resumeAt: Date.now() - 1_000, // expired 1s ago
            },
          ],
        })
      );
      expect(r.errors.some((d) => d.ruleId === "kill-switch-blocked")).toBe(false);
    });
  });

  describe("desk access", () => {
    it("errors when instrument desk is not in allowed_desks", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, instrumentType: "bond" },
        limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity"] },
      });
      const r = resolveTicket(ctx);
      expect(r.errors.some((d) => d.ruleId === "desk-access-denied")).toBe(true);
    });

    it("allows when desk is in allowed_desks", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, instrumentType: "option" },
        limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "derivatives"] },
        option: {
          optionType: "call",
          strike: 150,
          expirySecs: 86400,
          hasQuote: true,
          isFetching: false,
        },
      });
      const r = resolveTicket(ctx);
      expect(r.errors.some((d) => d.ruleId === "desk-access-denied")).toBe(false);
    });
  });

  describe("instrument spec validation", () => {
    it("errors when option has no quote and not fetching", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, instrumentType: "option" },
        limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "derivatives"] },
        option: {
          optionType: "call",
          strike: 150,
          expirySecs: 86400,
          hasQuote: false,
          isFetching: false,
        },
      });
      const r = resolveTicket(ctx);
      expect(r.errors.some((d) => d.ruleId === "option-quote-missing")).toBe(true);
    });

    it("errors when option strike is zero", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, instrumentType: "option" },
        limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "derivatives"] },
        option: {
          optionType: "call",
          strike: 0,
          expirySecs: 86400,
          hasQuote: true,
          isFetching: false,
        },
      });
      const r = resolveTicket(ctx);
      expect(r.errors.some((d) => d.ruleId === "option-strike-required")).toBe(true);
    });

    it("errors when bond has no bond definition", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, instrumentType: "bond" },
        limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "fi"] },
        bond: {
          symbol: "US10Y",
          yieldPct: 4.5,
          hasQuote: false,
          isFetching: false,
          hasBondDef: false,
        },
      });
      const r = resolveTicket(ctx);
      expect(r.errors.some((d) => d.ruleId === "bond-def-missing")).toBe(true);
    });

    it("info diagnostic when option is fetching", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, instrumentType: "option" },
        limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "derivatives"] },
        option: {
          optionType: "call",
          strike: 150,
          expirySecs: 86400,
          hasQuote: false,
          isFetching: true,
        },
      });
      const r = resolveTicket(ctx);
      expect(r.diagnostics.some((d) => d.ruleId === "option-quote-fetching")).toBe(true);
    });
  });

  describe("dark pool eligibility", () => {
    it("eligible when dark_pool_access=true and qty >= 10000", () => {
      const ctx = makeCtx({
        limits: { ...DEFAULT_LIMITS, dark_pool_access: true },
        draft: { ...makeCtx().draft, quantity: 10_000 },
      });
      const r = resolveTicket(ctx);
      expect(r.darkPoolEligible).toBe(true);
    });

    it("ineligible when dark_pool_access=false", () => {
      const ctx = makeCtx({
        limits: { ...DEFAULT_LIMITS, dark_pool_access: false },
        draft: { ...makeCtx().draft, quantity: 10_000 },
      });
      const r = resolveTicket(ctx);
      expect(r.darkPoolEligible).toBe(false);
    });

    it("ineligible when qty < 10000", () => {
      const ctx = makeCtx({
        limits: { ...DEFAULT_LIMITS, dark_pool_access: true },
        draft: { ...makeCtx().draft, quantity: 9_999 },
      });
      const r = resolveTicket(ctx);
      expect(r.darkPoolEligible).toBe(false);
    });

    it("ineligible for non-equity instruments", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, instrumentType: "bond" },
        limits: { ...DEFAULT_LIMITS, dark_pool_access: true, allowed_desks: ["equity", "fi"] },
        draft: { ...makeCtx().draft, quantity: 10_000 },
        bond: {
          symbol: "US10Y",
          yieldPct: 4.5,
          hasQuote: true,
          isFetching: false,
          hasBondDef: true,
        },
      });
      const r = resolveTicket(ctx);
      expect(r.darkPoolEligible).toBe(false);
    });
  });

  describe("field visibility", () => {
    it("shows strategy selector for equity", () => {
      const r = resolveTicket(makeCtx());
      expect(r.showStrategySelector).toBe(true);
    });

    it("hides strategy selector for options", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, instrumentType: "option" },
        limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "derivatives"] },
        option: {
          optionType: "call",
          strike: 150,
          expirySecs: 86400,
          hasQuote: true,
          isFetching: false,
        },
      });
      const r = resolveTicket(ctx);
      expect(r.showStrategySelector).toBe(false);
    });

    it("hides strategy selector for bonds", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, instrumentType: "bond" },
        limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "fi"] },
        bond: {
          symbol: "US10Y",
          yieldPct: 4.5,
          hasQuote: true,
          isFetching: false,
          hasBondDef: true,
        },
      });
      const r = resolveTicket(ctx);
      expect(r.showStrategySelector).toBe(false);
    });

    it("hides asset selector for bonds", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, instrumentType: "bond" },
        limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "fi"] },
        bond: {
          symbol: "US10Y",
          yieldPct: 4.5,
          hasQuote: true,
          isFetching: false,
          hasBondDef: true,
        },
      });
      const r = resolveTicket(ctx);
      expect(r.showAssetSelector).toBe(false);
    });
  });

  describe("strategy options", () => {
    it("lists all 9 strategies", () => {
      const r = resolveTicket(makeCtx());
      expect(r.strategyOptions).toHaveLength(9);
    });

    it("marks permitted strategies as enabled", () => {
      const r = resolveTicket(makeCtx());
      const twap = r.strategyOptions.find((s) => s.value === "TWAP");
      expect(twap?.enabled).toBe(true);
    });

    it("marks non-permitted strategies as disabled", () => {
      const r = resolveTicket(makeCtx());
      const iceberg = r.strategyOptions.find((s) => s.value === "ICEBERG");
      expect(iceberg?.enabled).toBe(false);
      expect(iceberg?.label).toContain("not permitted");
    });
  });

  describe("available instrument types", () => {
    it("reflects allowed desks", () => {
      const ctx = makeCtx({
        limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "derivatives", "fi"] },
      });
      const r = resolveTicket(ctx);
      expect(r.availableInstrumentTypes).toContain("equity");
      expect(r.availableInstrumentTypes).toContain("option");
      expect(r.availableInstrumentTypes).toContain("bond");
      expect(r.availableInstrumentTypes).not.toContain("fx");
    });
  });

  describe("computed values", () => {
    it("computes notional", () => {
      const r = resolveTicket(
        makeCtx({ draft: { ...makeCtx().draft, quantity: 100, limitPrice: 189.5 } })
      );
      expect(r.notional).toBeCloseTo(18_950);
    });

    it("notional is null when qty or price is zero", () => {
      const r = resolveTicket(
        makeCtx({ draft: { ...makeCtx().draft, quantity: 0, limitPrice: 189.5 } })
      );
      expect(r.notional).toBeNull();
    });

    it("computes arrival slippage vs mid", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, orderBookMid: 189.0 },
        draft: { ...makeCtx().draft, limitPrice: 190.0, side: "BUY" },
      });
      const r = resolveTicket(ctx);
      // (190 - 189) / 189 * 10000 * 1 ≈ 52.9 bps
      expect(r.arrivalSlippageBps).toBeCloseTo(52.9, 0);
    });
  });

  describe("quantity labels", () => {
    it("shows 'Contracts' for options", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, instrumentType: "option" },
        limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "derivatives"] },
        option: {
          optionType: "call",
          strike: 150,
          expirySecs: 86400,
          hasQuote: true,
          isFetching: false,
        },
      });
      const r = resolveTicket(ctx);
      expect(r.quantityLabel).toBe("Contracts");
    });

    it("shows '(shares)' for equity", () => {
      const r = resolveTicket(makeCtx());
      expect(r.quantitySubLabel).toBe("(shares)");
    });

    it("shows '(bonds)' for bonds", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, instrumentType: "bond" },
        limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "fi"] },
        bond: {
          symbol: "US10Y",
          yieldPct: 4.5,
          hasQuote: true,
          isFetching: false,
          hasBondDef: true,
        },
      });
      const r = resolveTicket(ctx);
      expect(r.quantitySubLabel).toBe("(bonds)");
    });
  });

  describe("canSubmit composite", () => {
    it("true when all inputs are valid", () => {
      const r = resolveTicket(makeCtx());
      expect(r.canSubmit).toBe(true);
      expect(r.errors).toHaveLength(0);
    });

    it("false when any single error exists", () => {
      const r = resolveTicket(makeCtx({ draft: { ...makeCtx().draft, quantity: 0 } }));
      expect(r.canSubmit).toBe(false);
    });

    it("true when only warnings exist (warnings do not block)", () => {
      const ctx = makeCtx({
        instrument: { ...makeCtx().instrument, lotSize: 100 },
        draft: { ...makeCtx().draft, quantity: 150 },
      });
      const r = resolveTicket(ctx);
      expect(r.warnings.length).toBeGreaterThan(0);
      expect(r.errors).toHaveLength(0);
      expect(r.canSubmit).toBe(true);
    });
  });

  describe("performance", () => {
    it("resolves in under 1ms", () => {
      const ctx = makeCtx();
      // Warm up
      resolveTicket(ctx);

      const start = performance.now();
      const iterations = 10_000;
      for (let i = 0; i < iterations; i++) {
        resolveTicket(ctx);
      }
      const elapsed = performance.now() - start;
      const perCall = elapsed / iterations;

      // Must be well under 1ms — targeting sub-0.1ms
      expect(perCall).toBeLessThan(1);
    });
  });
});
