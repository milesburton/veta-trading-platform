import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CfRuleEditor } from "../CfRuleEditor";

const dispatch = vi.fn();
let cfRules: unknown[] = [];

vi.mock("../../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ gridPrefs: { executions: { cfRules } } }),
}));

vi.mock("../ExpressionBuilder.tsx", () => ({
  ExpressionBuilderInline: () => <div>expr-builder</div>,
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
});
