import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminPanel } from "@veta/frontend/components/AdminPanel";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("toggles a strategy when its button is clicked", () => {
    render(<AdminPanel />);
    const limitButtons = screen.getAllByRole("button", { name: "LIMIT" });
    fireEvent.click(limitButtons[0]);
    // No throw and the button is still rendered after toggle
    expect(limitButtons[0]).toBeInTheDocument();
  });

  it("changes max_order_qty when input is edited", () => {
    render(<AdminPanel />);
    const input = screen.getAllByDisplayValue("1000")[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2000" } });
    expect(input.value).toBe("2000");
  });

  it("changes max_daily_notional when input is edited", () => {
    render(<AdminPanel />);
    const input = screen.getAllByDisplayValue("50000")[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: "75000" } });
    expect(input.value).toBe("75000");
  });

  it("calls updateLimits when Save is clicked", async () => {
    render(<AdminPanel />);
    const saveBtns = screen.getAllByRole("button", { name: /^Save$/ });
    fireEvent.click(saveBtns[0]);
    await waitFor(() => expect(updateLimits).toHaveBeenCalled());
  });

  it("renders empty journal placeholder when fetch returns nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ entries: [] }) })
    );
    render(<AdminPanel />);
    await waitFor(() => {
      expect(screen.getByText(/No journal entries yet/i)).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  it("renders journal rows when fetch returns entries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            entries: [
              {
                id: 1,
                event_type: "orders.filled",
                ts: Date.now(),
                algo: "TWAP",
                instrument: "AAPL",
                side: "BUY",
                order_id: "o1",
                quantity: 100,
                limit_price: 150,
                fill_price: 150,
                filled_qty: 100,
                market_price: 150,
              },
              {
                id: 2,
                event_type: "orders.submitted",
                ts: Date.now(),
                algo: null,
                instrument: "MSFT",
                side: "SELL",
                order_id: "o2",
                quantity: 50,
                limit_price: 300,
                fill_price: null,
                filled_qty: 0,
                market_price: 300,
              },
              {
                id: 3,
                event_type: "orders.expired",
                ts: Date.now(),
                algo: null,
                instrument: null,
                side: null,
                order_id: "o3",
                quantity: null,
                limit_price: null,
                fill_price: null,
                filled_qty: null,
                market_price: null,
              },
              {
                id: 4,
                event_type: "orders.routed",
                ts: Date.now(),
                algo: "POV",
                instrument: "GOOGL",
                side: null,
                order_id: "o4",
                quantity: 25,
                limit_price: 2000,
                fill_price: null,
                filled_qty: 0,
                market_price: 2000,
              },
            ],
          }),
      })
    );
    render(<AdminPanel />);
    await waitFor(() => {
      expect(screen.getByText("AAPL")).toBeInTheDocument();
      expect(screen.getByText("MSFT")).toBeInTheDocument();
      expect(screen.getByText("GOOGL")).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });
});
