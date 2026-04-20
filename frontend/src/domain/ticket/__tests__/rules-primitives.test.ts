import { describe, expect, it } from "vitest";
import type { TradingLimits } from "../../../store/authSlice";
import { resolveSession, type SessionState } from "../../market/market-session";
import { checkDarkPoolEligible } from "../rules/dark-pool";
import { availableInstrumentTypes, deriveDesk, runDeskAccessCheck } from "../rules/desk-access";
import { runKillSwitchCheck } from "../rules/kill-switch";
import { runLimitChecks } from "../rules/limit-checks";
import { runPriceCollarCheck } from "../rules/price-collar";
import { runSessionRules } from "../rules/session-rules";
import { runSpreadCheck } from "../rules/spread-check";
import { runStaticValidation } from "../rules/static-validation";
import type { TicketContext } from "../ticket-types";

const LIMITS: TradingLimits = {
  max_order_qty: 10_000,
  max_daily_notional: 1_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
  allowed_desks: ["equity"],
  dark_pool_access: false,
};

function makeCtx(overrides: Partial<TicketContext> = {}): TicketContext {
  return {
    userId: "u-1",
    userRole: "trader",
    limits: LIMITS,
    killBlocks: [],
    instrument: {
      instrumentType: "equity",
      symbol: "AAPL",
      lotSize: 1,
      currentPrice: 100,
      orderBookMid: 100,
    },
    draft: {
      side: "BUY",
      quantity: 100,
      limitPrice: 100,
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
    session: resolveSession("CONTINUOUS"),
    ...overrides,
  };
}

describe("ticket rules: primitives", () => {
  describe("runStaticValidation", () => {
    it("returns all expected equity errors", () => {
      const diagnostics = runStaticValidation(
        makeCtx({
          instrument: { ...makeCtx().instrument, symbol: "" },
          draft: {
            ...makeCtx().draft,
            quantity: 0,
            limitPrice: 0,
            expiresAtSecs: 0,
          },
        })
      );
      expect(diagnostics.map((d) => d.ruleId)).toEqual(
        expect.arrayContaining([
          "qty-positive",
          "price-positive",
          "duration-positive",
          "symbol-required",
        ])
      );
    });

    it("skips price and duration checks for options and bonds", () => {
      const optionDiagnostics = runStaticValidation(
        makeCtx({
          instrument: { ...makeCtx().instrument, instrumentType: "option" },
          draft: {
            ...makeCtx().draft,
            quantity: 0,
            limitPrice: 0,
            expiresAtSecs: 0,
          },
        })
      );
      expect(optionDiagnostics.some((d) => d.ruleId === "price-positive")).toBe(false);
      expect(optionDiagnostics.some((d) => d.ruleId === "duration-positive")).toBe(false);

      const bondDiagnostics = runStaticValidation(
        makeCtx({
          instrument: { ...makeCtx().instrument, instrumentType: "bond" },
          draft: {
            ...makeCtx().draft,
            quantity: 0,
            limitPrice: 0,
            expiresAtSecs: 0,
          },
        })
      );
      expect(bondDiagnostics.some((d) => d.ruleId === "price-positive")).toBe(false);
      expect(bondDiagnostics.some((d) => d.ruleId === "duration-positive")).toBe(false);
    });
  });

  describe("runLimitChecks", () => {
    it("returns warning and errors for lot-size, quantity, notional and strategy", () => {
      const diagnostics = runLimitChecks(
        makeCtx({
          instrument: { ...makeCtx().instrument, lotSize: 100 },
          draft: {
            ...makeCtx().draft,
            quantity: 10_050,
            limitPrice: 150,
            strategy: "ICEBERG",
          },
        })
      );

      expect(diagnostics.map((d) => d.ruleId)).toEqual(
        expect.arrayContaining([
          "lot-size",
          "qty-exceeds-limit",
          "notional-exceeds-limit",
          "strategy-not-permitted",
        ])
      );
    });

    it("returns no diagnostics for options and bonds", () => {
      expect(
        runLimitChecks(
          makeCtx({
            instrument: { ...makeCtx().instrument, instrumentType: "option" },
          })
        )
      ).toEqual([]);
      expect(
        runLimitChecks(
          makeCtx({
            instrument: { ...makeCtx().instrument, instrumentType: "bond" },
          })
        )
      ).toEqual([]);
    });
  });

  describe("runPriceCollarCheck", () => {
    it("emits warning and error thresholds", () => {
      const warning = runPriceCollarCheck(
        makeCtx({ draft: { ...makeCtx().draft, limitPrice: 103 } })
      );
      expect(warning[0]?.ruleId).toBe("price-collar.deviation");

      const error = runPriceCollarCheck(
        makeCtx({ draft: { ...makeCtx().draft, limitPrice: 106 } })
      );
      expect(error[0]?.ruleId).toBe("price-collar.exceeds-max");
    });

    it("returns empty diagnostics when price inputs are invalid or non-equity", () => {
      expect(
        runPriceCollarCheck(
          makeCtx({
            instrument: { ...makeCtx().instrument, currentPrice: undefined },
          })
        )
      ).toEqual([]);
      expect(
        runPriceCollarCheck(makeCtx({ draft: { ...makeCtx().draft, limitPrice: 0 } }))
      ).toEqual([]);
      expect(
        runPriceCollarCheck(
          makeCtx({
            instrument: { ...makeCtx().instrument, instrumentType: "bond" },
          })
        )
      ).toEqual([]);
    });
  });

  describe("runSpreadCheck", () => {
    it("emits warning and error at configured thresholds", () => {
      const warning = runSpreadCheck(makeCtx({ spreadBps: 50 }));
      expect(warning[0]?.ruleId).toBe("spread.wide");

      const error = runSpreadCheck(makeCtx({ spreadBps: 200 }));
      expect(error[0]?.ruleId).toBe("spread.exceeds-max");
    });

    it("returns empty for non-equity or undefined spread", () => {
      expect(runSpreadCheck(makeCtx())).toEqual([]);
      expect(
        runSpreadCheck(
          makeCtx({
            instrument: { ...makeCtx().instrument, instrumentType: "option" },
          })
        )
      ).toEqual([]);
    });
  });

  describe("dark pool, desk, kill switch and session", () => {
    it("checks dark pool eligibility", () => {
      expect(
        checkDarkPoolEligible(
          makeCtx({
            limits: { ...LIMITS, dark_pool_access: true },
            draft: { ...makeCtx().draft, quantity: 10_000 },
          })
        )
      ).toBe(true);
      expect(
        checkDarkPoolEligible(
          makeCtx({
            limits: { ...LIMITS, dark_pool_access: true },
            instrument: { ...makeCtx().instrument, instrumentType: "bond" },
            draft: { ...makeCtx().draft, quantity: 10_000 },
          })
        )
      ).toBe(false);
    });

    it("derives desks and available instrument types", () => {
      expect(deriveDesk("equity")).toBe("equity");
      expect(deriveDesk("option")).toBe("derivatives");
      expect(deriveDesk("bond")).toBe("fi");
      expect(deriveDesk("fx")).toBe("fx");
      expect(deriveDesk("commodity")).toBe("commodities");

      expect(
        availableInstrumentTypes(["equity", "derivatives", "fi", "fx", "commodities"])
      ).toEqual(["equity", "option", "bond", "fx", "commodity"]);
    });

    it("returns desk access error when desk is not permitted", () => {
      const diagnostics = runDeskAccessCheck(
        makeCtx({
          limits: { ...LIMITS, allowed_desks: ["equity"] },
          instrument: { ...makeCtx().instrument, instrumentType: "bond" },
        })
      );
      expect(diagnostics[0]?.ruleId).toBe("desk-access-denied");
    });

    it("returns kill switch block when scope matches", () => {
      const diagnostics = runKillSwitchCheck(
        makeCtx({
          killBlocks: [
            {
              id: "k1",
              scope: "all",
              scopeValues: [],
              issuedBy: "admin",
              issuedAt: Date.now(),
            },
          ],
        })
      );
      expect(diagnostics[0]?.ruleId).toBe("kill-switch-blocked");
    });

    it("applies session entry/strategy/auction/pre-open diagnostics", () => {
      const halted = runSessionRules(
        makeCtx({
          session: resolveSession("HALTED"),
        })
      );
      expect(halted.some((d) => d.ruleId === "session.entry-blocked")).toBe(true);

      const auctionSession: SessionState = {
        phase: "OPENING_AUCTION",
        allowsOrderEntry: true,
        allowsAmend: true,
        allowsCancel: true,
        supportedStrategies: ["LIMIT"],
        phaseLabel: "Opening Auction",
      };
      const auction = runSessionRules(
        makeCtx({
          session: auctionSession,
          draft: { ...makeCtx().draft, strategy: "TWAP" },
        })
      );
      expect(auction.some((d) => d.ruleId === "session.strategy-not-supported")).toBe(true);
      expect(auction.some((d) => d.ruleId === "session.auction-info")).toBe(true);

      const preOpen = runSessionRules(
        makeCtx({
          session: resolveSession("PRE_OPEN"),
        })
      );
      expect(preOpen.some((d) => d.ruleId === "session.pre-open-info")).toBe(true);

      const option = runSessionRules(
        makeCtx({
          instrument: { ...makeCtx().instrument, instrumentType: "option" },
        })
      );
      expect(option).toEqual([]);
    });
  });
});
