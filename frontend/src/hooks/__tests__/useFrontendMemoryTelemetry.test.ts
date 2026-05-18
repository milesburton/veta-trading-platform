import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFrontendMemoryTelemetry } from "../useFrontendMemoryTelemetry.ts";

interface PerformanceMemory {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

function setMemory(memory: PerformanceMemory | undefined): () => void {
  const perf = performance as Performance & { memory?: PerformanceMemory };
  const had = "memory" in perf;
  const prev = perf.memory;
  if (memory === undefined) {
    delete perf.memory;
  } else {
    perf.memory = memory;
  }
  return () => {
    if (had) {
      perf.memory = prev;
    } else {
      delete perf.memory;
    }
  };
}

describe("useFrontendMemoryTelemetry", () => {
  let restoreMemory: (() => void) | null = null;

  beforeEach(() => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    ) as typeof fetch;
  });

  afterEach(() => {
    restoreMemory?.();
    restoreMemory = null;
  });

  it("returns null when performance.memory is unavailable (Firefox)", () => {
    restoreMemory = setMemory(undefined);
    const { result } = renderHook(() => useFrontendMemoryTelemetry());
    expect(result.current).toBeNull();
  });

  it("returns a snapshot when performance.memory exists", () => {
    restoreMemory = setMemory({
      jsHeapSizeLimit: 4_000_000_000,
      totalJSHeapSize: 200_000_000,
      usedJSHeapSize: 150_000_000,
    });
    const { result } = renderHook(() => useFrontendMemoryTelemetry());
    expect(result.current).not.toBeNull();
    expect(result.current?.usedMb).toBeCloseTo(143, 0);
    expect(result.current?.totalMb).toBeCloseTo(191, 0);
    expect(result.current?.limitMb).toBeCloseTo(3815, 0);
    expect(result.current?.pct).toBeCloseTo(3.75, 1);
  });

  it("posts a telemetry sample to the gateway on mount", () => {
    restoreMemory = setMemory({
      jsHeapSizeLimit: 4_000_000_000,
      totalJSHeapSize: 200_000_000,
      usedJSHeapSize: 150_000_000,
    });
    renderHook(() => useFrontendMemoryTelemetry());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/gateway/telemetry/frontend",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    );
  });
});
