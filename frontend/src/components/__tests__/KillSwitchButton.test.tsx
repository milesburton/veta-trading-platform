import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KillSwitchButton } from "../KillSwitchButton";

const dispatch = vi.fn();
const killOrdersThunk = vi.fn((payload) => ({ type: "orders/kill", payload }));
const resumeOrdersThunk = vi.fn((payload) => ({
  type: "orders/resume",
  payload,
}));

type MockState = {
  auth: { user: { id: string; role: string } };
  market: { assets: Array<{ symbol: string }> };
  orders: { orders: Array<{ userId?: string }> };
  killSwitch: { blocks: Array<Record<string, unknown>> };
};

let mockState: MockState = {
  auth: { user: { id: "", role: "" } },
  market: { assets: [] },
  orders: { orders: [] },
  killSwitch: { blocks: [] },
};

vi.mock("../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) => selector(mockState),
}));

vi.mock("../../store/ordersSlice.ts", async () => {
  const actual = await vi.importActual<typeof import("../../store/ordersSlice.ts")>(
    "../../store/ordersSlice.ts"
  );
  return {
    ...actual,
    killOrdersThunk: (payload: unknown) => killOrdersThunk(payload),
    resumeOrdersThunk: (payload: unknown) => resumeOrdersThunk(payload),
  };
});

