/**
 * Smoke tests for the domain/ticket barrel export.
 * Ensures the index re-exports are wired correctly.
 */
import { describe, expect, it } from "vitest";
import {
  availableInstrumentTypes,
  checkDarkPoolEligible,
  checkPreTradeRisk,
  checkRoleLocked,
  deriveDesk,
  FIELD_REGISTRY,
  FK,
  getFieldDef,
  resolveTicket,
  STRATEGY_OPTIONS,
  shouldTriggerRiskCheck,
} from "../index";

describe("domain/ticket barrel – function availability", () => {
  it("exports checkPreTradeRisk as a function", () => {
    expect(typeof checkPreTradeRisk).toBe("function");
  });

  it("exports shouldTriggerRiskCheck as a function", () => {
    expect(typeof shouldTriggerRiskCheck).toBe("function");
  });

  it("exports STRATEGY_OPTIONS as a non-empty array", () => {
    expect(Array.isArray(STRATEGY_OPTIONS)).toBe(true);
    expect(STRATEGY_OPTIONS.length).toBeGreaterThan(0);
  });

  it("exports FIELD_REGISTRY as an object", () => {
    expect(FIELD_REGISTRY).toBeDefined();
    expect(typeof FIELD_REGISTRY).toBe("object");
  });

  it("exports FK as a non-empty object", () => {
    expect(FK).toBeDefined();
    expect(Object.keys(FK).length).toBeGreaterThan(0);
  });

  it("exports getFieldDef as a function", () => {
    expect(typeof getFieldDef).toBe("function");
  });

  it("exports resolveTicket as a function", () => {
    expect(typeof resolveTicket).toBe("function");
  });

  it("exports checkDarkPoolEligible as a function", () => {
    expect(typeof checkDarkPoolEligible).toBe("function");
  });

  it("exports availableInstrumentTypes as a function", () => {
    expect(typeof availableInstrumentTypes).toBe("function");
  });

  it("exports deriveDesk as a function", () => {
    expect(typeof deriveDesk).toBe("function");
  });

  it("exports checkRoleLocked as a function", () => {
    expect(typeof checkRoleLocked).toBe("function");
  });
});
