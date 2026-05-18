import { checkRoleLocked } from "@veta/frontend/domain/ticket/rules/role-check";
import type { TicketContext } from "@veta/frontend/domain/ticket/ticket-types";
import { describe, expect, it } from "vitest";

function ctx(role: string | undefined, tradingStyle?: string): TicketContext {
  return {
    userId: "u",
    userRole: role as TicketContext["userRole"],
    limits: {
      max_order_qty: 10_000,
      max_daily_notional: 1_000_000,
      allowed_strategies: [],
      allowed_desks: [],
      dark_pool_access: false,
      trading_style: tradingStyle as TicketContext["limits"]["trading_style"],
    },
    killBlocks: [],
    instrument: {
      instrumentType: "equity",
      symbol: "AAPL",
      lotSize: 1,
      currentPrice: 100,
      orderBookMid: undefined,
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
    bond: { symbol: "", yieldPct: 0, hasQuote: false, isFetching: false, hasBondDef: false },
    dirtyFields: new Set(),
    session: {
      phase: "CONTINUOUS",
      allowsOrderEntry: true,
      allowsAmend: true,
      allowsCancel: true,
      supportedStrategies: [],
      phaseLabel: "Continuous",
    },
  };
}

describe("checkRoleLocked", () => {
  it("locks anonymous users with a sign-in prompt", () => {
    const r = checkRoleLocked(ctx(undefined));
    expect(r.locked).toBe(true);
    expect(r.message).toMatch(/sign in/i);
  });

  it("does not lock a plain trader", () => {
    const r = checkRoleLocked(ctx("trader"));
    expect(r.locked).toBe(false);
    expect(r.message).toBeNull();
  });

  it("locks admin with a tailored message", () => {
    const r = checkRoleLocked(ctx("admin"));
    expect(r.locked).toBe(true);
    expect(r.message).toMatch(/Administrators/i);
  });

  it("locks compliance with a tailored message", () => {
    const r = checkRoleLocked(ctx("compliance"));
    expect(r.locked).toBe(true);
    expect(r.message).toMatch(/Compliance/i);
  });

  it("locks sales with sales-workbench guidance", () => {
    const r = checkRoleLocked(ctx("sales"));
    expect(r.locked).toBe(true);
    expect(r.message).toMatch(/Sales Workbench/i);
  });

  it("locks external-client with RFQ guidance", () => {
    const r = checkRoleLocked(ctx("external-client"));
    expect(r.locked).toBe(true);
    expect(r.message).toMatch(/Client RFQ/i);
  });

  it("locks viewer", () => {
    const r = checkRoleLocked(ctx("viewer"));
    expect(r.locked).toBe(true);
    expect(r.message).toMatch(/View-only/i);
  });

  it("locks desk-head", () => {
    const r = checkRoleLocked(ctx("desk-head"));
    expect(r.locked).toBe(true);
    expect(r.message).toMatch(/Desk heads/i);
  });

  it("locks risk-manager", () => {
    const r = checkRoleLocked(ctx("risk-manager"));
    expect(r.locked).toBe(true);
    expect(r.message).toMatch(/Risk managers/i);
  });

  it("locks low_touch trading style with algo monitor guidance", () => {
    const r = checkRoleLocked(ctx("trader", "low_touch"));
    expect(r.locked).toBe(true);
    expect(r.message).toMatch(/Low-touch/i);
  });

  it("locks derivatives_low_touch trading style with algo monitor guidance", () => {
    const r = checkRoleLocked(ctx("trader", "derivatives_low_touch"));
    expect(r.locked).toBe(true);
    expect(r.message).toMatch(/Low-touch derivatives/i);
  });

  it("does not lock a high_touch trader", () => {
    const r = checkRoleLocked(ctx("trader", "high_touch"));
    expect(r.locked).toBe(false);
  });

  it("falls back to a generic message for non-trading roles not in ROLE_MESSAGES (oncall)", () => {
    const r = checkRoleLocked(ctx("oncall"));
    expect(r.locked).toBe(true);
    expect(r.message).toBe("Your role cannot submit orders.");
  });
});
