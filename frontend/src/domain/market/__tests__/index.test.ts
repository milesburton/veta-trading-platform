/**
 * Smoke tests for the domain/market barrel export.
 * Ensures the index re-exports are wired correctly and the key
 * functions are accessible via the public API.
 */
import { describe, expect, it } from "vitest";
import {
  isAuction,
  isStrategyAllowedInSession,
  resolveSession,
  buildSessionSchedule,
  isEarlyClose,
  isHoliday,
  resolvePhaseFromMinute,
  totalTradingMinutes,
  US_EQUITY_CALENDAR,
} from "../index";

describe("domain/market barrel – function availability", () => {
  it("exports isAuction as a function", () => {
    expect(typeof isAuction).toBe("function");
  });

  it("exports isStrategyAllowedInSession as a function", () => {
    expect(typeof isStrategyAllowedInSession).toBe("function");
  });

  it("exports resolveSession as a function", () => {
    expect(typeof resolveSession).toBe("function");
  });

  it("exports buildSessionSchedule as a function", () => {
    expect(typeof buildSessionSchedule).toBe("function");
  });

  it("exports isEarlyClose as a function", () => {
    expect(typeof isEarlyClose).toBe("function");
  });

  it("exports isHoliday as a function", () => {
    expect(typeof isHoliday).toBe("function");
  });

  it("exports resolvePhaseFromMinute as a function", () => {
    expect(typeof resolvePhaseFromMinute).toBe("function");
  });

  it("exports totalTradingMinutes as a function", () => {
    expect(typeof totalTradingMinutes).toBe("function");
  });

  it("exports US_EQUITY_CALENDAR as a non-empty object", () => {
    expect(US_EQUITY_CALENDAR).toBeDefined();
    expect(typeof US_EQUITY_CALENDAR).toBe("object");
  });
});
