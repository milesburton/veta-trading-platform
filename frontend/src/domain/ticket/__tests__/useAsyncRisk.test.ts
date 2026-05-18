import { act, renderHook } from "@testing-library/react";
import * as risk from "@veta/frontend/domain/ticket/async-risk";
import type { TicketContext } from "@veta/frontend/domain/ticket/ticket-types";
import { useAsyncRisk } from "@veta/frontend/domain/ticket/useAsyncRisk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx } from "./fixtures";

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
