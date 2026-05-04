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

  it("renders 'between' two-input editor for number fields", () => {
    const onChange = vi.fn();
    render(
      <ExpressionBuilderInline
        fields={[...fields]}
        value={{
          kind: "group",
          id: "g",
          join: "AND",
          rules: [
            {
              kind: "rule",
              id: "r1",
              field: "qty",
              op: "between",
              value: [10, 50],
            },
          ],
        }}
        onChange={onChange}
      />
    );
    const inputs = screen.getAllByPlaceholderText(/From|To/i);
    expect(inputs.length).toBe(2);
    fireEvent.change(inputs[0], { target: { value: "20" } });
    fireEvent.change(inputs[1], { target: { value: "100" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("removes a rule with the × button", () => {
    const onChange = vi.fn();
    render(
      <ExpressionBuilderInline
        fields={[...fields]}
        value={{
          kind: "group",
          id: "g",
          join: "AND",
          rules: [{ kind: "rule", id: "r1", field: "symbol", op: "=", value: "AAPL" }],
        }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText(/Remove rule/));
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last.rules).toHaveLength(0);
  });

  it("changes field operator", () => {
    const onChange = vi.fn();
    render(
      <ExpressionBuilderInline
        fields={[...fields]}
        value={{
          kind: "group",
          id: "g",
          join: "AND",
          rules: [{ kind: "rule", id: "r1", field: "qty", op: "=", value: 10 }],
        }}
        onChange={onChange}
      />
    );
    const opSelects = screen.getAllByRole("combobox");
    fireEvent.change(opSelects[1], { target: { value: ">" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("toggles enum option for IN operator", () => {
    const onChange = vi.fn();
    render(
      <ExpressionBuilderInline
        fields={[...fields]}
        value={{
          kind: "group",
          id: "g",
          join: "AND",
          rules: [{ kind: "rule", id: "r1", field: "status", op: "in", value: ["OPEN"] }],
        }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "OPEN" }));
    expect(onChange).toHaveBeenCalled();
    // Add DONE
    fireEvent.click(screen.getByRole("button", { name: "DONE" }));
    expect(onChange).toHaveBeenCalled();
  });

  it("changes field key, resetting op and value", () => {
    const onChange = vi.fn();
    render(
      <ExpressionBuilderInline
        fields={[...fields]}
        value={{
          kind: "group",
          id: "g",
          join: "AND",
          rules: [{ kind: "rule", id: "r1", field: "symbol", op: "=", value: "AAPL" }],
        }}
        onChange={onChange}
      />
    );
    const fieldSelects = screen.getAllByRole("combobox");
    fireEvent.change(fieldSelects[0], { target: { value: "qty" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("hides value input for is_null operator", () => {
    const onChange = vi.fn();
    render(
      <ExpressionBuilderInline
        fields={[...fields]}
        value={{
          kind: "group",
          id: "g",
          join: "AND",
          rules: [{ kind: "rule", id: "r1", field: "symbol", op: "is_null", value: "" }],
        }}
        onChange={onChange}
      />
    );
    expect(screen.queryByPlaceholderText(/value/)).not.toBeInTheDocument();
  });

  it("renders number input for number-typed field", () => {
    const onChange = vi.fn();
    render(
      <ExpressionBuilderInline
        fields={[...fields]}
        value={{
          kind: "group",
          id: "g",
          join: "AND",
          rules: [{ kind: "rule", id: "r1", field: "qty", op: "=", value: 100 }],
        }}
        onChange={onChange}
      />
    );
    const valueInput = screen.getByPlaceholderText(/value/);
    fireEvent.change(valueInput, { target: { value: "200" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("renders nested group node with delete button", () => {
    const onChange = vi.fn();
    render(
      <ExpressionBuilderInline
        fields={[...fields]}
        value={{
          kind: "group",
          id: "outer",
          join: "AND",
          rules: [
            {
              kind: "group",
              id: "inner",
              join: "OR",
              rules: [{ kind: "rule", id: "r1", field: "symbol", op: "=", value: "X" }],
            },
          ],
        }}
        onChange={onChange}
      />
    );
    const removeBtn = screen.getByLabelText(/Remove group/i);
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalled();
  });

  it("toggling join in nested group propagates", () => {
    const onChange = vi.fn();
    render(
      <ExpressionBuilderInline
        fields={[...fields]}
        value={{
          kind: "group",
          id: "outer",
          join: "AND",
          rules: [
            {
              kind: "group",
              id: "inner",
              join: "OR",
              rules: [{ kind: "rule", id: "r1", field: "symbol", op: "=", value: "X" }],
            },
          ],
        }}
        onChange={onChange}
      />
    );
    // Click the OR pill (inner group's join)
    const orBtn = screen.queryAllByRole("button", { name: "OR" })[0];
    fireEvent.click(orBtn);
    expect(onChange).toHaveBeenCalled();
  });

  it("changing rule in nested group triggers nested onChange", () => {
    const onChange = vi.fn();
    render(
      <ExpressionBuilderInline
        fields={[...fields]}
        value={{
          kind: "group",
          id: "outer",
          join: "AND",
          rules: [
            {
              kind: "group",
              id: "inner",
              join: "OR",
              rules: [{ kind: "rule", id: "r1", field: "symbol", op: "=", value: "X" }],
            },
          ],
        }}
        onChange={onChange}
      />
    );
    const valueInput = screen.getByPlaceholderText(/value/);
    fireEvent.change(valueInput, { target: { value: "AAPL" } });
    expect(onChange).toHaveBeenCalled();
  });
});