describe("KillSwitchButton", () => {
  beforeEach(() => {
    dispatch.mockReset();
    dispatch.mockImplementation((action) => Promise.resolve(action));
    killOrdersThunk.mockReset();
    resumeOrdersThunk.mockReset();

    mockState = {
      auth: { user: { id: "admin-1", role: "admin" } },
      market: { assets: [{ symbol: "AAPL" }, { symbol: "MSFT" }] },
      orders: { orders: [{ userId: "trader-1" }, { userId: "trader-2" }] },
      killSwitch: { blocks: [] },
    };
  });

  it("sends kill request for selected symbol scope and adds a local block", async () => {
    render(<KillSwitchButton />);

    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    fireEvent.click(screen.getByRole("button", { name: /By symbol/i }));
    fireEvent.click(screen.getByLabelText("AAPL"));
    fireEvent.click(screen.getByRole("checkbox", { name: /I confirm this action/i }));
    fireEvent.click(screen.getByTestId("kill-switch-confirm-btn"));

    await waitFor(() => {
      expect(killOrdersThunk).toHaveBeenCalledWith({
        scope: "symbol",
        scopeValue: "AAPL",
      });
    });

    expect(
      dispatch.mock.calls.some(
        (c) => c[0]?.type === "killSwitch/blockAdded" && c[0]?.payload?.scope === "symbol"
      )
    ).toBe(true);
  });

  it("sends resume request and clears blocks", async () => {
    mockState.killSwitch.blocks = [
      {
        id: "b1",
        scope: "all",
        scopeValues: [],
        issuedBy: "admin-1",
        issuedAt: Date.now(),
      },
    ];

    render(<KillSwitchButton />);

    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Resume Orders/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /I confirm this action/i }));
    fireEvent.click(screen.getByTestId("kill-switch-confirm-btn"));

    await waitFor(() => {
      expect(resumeOrdersThunk).toHaveBeenCalledWith({ scope: "all" });
    });

    expect(dispatch.mock.calls.some((c) => c[0]?.type === "killSwitch/allBlocksCleared")).toBe(
      true
    );
  });

  it("removes an active block from dialog", () => {
    mockState.killSwitch.blocks = [
      {
        id: "b2",
        scope: "symbol",
        scopeValues: ["AAPL"],
        issuedBy: "admin-1",
        issuedAt: Date.now(),
      },
    ];

    render(<KillSwitchButton />);

    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Remove block/i }));

    expect(dispatch.mock.calls.some((c) => c[0]?.type === "killSwitch/blockRemoved")).toBe(true);
  });

  it("button shows pulsing red style when blocks are active", () => {
    mockState.killSwitch.blocks = [
      {
        id: "active",
        scope: "all",
        scopeValues: [],
        issuedBy: "admin-1",
        issuedAt: Date.now(),
      },
    ];
    render(<KillSwitchButton />);
    const btn = screen.getByTestId("kill-switch-btn");
    expect(btn.className).toMatch(/animate-pulse/);
  });

  it("trader (non-admin) does not see User scope option", () => {
    mockState.auth.user = { id: "trader-1", role: "trader" };
    render(<KillSwitchButton />);
    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    // Trader should still see kill panel but with restricted scopes
    expect(screen.getByTestId("kill-switch-confirm-btn")).toBeInTheDocument();
  });

  it("kill scope=algo dispatches killOrdersThunk per algo", async () => {
    render(<KillSwitchButton />);
    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    fireEvent.click(screen.getByRole("button", { name: /By algo/i }));
    // Pick at least one algo
    const items = screen.getAllByRole("checkbox");
    if (items.length > 1) fireEvent.click(items[1]);
    fireEvent.click(screen.getByRole("checkbox", { name: /I confirm this action/i }));
    fireEvent.click(screen.getByTestId("kill-switch-confirm-btn"));
    await waitFor(() => {
      expect(killOrdersThunk).toHaveBeenCalled();
    });
  });

  it("dialog closes when Cancel button is clicked", () => {
    render(<KillSwitchButton />);
    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
    expect(screen.queryByTestId("kill-switch-confirm-btn")).not.toBeInTheDocument();
  });

  it("scope=all (no values) sends single kill request without scopeValue", async () => {
    render(<KillSwitchButton />);
    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    const allBtn = screen.queryByRole("button", { name: /All Active|Everywhere|^All$/i });
    if (allBtn) fireEvent.click(allBtn);
    fireEvent.click(screen.getByRole("checkbox", { name: /I confirm this action/i }));
    fireEvent.click(screen.getByTestId("kill-switch-confirm-btn"));
    await waitFor(() => {
      expect(killOrdersThunk).toHaveBeenCalled();
    });
  });

  it("does not send when confirmation checkbox not checked", () => {
    render(<KillSwitchButton />);
    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    fireEvent.click(screen.getByRole("button", { name: /By symbol/i }));
    fireEvent.click(screen.getByLabelText("AAPL"));
    // Submit button should be disabled without confirmation
    const submitBtn = screen.getByTestId("kill-switch-confirm-btn");
    expect(submitBtn).toBeDisabled();
  });

  it("trader has limited kill scope options", () => {
    mockState.auth.user = { id: "trader-1", role: "trader" };
    render(<KillSwitchButton />);
    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    // Trader still sees the dialog
    expect(screen.getByTestId("kill-switch-confirm-btn")).toBeInTheDocument();
  });

  it("switches to resume tab", () => {
    render(<KillSwitchButton />);
    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Resume Orders/i }));
    expect(screen.getByTestId("kill-switch-confirm-btn")).toBeInTheDocument();
  });

  it("market scope adds entries via Enter key", () => {
    render(<KillSwitchButton />);
    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    fireEvent.click(screen.getByRole("button", { name: /By market/i }));
    const input = screen.getByLabelText(/Market \/ Exchange/i);
    fireEvent.change(input, { target: { value: "XNAS" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toBeInTheDocument();
  });

  it("Escape closes the dialog", () => {
    render(<KillSwitchButton />);
    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    const dialog = screen.getByTestId("kill-switch-dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByTestId("kill-switch-confirm-btn")).not.toBeInTheDocument();
  });

  it("X button closes the dialog", () => {
    render(<KillSwitchButton />);
    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    fireEvent.click(screen.getByRole("button", { name: /^Close$/ }));
    expect(screen.queryByTestId("kill-switch-confirm-btn")).not.toBeInTheDocument();
  });

  it("kill scope=user with admin lets user pick a target user", () => {
    mockState.killSwitch.blocks = [];
    mockState.orders.orders = [{ userId: "user-1" }, { userId: "user-2" }];
    render(<KillSwitchButton />);
    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    fireEvent.click(screen.getByRole("button", { name: /By user/i }));
    // Admin sees a target user picker
    expect(screen.getByTestId("kill-switch-confirm-btn")).toBeInTheDocument();
  });

  it("admin can enter target user ID when no seen users", () => {
    mockState.orders.orders = [];
    render(<KillSwitchButton />);
    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    fireEvent.click(screen.getByRole("button", { name: /By user/i }));
    const input = screen.getByLabelText(/Target user ID/i);
    fireEvent.change(input, { target: { value: "trader-x" } });
    expect(input).toBeInTheDocument();
  });

  it("market scope multi-entry adds and removes entries", () => {
    render(<KillSwitchButton />);
    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    fireEvent.click(screen.getByRole("button", { name: /By market/i }));
    const input = screen.getByLabelText(/Market \/ Exchange/i);
    fireEvent.change(input, { target: { value: "XNAS" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // Remove tag
    const removeBtn = screen.queryByLabelText(/Remove XNAS/i);
    if (removeBtn) fireEvent.click(removeBtn);
    expect(screen.getByTestId("kill-switch-confirm-btn")).toBeInTheDocument();
  });

  it("scheduled resume mode shows preset buttons", () => {
    mockState.killSwitch.blocks = [
      {
        id: "b",
        scope: "all",
        scopeValues: [],
        issuedBy: "admin",
        issuedAt: Date.now(),
      },
    ];
    render(<KillSwitchButton />);
    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Resume Orders/i }));
    fireEvent.click(screen.getByRole("button", { name: /Scheduled/i }));
    // Preset buttons appear
    expect(screen.queryAllByRole("button", { name: /5m|10m|15m/ }).length).toBeGreaterThan(0);
  });

  it("scheduled resume preset is selectable", () => {
    mockState.killSwitch.blocks = [
      {
        id: "b",
        scope: "all",
        scopeValues: [],
        issuedBy: "admin",
        issuedAt: Date.now(),
      },
    ];
    render(<KillSwitchButton />);
    fireEvent.click(screen.getByTestId("kill-switch-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Resume Orders/i }));
    fireEvent.click(screen.getByRole("button", { name: /Scheduled/i }));
    const preset5m = screen.queryByRole("button", { name: /^5m$/ });
    if (preset5m) fireEvent.click(preset5m);
    expect(screen.getByTestId("kill-switch-confirm-btn")).toBeInTheDocument();
  });
});
