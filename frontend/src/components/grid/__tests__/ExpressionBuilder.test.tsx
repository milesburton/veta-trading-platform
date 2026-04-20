import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldDef } from "../../../types/gridPrefs";
import { ExpressionBuilder, ExpressionBuilderInline } from "../ExpressionBuilder";

const dispatch = vi.fn();
const setFilterExpr = vi.fn((payload: unknown) => ({
  type: "gridPrefs/setFilterExpr",
  payload,
}));
const saveGridPrefs = vi.fn(() => ({ type: "gridPrefs/saveGridPrefs" }));

vi.mock("../../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
}));

vi.mock("../../../store/gridPrefsSlice.ts", () => ({
  setFilterExpr: (payload: unknown) => setFilterExpr(payload),
  saveGridPrefs: () => saveGridPrefs(),
}));

const fields: FieldDef[] = [
  { key: "symbol", label: "Symbol", type: "string" },
  { key: "qty", label: "Qty", type: "number" },
  { key: "status", label: "Status", type: "enum", options: ["OPEN", "DONE"] },
];

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function mockShowModal(this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function mockClose(this: HTMLDialogElement) {
    this.open = false;
  });
});

describe("ExpressionBuilderInline", () => {
  it("adds rules and nested groups and toggles join", () => {
    const onChange = vi.fn();
    render(
      <ExpressionBuilderInline
        fields={[...fields]}
        value={{ kind: "group", id: "root", join: "AND", rules: [] }}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "+ Add rule" }));
    const ruleChange = onChange.mock.calls[0][0] as { rules: unknown[] };
    expect(ruleChange.rules).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "+ Add group" }));
    const groupChange = onChange.mock.calls[1][0] as { rules: unknown[] };
    expect(groupChange.rules).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "AND" }));
    const joinChange = onChange.mock.calls[2][0] as { join: string };
    expect(joinChange.join).toBe("OR");
  });
});

describe("ExpressionBuilder", () => {
  beforeEach(() => {
    dispatch.mockReset();
    setFilterExpr.mockClear();
    saveGridPrefs.mockClear();
  });

  it("applies expression and dispatches save actions", () => {
    const onClose = vi.fn();
    render(
      <ExpressionBuilder
        gridId={"executions"}
        fields={[...fields]}
        initialField="status"
        onClose={onClose}
      />
    );

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "in" } });
    fireEvent.click(screen.getByRole("button", { name: "OPEN" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(setFilterExpr).toHaveBeenCalledWith(
      expect.objectContaining({
        gridId: "executions",
        expr: expect.objectContaining({ kind: "group" }),
      })
    );
    expect(saveGridPrefs).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clears all rules and persists empty expression", () => {
    const onClose = vi.fn();
    render(
      <ExpressionBuilder
        gridId={"executions"}
        fields={[...fields]}
        initial={{
          kind: "group",
          id: "seed",
          join: "AND",
          rules: [{ kind: "rule", id: "r1", field: "symbol", op: "=", value: "AAPL" }],
        }}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(setFilterExpr).toHaveBeenCalledWith(
      expect.objectContaining({
        gridId: "executions",
        expr: expect.objectContaining({ rules: [] }),
      })
    );
    expect(saveGridPrefs).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
