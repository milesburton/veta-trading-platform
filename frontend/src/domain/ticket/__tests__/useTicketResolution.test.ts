import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../market/market-session";
import * as resolver from "../resolve-ticket";
import { useTicketResolution } from "../useTicketResolution";
import type { TicketContext } from "../ticket-types";

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

function makeCtx(overrides: Partial<TicketContext> = {}): TicketContext {
  return {
    userId: "user-1",
    userRole: "trader",
    limits: {
      max_order_qty: 10_000,
      max_daily_notional: 1_000_000,
      allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
      allowed_desks: ["equity"],
      dark_pool_access: false,
    },
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
    session: CONTINUOUS_SESSION,
    dirtyFields: new Set(),
    ...overrides,
  };
}

describe("useTicketResolution", () => {
  it("memoizes result for structurally equal contexts", () => {
    const spy = vi.spyOn(resolver, "resolveTicket");
    const base = makeCtx();

    const { result, rerender } = renderHook(({ ctx }: { ctx: TicketContext }) => useTicketResolution(ctx), {
      initialProps: { ctx: base },
    });

    const first = result.current;
    const callsAfterFirstRender = spy.mock.calls.length;

    const next: TicketContext = {
      ...base,
      limits: { ...base.limits },
      instrument: { ...base.instrument },
      draft: { ...base.draft },
      option: { ...base.option },
      bond: { ...base.bond },
      session: { ...base.session },
      // keep the same killBlocks array reference because contextEqual checks reference
      killBlocks: base.killBlocks,
    };

    rerender({ ctx: next });

    expect(result.current).toBe(first);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("recomputes when a relevant field changes", () => {
    const spy = vi.spyOn(resolver, "resolveTicket");
    const base = makeCtx();

    const { result, rerender } = renderHook(({ ctx }: { ctx: TicketContext }) => useTicketResolution(ctx), {
      initialProps: { ctx: base },
    });

    const first = result.current;
    const callsAfterFirstRender = spy.mock.calls.length;

    const changed = {
      ...base,
      draft: { ...base.draft, quantity: base.draft.quantity + 1 },
      killBlocks: base.killBlocks,
    };

    rerender({ ctx: changed });

    expect(result.current).not.toBe(first);
    expect(spy.mock.calls.length).toBeGreaterThan(callsAfterFirstRender);
  });
});
