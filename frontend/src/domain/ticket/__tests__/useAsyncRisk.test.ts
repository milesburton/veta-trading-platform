import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../market/market-session";
import * as risk from "../async-risk";
import type { TicketContext } from "../ticket-types";
import { useAsyncRisk } from "../useAsyncRisk";

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

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useAsyncRisk", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("stays idle before debounce, then resolves after check", async () => {
    const checkSpy = vi.spyOn(risk, "checkPreTradeRisk").mockResolvedValue({
      status: "approved",
      diagnostics: [],
      checkedAt: 123,
    });

    const { result } = renderHook(() => useAsyncRisk(makeCtx()));

    expect(result.current.status).toBe("idle");

    act(() => {
      vi.advanceTimersByTime(799);
    });
    expect(checkSpy).toHaveBeenCalledTimes(0);
    expect(result.current.status).toBe("idle");

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(checkSpy).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("pending");

    await flushAsync();
    expect(result.current.status).toBe("approved");
  });

  it("does not run check when inputs are invalid", () => {
    const checkSpy = vi.spyOn(risk, "checkPreTradeRisk").mockResolvedValue({
      status: "approved",
      diagnostics: [],
      checkedAt: 123,
    });

    const invalid = makeCtx({ userId: undefined });
    const { result } = renderHook(() => useAsyncRisk(invalid));

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(checkSpy).toHaveBeenCalledTimes(0);
    expect(result.current).toEqual({ status: "idle", diagnostics: [] });
  });

  it("does not re-run when relevant fields are unchanged", async () => {
    const checkSpy = vi.spyOn(risk, "checkPreTradeRisk").mockResolvedValue({
      status: "approved",
      diagnostics: [],
      checkedAt: 123,
    });

    const ctx = makeCtx();
    const { rerender } = renderHook(({ value }: { value: TicketContext }) => useAsyncRisk(value), {
      initialProps: { value: ctx },
    });

    act(() => {
      vi.advanceTimersByTime(800);
    });
    await flushAsync();
    expect(checkSpy).toHaveBeenCalledTimes(1);

    rerender({ value: ctx });
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(checkSpy).toHaveBeenCalledTimes(1);
  });
});
