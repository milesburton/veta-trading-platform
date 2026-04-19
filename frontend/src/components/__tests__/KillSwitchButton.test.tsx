import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KillSwitchButton } from "../KillSwitchButton";

const dispatch = vi.fn();
const killOrdersThunk = vi.fn((payload) => ({ type: "orders/kill", payload }));
const resumeOrdersThunk = vi.fn((payload) => ({ type: "orders/resume", payload }));

let mockState: any = {};

vi.mock("../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) => selector(mockState),
}));

vi.mock("../../store/ordersSlice.ts", async () => {
  const actual = await vi.importActual<typeof import("../../store/ordersSlice.ts")>(
    "../../store/ordersSlice.ts",
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
      expect(killOrdersThunk).toHaveBeenCalledWith({ scope: "symbol", scopeValue: "AAPL" });
    });

    expect(
      dispatch.mock.calls.some(
        (c) => c[0]?.type === "killSwitch/blockAdded" && c[0]?.payload?.scope === "symbol",
      ),
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
      true,
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

    expect(
      dispatch.mock.calls.some((c) => c[0]?.type === "killSwitch/blockRemoved"),
    ).toBe(true);
  });
});
