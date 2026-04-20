import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContainerLimit, useGridQuery } from "../useGridQuery";

const mockUseQueryGridQuery = vi.fn();
const gridPrefsState = {
  gridPrefs: {
    executions: {
      filterExpr: { kind: "group", id: "root", join: "AND", rules: [] },
      sortField: "asset",
      sortDir: "desc",
    },
  },
};

let resizeCallback: ((entries: Array<{ contentRect: { height: number } }>) => void) | null = null;
const observe = vi.fn();
const disconnect = vi.fn();

vi.mock("../../store/gridApi.ts", () => ({
  useQueryGridQuery: (...args: unknown[]) => mockUseQueryGridQuery(...args),
}));

vi.mock("../../store/hooks.ts", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector(gridPrefsState),
}));

class MockResizeObserver {
  constructor(cb: (entries: Array<{ contentRect: { height: number } }>) => void) {
    resizeCallback = cb;
  }

  observe = observe;
  disconnect = disconnect;
}

function LimitProbe() {
  const { containerRef, limit } = useContainerLimit();
  return <div ref={containerRef}>limit:{limit}</div>;
}

describe("useGridQuery", () => {
  beforeEach(() => {
    mockUseQueryGridQuery.mockReset();
    observe.mockReset();
    disconnect.mockReset();
    resizeCallback = null;
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    gridPrefsState.gridPrefs.executions.sortField = "asset";
    gridPrefsState.gridPrefs.executions.sortDir = "desc";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the grid query request from grid prefs and response data", () => {
    mockUseQueryGridQuery.mockReturnValue({
      data: { rows: [{ id: "o-1" }], total: 7, evalMs: 12 },
      isLoading: false,
      isError: false,
      isFetching: true,
    });

    const { result } = renderHook(() => useGridQuery("executions", 5, 25));

    expect(mockUseQueryGridQuery).toHaveBeenCalledWith({
      gridId: "executions",
      filterExpr: gridPrefsState.gridPrefs.executions.filterExpr,
      sortField: "asset",
      sortDir: "desc",
      offset: 5,
      limit: 25,
    });
    expect(result.current).toEqual({
      rows: [{ id: "o-1" }],
      total: 7,
      evalMs: 12,
      isLoading: false,
      isError: false,
      isFetching: true,
    });
  });

  it("falls back to empty rows and defaults when query data is absent", () => {
    mockUseQueryGridQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isFetching: false,
    });

    const { result } = renderHook(() => useGridQuery("executions"));

    expect(result.current.rows).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.evalMs).toBe(0);
    expect(result.current.isLoading).toBe(true);
  });

  it("derives container limit from resize observer height", () => {
    render(<LimitProbe />);

    expect(screen.getByText("limit:20")).toBeInTheDocument();
    expect(observe).toHaveBeenCalled();

    act(() => {
      resizeCallback?.([{ contentRect: { height: 900 } }]);
    });

    expect(screen.getByText("limit:36")).toBeInTheDocument();
  });
});
