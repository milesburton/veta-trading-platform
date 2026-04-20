import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPanel } from "../AdminPanel";

const updateLimits = vi.fn();

vi.mock("../../store/userApi.ts", () => ({
  useGetUsersQuery: () => ({
    data: [
      {
        id: "u1",
        name: "Taylor",
        avatar_emoji: "📈",
        role: "trader",
      },
      {
        id: "u2",
        name: "Morgan",
        avatar_emoji: "💎",
        role: "admin",
      },
    ],
  }),
  useGetUserLimitsQuery: (userId: string) => ({
    data:
      userId === "u1"
        ? {
            max_order_qty: 1000,
            max_daily_notional: 50000,
            allowed_strategies: ["LIMIT", "TWAP"],
          }
        : {
            max_order_qty: 10000,
            max_daily_notional: 500000,
            allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
          },
  }),
  useUpdateUserLimitsMutation: () => [updateLimits, { isLoading: false, error: null }],
}));

vi.mock("../../store/hooks.ts", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => {
    const state = {
      auth: {
        user: { id: "u1", role: "admin", name: "Test", avatar_emoji: "✅" },
      },
    };
    return selector(state);
  },
}));

describe("AdminPanel", () => {
  beforeEach(() => {
    updateLimits.mockReset();
    updateLimits.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  });

  it("renders the admin panel header", () => {
    render(<AdminPanel />);
    expect(screen.getByTestId("admin-panel")).toBeInTheDocument();
    expect(screen.getByText(/Trading Limits/i)).toBeInTheDocument();
  });

  it("displays user rows with avatar and role badge", () => {
    render(<AdminPanel />);
    expect(screen.getAllByText("Taylor").length).toBeGreaterThan(0);
    expect(screen.getAllByText("trader").length).toBeGreaterThan(0);
  });

  it("shows user limits in input fields", () => {
    render(<AdminPanel />);
    const inputs = screen.getAllByDisplayValue("1000");
    expect(inputs.length).toBeGreaterThan(0);
  });
});
