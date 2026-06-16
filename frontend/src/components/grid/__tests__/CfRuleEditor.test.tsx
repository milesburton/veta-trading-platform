import { fireEvent, render, screen } from "@testing-library/react";
import { CfRuleEditor } from "@veta/frontend/components/grid/CfRuleEditor";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatch = vi.fn();
let cfRules: unknown[] = [];

vi.mock("../../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ gridPrefs: { executions: { cfRules } } }),
}));

vi.mock("../ExpressionBuilder.tsx", () => ({
  ExpressionBuilderInline: ({
    value,
    onChange,
  }: {
    value: { id: string; kind: string; join: string; rules: unknown[] };
    onChange: (updated: unknown) => void;
  }) => (
    <button
      type="button"
      onClick={() => onChange({ ...value, rules: [...value.rules, { kind: "rule" }] })}
    >
      expr-builder
    </button>
  ),
}));

describe("CfRuleEditor", () => {
  beforeEach(() => {
    dispatch.mockReset();
    cfRules = [];
  });

  it("renders empty state and can create a new rule", () => {
    render(
      <CfRuleEditor
        gridId="executions"
        fields={[{ key: "asset", label: "Asset", type: "string", defaultWidth: 90 }]}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/No formatting rules yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add rule/i }));
    expect(screen.getByText("expr-builder")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save rule/i }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "gridPrefs/setCfRules",
      })
    );
    expect(typeof dispatch.mock.calls[1][0]).toBe("function");
  });

  it("deletes existing rules", () => {
    cfRules = [
      {
        id: "r1",
        scope: "row",
        expr: { kind: "group", id: "g1", join: "AND", rules: [] },
        style: {},
        label: "Row highlight",
      },
    ];

    render(
      <CfRuleEditor
        gridId="executions"
        fields={[{ key: "asset", label: "Asset", type: "string", defaultWidth: 90 }]}
        onClose={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Delete rule/i }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "gridPrefs/setCfRules",
        payload: { gridId: "executions", rules: [] },
      })
    );
  });

  it("edits an existing rule and updates it on save", () => {
    cfRules = [
      {
        id: "r1",
        scope: "row",
        cellField: "asset",
        expr: { kind: "group", id: "g1", join: "AND", rules: [] },
        style: { bold: true },
        label: "Row highlight",
      },
    ];

    render(
      <CfRuleEditor
        gridId="executions"
        fields={[{ key: "asset", label: "Asset", type: "string", defaultWidth: 90 }]}
        onClose={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Edit rule/i }));
    expect(screen.getByText("expr-builder")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save rule/i }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "gridPrefs/setCfRules",
        payload: expect.objectContaining({
          gridId: "executions",
          rules: [expect.objectContaining({ id: "r1" })],
        }),
      })
    );
  });

  it("exercises scope toggle, label, style presets and bold in the form", () => {
    render(
      <CfRuleEditor
        gridId="executions"
        fields={[
          { key: "asset", label: "Asset", type: "string", defaultWidth: 90 },
          { key: "qty", label: "Qty", type: "number", defaultWidth: 60 },
        ]}
        onClose={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Add rule/i }));

    fireEvent.click(screen.getByRole("button", { name: /Cell only/i }));
    fireEvent.click(screen.getByRole("button", { name: /Entire row/i }));

    fireEvent.change(screen.getByPlaceholderText(/Large orders/i), {
      target: { value: "Big trade" },
    });
    expect(screen.getByPlaceholderText(/Large orders/i)).toHaveValue("Big trade");

    fireEvent.click(screen.getByRole("button", { name: /Cell only/i }));
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "qty" } });
    expect(select).toHaveValue("qty");

    fireEvent.click(screen.getAllByTitle("Red")[0]);
    fireEvent.click(screen.getByTitle("White"));
    fireEvent.click(screen.getByTitle("Amber L"));
    fireEvent.click(screen.getByTitle("Purple"));

    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /Save rule/i }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "gridPrefs/setCfRules" })
    );
  });

  it("propagates expression builder changes into the rule", () => {
    render(
      <CfRuleEditor
        gridId="executions"
        fields={[{ key: "asset", label: "Asset", type: "string", defaultWidth: 90 }]}
        onClose={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Add rule/i }));
    fireEvent.click(screen.getByRole("button", { name: /expr-builder/i }));

    fireEvent.click(screen.getByRole("button", { name: /Save rule/i }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "gridPrefs/setCfRules",
        payload: expect.objectContaining({
          rules: [
            expect.objectContaining({
              expr: expect.objectContaining({
                rules: [{ kind: "rule" }],
              }),
            }),
          ],
        }),
      })
    );
  });

  it("cancels editing without dispatching", () => {
    render(
      <CfRuleEditor
        gridId="executions"
        fields={[{ key: "asset", label: "Asset", type: "string", defaultWidth: 90 }]}
        onClose={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Add rule/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));

    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Add rule/i })).toBeInTheDocument();
  });
});
