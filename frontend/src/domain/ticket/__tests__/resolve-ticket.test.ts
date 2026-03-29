import { describe, expect, it } from "vitest";
import type { TradingLimits } from "../../../store/authSlice";
import type { SessionState } from "../../market/market-session";
import { resolveTicket } from "../resolve-ticket";
import type { TicketContext } from "../ticket-types";

const DEFAULT_LIMITS: TradingLimits = {
  max_order_qty: 10_000,
  max_daily_notional: 1_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
  allowed_desks: ["equity"],
  dark_pool_access: false,
};

const CONTINUOUS_SESSION: SessionState = {
  phase: "CONTINUOUS",
  allowsOrderEntry: true,
  allowsAmend: true,
  allowsCancel: true,
  supportedStrategies: [
    "LIMIT",
    "TWAP",
    "POV",
    "VWAP",
    "ICEBERG",
    "SNIPER",
    "ARRIVAL_PRICE",
    "IS",
    "MOMENTUM",
  ],
  phaseLabel: "Continuous Trading",
};

const HALTED_SESSION: SessionState = {
  phase: "HALTED",
  allowsOrderEntry: false,
  allowsAmend: false,
  allowsCancel: true,
  supportedStrategies: [],
  phaseLabel: "Trading Halted",
};

const AUCTION_SESSION: SessionState = {
  phase: "OPENING_AUCTION",
  allowsOrderEntry: true,
  allowsAmend: true,
  allowsCancel: true,
  supportedStrategies: ["LIMIT"],
  phaseLabel: "Opening Auction",
};

const VALID_OPTION = {
  optionType: "call" as const,
  strike: 150,
  expirySecs: 86400,
  hasQuote: true,
  isFetching: false,
};
const VALID_BOND = {
  symbol: "US10Y",
  yieldPct: 4.5,
  hasQuote: true,
  isFetching: false,
  hasBondDef: true,
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
    option: { optionType: "call", strike: 0, expirySecs: 0, hasQuote: false, isFetching: false },
    bond: { symbol: "", yieldPct: 0, hasQuote: false, isFetching: false, hasBondDef: false },
    session: CONTINUOUS_SESSION,
    dirtyFields: new Set(),
    ...overrides,
  };
}

function withDraft(overrides: Partial<TicketContext["draft"]>): Partial<TicketContext> {
  return { draft: { ...makeCtx().draft, ...overrides } };
}

