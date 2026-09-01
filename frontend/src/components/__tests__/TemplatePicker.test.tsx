import { fireEvent, render, screen } from "@testing-library/react";
import { TemplatePicker } from "@veta/frontend/components/TemplatePicker";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resetLayout = vi.fn();
const useAppSelectorMock = vi.fn();

vi.mock("../../store/hooks.ts", () => ({
  useAppSelector: (
    selector: (state: {
      auth: { user?: { role?: string } | null; limits?: { trading_style?: string } };
    }) => unknown
  ) => useAppSelectorMock(selector),
}));

vi.mock("../DashboardLayout.tsx", () => ({
  useDashboard: () => ({ resetLayout }),
  LAYOUT_TEMPLATES: [
    {
      id: "overview",
      label: "Overview",
      description: "General workspace",
      model: { layout: { type: "row", children: [] } },
      locked: false,
    },
    {
      id: "admin",
      label: "Admin",
      description: "Admin layout",
      model: { layout: { type: "row", children: [] } },
      locked: true,
    },
    {
      id: "fi-trading",
      label: "FI Trading",
      description: "Bond desk workspace",
      model: { layout: { type: "row", children: [] } },
      locked: true,
      styles: ["fi_voice", "oversight"],
    },
  ],
}));

function mockAuth(role: string, tradingStyle?: string) {
  useAppSelectorMock.mockImplementation(
    (
      selector: (state: {
        auth: { user: { role: string }; limits?: { trading_style?: string } };
      }) => unknown
    ) => selector({ auth: { user: { role }, limits: { trading_style: tradingStyle } } })
  );
}

describe("TemplatePicker", () => {
  beforeEach(() => {
    resetLayout.mockReset();
    useAppSelectorMock.mockReset();
    mockAuth("trader", "high_touch");
  });

  it("shows only non-admin templates for non-admin users", () => {
    render(<TemplatePicker />);
    fireEvent.click(screen.getByRole("button", { name: /layout/i }));

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("shows admin templates for admin users", () => {
    mockAuth("admin", "high_touch");

    render(<TemplatePicker />);
    fireEvent.click(screen.getByRole("button", { name: /layout/i }));

    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("hides desk-scoped templates for a trading style that doesn't match", () => {
    mockAuth("trader", "high_touch");

    render(<TemplatePicker />);
    fireEvent.click(screen.getByRole("button", { name: /layout/i }));

    expect(screen.queryByText("FI Trading")).not.toBeInTheDocument();
  });

  it("shows desk-scoped templates for a matching trading style", () => {
    mockAuth("trader", "fi_voice");

    render(<TemplatePicker />);
    fireEvent.click(screen.getByRole("button", { name: /layout/i }));

    expect(screen.getByText("FI Trading")).toBeInTheDocument();
  });

  it("applies template and closes menu", () => {
    render(<TemplatePicker />);
    fireEvent.click(screen.getByRole("button", { name: /layout/i }));
    fireEvent.click(screen.getByRole("button", { name: /overview/i }));

    expect(resetLayout).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Layout Templates")).not.toBeInTheDocument();
  });

  it("closes when clicking outside", () => {
    render(<TemplatePicker />);
    fireEvent.click(screen.getByRole("button", { name: /layout/i }));
    expect(screen.getByText("Layout Templates")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("Layout Templates")).not.toBeInTheDocument();
  });
});
