import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TemplatePicker } from "../TemplatePicker";

const resetLayout = vi.fn();
const useAppSelectorMock = vi.fn();

vi.mock("../../store/hooks.ts", () => ({
  useAppSelector: (selector: (state: { auth: { user?: { role?: string } | null } }) => unknown) =>
    useAppSelectorMock(selector),
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
  ],
}));

describe("TemplatePicker", () => {
  beforeEach(() => {
    resetLayout.mockReset();
    useAppSelectorMock.mockReset();
    useAppSelectorMock.mockImplementation(
      (selector: (state: { auth: { user: { role: string } } }) => unknown) =>
        selector({ auth: { user: { role: "trader" } } })
    );
  });

  it("shows only non-admin templates for non-admin users", () => {
    render(<TemplatePicker />);
    fireEvent.click(screen.getByRole("button", { name: /layout/i }));

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("shows admin templates for admin users", () => {
    useAppSelectorMock.mockImplementation(
      (selector: (state: { auth: { user: { role: string } } }) => unknown) =>
        selector({ auth: { user: { role: "admin" } } })
    );

    render(<TemplatePicker />);
    fireEvent.click(screen.getByRole("button", { name: /layout/i }));

    expect(screen.getByText("Admin")).toBeInTheDocument();
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
