import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useColumnLayout } from "../useColumnLayout";

const dispatch = vi.fn();
const state = {
  gridPrefs: {
    executions: {
      columnWidths: {} as Record<string, number>,
      columnOrder: [] as string[],
    },
  },
};

vi.mock("../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) => selector(state),
}));

const cols = [
  { key: "asset", label: "Asset", type: "string", defaultWidth: 80 },
  { key: "side", label: "Side", type: "string", defaultWidth: 70 },
  { key: "qty", label: "Qty", type: "number", defaultWidth: 90 },
] as const;

describe("useColumnLayout", () => {
  beforeEach(() => {
    dispatch.mockReset();
    state.gridPrefs.executions.columnWidths = {};
    state.gridPrefs.executions.columnOrder = [];
  });

  it("returns default column order when no saved order exists", () => {
    const { result } = renderHook(() => useColumnLayout("executions", [...cols]));

    expect(result.current.orderedCols.map((c) => c.key)).toEqual(["asset", "side", "qty"]);
  });

  it("uses saved order and appends missing columns", () => {
    state.gridPrefs.executions.columnOrder = ["qty", "asset"];

    const { result } = renderHook(() => useColumnLayout("executions", [...cols]));

    expect(result.current.orderedCols.map((c) => c.key)).toEqual(["qty", "asset", "side"]);
  });

  it("resolves width from prefs then default fallback", () => {
    state.gridPrefs.executions.columnWidths = { side: 120 };

    const { result } = renderHook(() => useColumnLayout("executions", [...cols]));

    expect(result.current.getWidth("side")).toBe(120);
    expect(result.current.getWidth("asset")).toBe(80);
    expect(result.current.getWidth("unknown")).toBe(80);
  });

  it("dispatches width and order saves", () => {
    const { result } = renderHook(() => useColumnLayout("executions", [...cols]));

    result.current.onResize("asset", 140);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "gridPrefs/setColumnWidth",
        payload: { gridId: "executions", key: "asset", width: 140 },
      })
    );
    expect(typeof dispatch.mock.calls[1][0]).toBe("function");

    dispatch.mockReset();
    result.current.onReorder("asset", "qty");
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "gridPrefs/setColumnOrder",
        payload: { gridId: "executions", order: ["side", "qty", "asset"] },
      })
    );
    expect(typeof dispatch.mock.calls[1][0]).toBe("function");
  });

  it("ignores no-op and invalid reorder requests", () => {
    const { result } = renderHook(() => useColumnLayout("executions", [...cols]));

    result.current.onReorder("asset", "asset");
    result.current.onReorder("bad", "qty");
    expect(dispatch).not.toHaveBeenCalled();
  });
});