describe("resolveTicket", () => {
  it("returns identical results for identical context", () => {
    const ctx = makeCtx();
    expect(resolveTicket(ctx)).toEqual(resolveTicket(ctx));
  });

  describe("role lockout", () => {
    it.each([
      "admin",
      "compliance",
      "sales",
      "external-client",
    ] as const)("locks out %s users", (role) => {
      const r = resolveTicket(makeCtx({ userRole: role }));
      expect(r.roleLocked).toBe(true);
      expect(r.canSubmit).toBe(false);
    });

    it("allows trader users", () => {
      expect(resolveTicket(makeCtx({ userRole: "trader" })).roleLocked).toBe(false);
    });
  });

  describe("static validation", () => {
    it.each([
      ["quantity is zero", withDraft({ quantity: 0 }), "qty-positive"],
      ["limit price is zero for equity", withDraft({ limitPrice: 0 }), "price-positive"],
      ["duration is zero", withDraft({ expiresAtSecs: 0 }), "duration-positive"],
      [
        "symbol is empty",
        { instrument: { ...makeCtx().instrument, symbol: "" } },
        "symbol-required",
      ],
    ] as const)("errors when %s", (_desc, overrides, ruleId) => {
      const r = resolveTicket(makeCtx(overrides));
      expect(r.errors.some((d) => d.ruleId === ruleId)).toBe(true);
    });

    it("does NOT error on zero limit price for options", () => {
      const r = resolveTicket(
        makeCtx({
          instrument: { ...makeCtx().instrument, instrumentType: "option" },
          option: VALID_OPTION,
          ...withDraft({ limitPrice: 0 }),
        })
      );
      expect(r.errors.some((d) => d.ruleId === "price-positive")).toBe(false);
    });
  });

  describe("quantity and notional limits", () => {
    it.each([
      [15_000, 189.5, "qty-exceeds-limit", true],
      [10_000, 189.5, "qty-exceeds-limit", false],
      [5_000, 300, "notional-exceeds-limit", true],
      [3_333, 300, "notional-exceeds-limit", false],
    ] as const)("qty=%d price=%d → %s present=%s", (qty, price, ruleId, expected) => {
      const r = resolveTicket(makeCtx(withDraft({ quantity: qty, limitPrice: price })));
      expect(r.errors.some((d) => d.ruleId === ruleId)).toBe(expected);
    });
  });

  describe("lot size", () => {
    it("warns when qty is not a multiple of lot size", () => {
      const r = resolveTicket(
        makeCtx({
          instrument: { ...makeCtx().instrument, lotSize: 100 },
          ...withDraft({ quantity: 150 }),
        })
      );
      expect(r.warnings.some((d) => d.ruleId === "lot-size")).toBe(true);
      expect(r.warnings.find((d) => d.ruleId === "lot-size")?.message).toContain("200");
      expect(r.canSubmit).toBe(true);
    });

    it("does not warn when qty is a multiple of lot size", () => {
      const r = resolveTicket(
        makeCtx({
          instrument: { ...makeCtx().instrument, lotSize: 100 },
          ...withDraft({ quantity: 200 }),
        })
      );
      expect(r.warnings.some((d) => d.ruleId === "lot-size")).toBe(false);
    });
  });

  describe("strategy permission", () => {
    it.each([
      ["ICEBERG", true],
      ["TWAP", false],
    ] as const)("strategy %s → error=%s", (strategy, expectError) => {
      const r = resolveTicket(makeCtx(withDraft({ strategy })));
      expect(r.errors.some((d) => d.ruleId === "strategy-not-permitted")).toBe(expectError);
    });
  });

  describe("kill switch", () => {
    it("blocks on all-scope kill", () => {
      const r = resolveTicket(
        makeCtx({
          killBlocks: [
            { id: "k1", scope: "all", scopeValues: [], issuedBy: "admin-1", issuedAt: Date.now() },
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
              resumeAt: Date.now() - 1_000,
            },
          ],
        })
      );
      expect(r.errors.some((d) => d.ruleId === "kill-switch-blocked")).toBe(false);
    });
  });

  describe("desk access", () => {
    it.each([
      ["bond", ["equity"], true],
      ["option", ["equity", "derivatives"], false],
    ] as const)("instrumentType=%s desks=%j → denied=%s", (instrumentType, desks, expectDenied) => {
      const r = resolveTicket(
        makeCtx({
          instrument: { ...makeCtx().instrument, instrumentType },
          limits: { ...DEFAULT_LIMITS, allowed_desks: [...desks] },
          ...(instrumentType === "option" ? { option: VALID_OPTION } : {}),
          ...(instrumentType === "bond" ? { bond: VALID_BOND } : {}),
        })
      );
      expect(r.errors.some((d) => d.ruleId === "desk-access-denied")).toBe(expectDenied);
    });
  });

  describe("instrument spec validation", () => {
    it.each([
      [
        "option has no quote",
        { strike: 150, expirySecs: 86400, hasQuote: false, isFetching: false },
        "option-quote-missing",
      ],
      [
        "option strike is zero",
        { strike: 0, expirySecs: 86400, hasQuote: true, isFetching: false },
        "option-strike-required",
      ],
    ] as const)("errors when %s", (_desc, optionOverrides, ruleId) => {
      const r = resolveTicket(
        makeCtx({
          instrument: { ...makeCtx().instrument, instrumentType: "option" },
          limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "derivatives"] },
          option: { optionType: "call", ...optionOverrides },
        })
      );
      expect(r.errors.some((d) => d.ruleId === ruleId)).toBe(true);
    });

    it("errors when bond has no definition", () => {
      const r = resolveTicket(
        makeCtx({
          instrument: { ...makeCtx().instrument, instrumentType: "bond" },
          limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "fi"] },
          bond: {
            symbol: "US10Y",
            yieldPct: 4.5,
            hasQuote: false,
            isFetching: false,
            hasBondDef: false,
          },
        })
      );
      expect(r.errors.some((d) => d.ruleId === "bond-def-missing")).toBe(true);
    });

    it("shows info when option quote is fetching", () => {
      const r = resolveTicket(
        makeCtx({
          instrument: { ...makeCtx().instrument, instrumentType: "option" },
          limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "derivatives"] },
          option: {
            optionType: "call",
            strike: 150,
            expirySecs: 86400,
            hasQuote: false,
            isFetching: true,
          },
        })
      );
      expect(r.diagnostics.some((d) => d.ruleId === "option-quote-fetching")).toBe(true);
    });
  });

  describe("dark pool eligibility", () => {
    it.each([
      [true, 10_000, "equity", true],
      [false, 10_000, "equity", false],
      [true, 9_999, "equity", false],
      [true, 10_000, "bond", false],
    ] as const)("access=%s qty=%d type=%s → eligible=%s", (access, qty, type, expected) => {
      const r = resolveTicket(
        makeCtx({
          limits: { ...DEFAULT_LIMITS, dark_pool_access: access, allowed_desks: ["equity", "fi"] },
          ...withDraft({ quantity: qty }),
          instrument: { ...makeCtx().instrument, instrumentType: type },
          ...(type === "bond" ? { bond: VALID_BOND } : {}),
        })
      );
      expect(r.darkPoolEligible).toBe(expected);
    });
  });

  describe("field visibility", () => {
    it.each([
      ["equity", "showStrategySelector", true],
      ["option", "showStrategySelector", false],
      ["bond", "showStrategySelector", false],
      ["bond", "showAssetSelector", false],
      ["equity", "showAssetSelector", true],
    ] as const)("%s → %s=%s", (instrumentType, field, expected) => {
      const r = resolveTicket(
        makeCtx({
          instrument: { ...makeCtx().instrument, instrumentType },
          limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "derivatives", "fi"] },
          ...(instrumentType === "option" ? { option: VALID_OPTION } : {}),
          ...(instrumentType === "bond" ? { bond: VALID_BOND } : {}),
        })
      );
      expect(r[field as keyof typeof r]).toBe(expected);
    });
  });

  describe("strategy options", () => {
    it("lists all 9 strategies with correct enabled state", () => {
      const r = resolveTicket(makeCtx());
      expect(r.strategyOptions).toHaveLength(9);
      expect(r.strategyOptions.find((s) => s.value === "TWAP")?.enabled).toBe(true);
      expect(r.strategyOptions.find((s) => s.value === "ICEBERG")?.enabled).toBe(false);
    });
  });

  describe("available instrument types", () => {
    it("reflects allowed desks", () => {
      const r = resolveTicket(
        makeCtx({
          limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "derivatives", "fi"] },
        })
      );
      expect(r.availableInstrumentTypes).toContain("equity");
      expect(r.availableInstrumentTypes).toContain("option");
      expect(r.availableInstrumentTypes).toContain("bond");
      expect(r.availableInstrumentTypes).not.toContain("fx");
    });
  });

  describe("computed values", () => {
    it.each([
      [100, 189.5, 18_950],
      [0, 189.5, null],
      [100, 0, null],
    ] as const)("qty=%d price=%d → notional=%s", (qty, price, expected) => {
      const r = resolveTicket(makeCtx(withDraft({ quantity: qty, limitPrice: price })));
      if (expected === null) {
        expect(r.notional).toBeNull();
      } else {
        expect(r.notional).toBeCloseTo(expected);
      }
    });

    it("computes arrival slippage vs mid", () => {
      const r = resolveTicket(
        makeCtx({
          instrument: { ...makeCtx().instrument, orderBookMid: 189.0 },
          ...withDraft({ limitPrice: 190.0, side: "BUY" }),
        })
      );
      expect(r.arrivalSlippageBps).toBeCloseTo(52.9, 0);
    });
  });

  describe("quantity labels", () => {
    it.each([
      ["option", "Contracts", "(1 contract = 100 shares)"],
      ["equity", "Quantity", "(shares)"],
      ["bond", "Quantity", "(bonds)"],
    ] as const)("%s → label=%s subLabel=%s", (instrumentType, expectedLabel, expectedSub) => {
      const r = resolveTicket(
        makeCtx({
          instrument: { ...makeCtx().instrument, instrumentType },
          limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "derivatives", "fi"] },
          ...(instrumentType === "option" ? { option: VALID_OPTION } : {}),
          ...(instrumentType === "bond" ? { bond: VALID_BOND } : {}),
        })
      );
      expect(r.quantityLabel).toBe(expectedLabel);
      expect(r.quantitySubLabel).toBe(expectedSub);
    });
  });

  describe("canSubmit composite", () => {
    it("true with valid inputs, false with errors, true with only warnings", () => {
      expect(resolveTicket(makeCtx()).canSubmit).toBe(true);
      expect(resolveTicket(makeCtx(withDraft({ quantity: 0 }))).canSubmit).toBe(false);

      const warningCtx = makeCtx({
        instrument: { ...makeCtx().instrument, lotSize: 100 },
        ...withDraft({ quantity: 150 }),
      });
      const r = resolveTicket(warningCtx);
      expect(r.warnings.length).toBeGreaterThan(0);
      expect(r.errors).toHaveLength(0);
      expect(r.canSubmit).toBe(true);
    });
  });

  describe("session rules", () => {
    it.each([
      ["HALTED", "session.entry-blocked"],
      ["CLOSED", "session.entry-blocked"],
    ] as const)("blocks order entry when market is %s", (phase, ruleId) => {
      const r = resolveTicket(
        makeCtx({
          session: {
            ...HALTED_SESSION,
            phase: phase as "HALTED" | "CLOSED",
            phaseLabel: phase === "HALTED" ? "Trading Halted" : "Market Closed",
          },
        })
      );
      expect(r.canSubmit).toBe(false);
      expect(r.sessionAllowsEntry).toBe(false);
      expect(r.errors.some((d) => d.ruleId === ruleId)).toBe(true);
    });

    it("blocks algos during auction, allows LIMIT", () => {
      const twapResult = resolveTicket(
        makeCtx({ session: AUCTION_SESSION, ...withDraft({ strategy: "TWAP" }) })
      );
      expect(twapResult.errors.some((d) => d.ruleId === "session.strategy-not-supported")).toBe(
        true
      );

      const limitResult = resolveTicket(
        makeCtx({ session: AUCTION_SESSION, ...withDraft({ strategy: "LIMIT" }) })
      );
      expect(limitResult.errors.filter((d) => d.ruleId.startsWith("session."))).toHaveLength(0);
    });

    it("shows info diagnostic during auction and pre-open", () => {
      const closingAuction: SessionState = {
        ...AUCTION_SESSION,
        phase: "CLOSING_AUCTION",
        phaseLabel: "Closing Auction",
        allowsAmend: false,
      };
      const auctionResult = resolveTicket(
        makeCtx({ session: closingAuction, ...withDraft({ strategy: "LIMIT" }) })
      );
      expect(auctionResult.diagnostics.some((d) => d.ruleId === "session.auction-info")).toBe(true);

      const preOpen: SessionState = {
        ...AUCTION_SESSION,
        phase: "PRE_OPEN",
        phaseLabel: "Pre-Open",
      };
      const preOpenResult = resolveTicket(
        makeCtx({ session: preOpen, ...withDraft({ strategy: "LIMIT" }) })
      );
      expect(preOpenResult.diagnostics.some((d) => d.ruleId === "session.pre-open-info")).toBe(
        true
      );
    });

    it("disables non-LIMIT strategies in dropdown during auction", () => {
      const r = resolveTicket(makeCtx({ session: AUCTION_SESSION }));
      expect(r.strategyOptions.find((s) => s.value === "TWAP")?.enabled).toBe(false);
      expect(r.strategyOptions.find((s) => s.value === "TWAP")?.disabledReason).toContain(
        "Opening Auction"
      );
      expect(r.strategyOptions.find((s) => s.value === "LIMIT")?.enabled).toBe(true);
    });

    it("skips session rules for options", () => {
      const r = resolveTicket(
        makeCtx({
          instrument: { ...makeCtx().instrument, instrumentType: "option" },
          limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "derivatives"] },
          session: HALTED_SESSION,
          option: VALID_OPTION,
        })
      );
      expect(r.errors.some((d) => d.ruleId === "session.entry-blocked")).toBe(false);
    });

    it("exposes marketPhaseLabel", () => {
      expect(resolveTicket(makeCtx()).marketPhaseLabel).toBe("Continuous Trading");
    });
  });

  describe("venue rules", () => {
    it("no errors when no venue selected", () => {
      expect(
        resolveTicket(makeCtx()).errors.filter((d) => d.ruleId.startsWith("venue."))
      ).toHaveLength(0);
    });

    it.each([
      ["IEX", "ICEBERG", "venue.strategy-unsupported"],
      ["EDGX", "ICEBERG", "venue.no-iceberg"],
    ] as const)("venue=%s strategy=%s → %s", (venue, strategy, ruleId) => {
      const r = resolveTicket(
        makeCtx({
          selectedVenue: venue,
          ...withDraft({ strategy }),
          limits: {
            ...DEFAULT_LIMITS,
            allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP", "ICEBERG"],
          },
        })
      );
      expect(r.errors.some((d) => d.ruleId === ruleId)).toBe(true);
    });

    it("blocks dark pool during halt", () => {
      const r = resolveTicket(makeCtx({ selectedVenue: "DARK1", session: HALTED_SESSION }));
      expect(r.errors.some((d) => d.ruleId === "venue.dark-halted")).toBe(true);
    });

    it("blocks market orders on IEX", () => {
      const r = resolveTicket(makeCtx({ selectedVenue: "IEX", ...withDraft({ limitPrice: 0 }) }));
      expect(r.errors.some((d) => d.ruleId === "venue.no-market-orders")).toBe(true);
    });

    it.each([
      [5_000, true],
      [10_000, false],
    ] as const)("dark pool qty=%d → min-quantity error=%s", (qty, expectError) => {
      const r = resolveTicket(
        makeCtx({
          selectedVenue: "DARK1",
          ...withDraft({ quantity: qty }),
          limits: { ...DEFAULT_LIMITS, dark_pool_access: true },
        })
      );
      expect(r.errors.some((d) => d.ruleId === "venue.min-quantity")).toBe(expectError);
    });

    it("warns about non-auction venue during auction", () => {
      const r = resolveTicket(
        makeCtx({
          selectedVenue: "BATS",
          session: AUCTION_SESSION,
          ...withDraft({ strategy: "LIMIT" }),
        })
      );
      expect(r.warnings.some((d) => d.ruleId === "venue.no-auction-support")).toBe(true);
    });
  });

  describe("spread check", () => {
    it.each([
      [undefined, "spread.wide", false, "spread.exceeds-max", false],
      [10, "spread.wide", false, "spread.exceeds-max", false],
      [75, "spread.wide", true, "spread.exceeds-max", false],
      [250, "spread.wide", false, "spread.exceeds-max", true],
    ] as const)("spreadBps=%s → wide=%s, blocked=%s", (bps, _wideId, expectWide, _blockId, expectBlock) => {
      const r = resolveTicket(makeCtx({ spreadBps: bps }));
      expect(r.warnings.some((d) => d.ruleId === "spread.wide")).toBe(expectWide);
      expect(r.errors.some((d) => d.ruleId === "spread.exceeds-max")).toBe(expectBlock);
    });

    it("skips spread check for bonds", () => {
      const r = resolveTicket(
        makeCtx({
          instrument: { ...makeCtx().instrument, instrumentType: "bond" },
          limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "fi"] },
          spreadBps: 300,
          bond: VALID_BOND,
        })
      );
      expect(r.diagnostics.filter((d) => d.ruleId.startsWith("spread."))).toHaveLength(0);
    });
  });

  describe("resolvedFields", () => {
    it("includes all registered field keys", () => {
      const r = resolveTicket(makeCtx());
      for (const key of [
        "side",
        "quantity",
        "limitPrice",
        "strategy",
        "venue",
        "tif",
        "symbol",
        "expiresAtSecs",
      ]) {
        expect(r.resolvedFields).toHaveProperty(key);
      }
    });

    it.each([
      ["equity", { limitPrice: true, strike: false, bondSymbol: false }],
      ["option", { strike: true, expiry: true, limitPrice: false }],
      ["bond", { bondSymbol: true, symbol: false, strategy: false }],
    ] as const)("%s field visibility", (instrumentType, expectations) => {
      const r = resolveTicket(
        makeCtx({
          instrument: { ...makeCtx().instrument, instrumentType },
          limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "derivatives", "fi"] },
          ...(instrumentType === "option" ? { option: VALID_OPTION } : {}),
          ...(instrumentType === "bond" ? { bond: VALID_BOND } : {}),
        })
      );
      for (const [field, visible] of Object.entries(expectations)) {
        expect(r.resolvedFields[field].visible).toBe(visible);
      }
    });

    it("reflects current values from context", () => {
      const r = resolveTicket(makeCtx());
      expect(r.resolvedFields.side.value).toBe("BUY");
      expect(r.resolvedFields.quantity.value).toBe(100);
      expect(r.resolvedFields.limitPrice.value).toBe(189.5);
      expect(r.resolvedFields.strategy.value).toBe("LIMIT");
    });

    it("strategy field has options, tif has 4 options", () => {
      const r = resolveTicket(makeCtx());
      expect(r.resolvedFields.strategy.options).toBeDefined();
      expect(r.resolvedFields.strategy.options?.find((o) => o.value === "LIMIT")?.disabled).toBe(
        false
      );
      expect(r.resolvedFields.tif.options).toHaveLength(4);
      expect(r.resolvedFields.tif.options?.map((o) => o.value)).toEqual([
        "DAY",
        "GTC",
        "IOC",
        "FOK",
      ]);
    });

    it("per-field errors populated from diagnostics", () => {
      const r = resolveTicket(makeCtx(withDraft({ quantity: 0 })));
      expect(r.resolvedFields.quantity.errors.length).toBeGreaterThan(0);
    });

    it("fields disabled when session blocks entry", () => {
      const r = resolveTicket(makeCtx({ session: HALTED_SESSION }));
      expect(r.resolvedFields.quantity.disabled).toBe(true);
      expect(r.resolvedFields.limitPrice.disabled).toBe(true);
    });

    it("origin tracks dirty fields", () => {
      const r = resolveTicket(makeCtx({ dirtyFields: new Set(["quantity", "limitPrice"]) }));
      expect(r.resolvedFields.quantity.origin).toBe("user");
      expect(r.resolvedFields.limitPrice.origin).toBe("user");
      expect(r.resolvedFields.side.origin).toBe("default");
    });

    it("all fields hidden and disabled when role-locked", () => {
      const r = resolveTicket(makeCtx({ userRole: "admin" }));
      expect(r.roleLocked).toBe(true);
      for (const field of Object.values(r.resolvedFields)) {
        expect(field.visible).toBe(false);
        expect(field.disabled).toBe(true);
      }
    });
  });

  describe("performance", () => {
    it("resolves in under 1ms", () => {
      const ctx = makeCtx();
      resolveTicket(ctx);
      const start = performance.now();
      for (let i = 0; i < 10_000; i++) resolveTicket(ctx);
      expect((performance.now() - start) / 10_000).toBeLessThan(1);
    });
  });
});
