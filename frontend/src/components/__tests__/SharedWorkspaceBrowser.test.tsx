import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { IJsonModel } from "flexlayout-react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authSlice } from "../../store/authSlice";
import { SharedWorkspaceBrowser } from "../SharedWorkspaceBrowser";

const listSharedWorkspaces = vi.fn();
const fetchSharedWorkspace = vi.fn();
const deleteSharedWorkspace = vi.fn();

vi.mock("../../hooks/useWorkspaceSync.ts", () => ({
  listSharedWorkspaces: (...args: unknown[]) => listSharedWorkspaces(...args),
  fetchSharedWorkspace: (...args: unknown[]) => fetchSharedWorkspace(...args),
  deleteSharedWorkspace: (...args: unknown[]) => deleteSharedWorkspace(...args),
}));

function makeStore(role: "admin" | "trader" = "admin") {
  return configureStore({
    reducer: {
      auth: authSlice.reducer,
    },
    preloadedState: {
      auth: {
        user: {
          id: "u-1",
          name: role === "admin" ? "Admin User" : "Trader User",
          role,
          avatar_emoji: role === "admin" ? "A" : "T",
        },
        limits: {
          max_order_qty: 10000,
          max_daily_notional: 1000000,
          allowed_strategies: ["LIMIT"],
          allowed_desks: ["equity"],
          dark_pool_access: false,
        },
        status: "authenticated" as const,
      },
    },
  });
}

function renderBrowser(role: "admin" | "trader" = "admin") {
  const onClose = vi.fn();
  const onClone = vi.fn();
  render(
    <Provider store={makeStore(role)}>
      <SharedWorkspaceBrowser onClose={onClose} onClone={onClone} />
    </Provider>,
  );
  return { onClose, onClone };
}

beforeEach(() => {
  listSharedWorkspaces.mockResolvedValue([
    {
      id: "ws-1",
      ownerId: "u-1",
      ownerName: "Alice",
      ownerEmoji: "A",
      name: "Macro Desk",
      description: "Rates and curve view",
      createdAt: Math.floor(Date.now() / 1000) - 300,
    },
    {
      id: "ws-2",
      ownerId: "u-2",
      ownerName: "Bob",
      ownerEmoji: "B",
      name: "Equity Momentum",
      description: "High beta tech focus",
      createdAt: Math.floor(Date.now() / 1000) - 7200,
    },
  ]);

  fetchSharedWorkspace.mockResolvedValue({
    id: "ws-1",
    ownerId: "u-1",
    ownerName: "Alice",
    ownerEmoji: "A",
    name: "Macro Desk",
    description: "Rates and curve view",
    createdAt: Math.floor(Date.now() / 1000) - 300,
    model: { global: {}, layout: { type: "row", children: [] } } as IJsonModel,
  });

  deleteSharedWorkspace.mockResolvedValue(true);
});

describe("SharedWorkspaceBrowser", () => {
  it("loads and renders shared workspaces", async () => {
    renderBrowser();

    expect(await screen.findByText("Macro Desk")).toBeInTheDocument();
    expect(screen.getByText("Equity Momentum")).toBeInTheDocument();
    expect(listSharedWorkspaces).toHaveBeenCalledTimes(1);
  });

  it("filters workspaces by search", async () => {
    renderBrowser();
    await screen.findByText("Macro Desk");

    fireEvent.change(screen.getByPlaceholderText(/Filter by name/i), {
      target: { value: "equity" },
    });

    expect(screen.queryByText("Macro Desk")).not.toBeInTheDocument();
    expect(screen.getByText("Equity Momentum")).toBeInTheDocument();
  });

  it("clones a workspace and calls onClone", async () => {
    const { onClone } = renderBrowser();
    await screen.findByText("Macro Desk");

    fireEvent.click(screen.getAllByRole("button", { name: /Clone/i })[0]);

    await waitFor(() => {
      expect(fetchSharedWorkspace).toHaveBeenCalledWith("ws-1");
      expect(onClone).toHaveBeenCalledWith(
        "Macro Desk",
        expect.objectContaining({ layout: expect.any(Object) }),
      );
    });
  });

  it("shows delete action for admin and removes entry", async () => {
    renderBrowser("admin");
    await screen.findByText("Macro Desk");

    fireEvent.click(screen.getAllByRole("button", { name: "✕" })[0]);

    await waitFor(() => {
      expect(deleteSharedWorkspace).toHaveBeenCalledWith("ws-1");
      expect(screen.queryByText("Macro Desk")).not.toBeInTheDocument();
    });
  });

  it("hides delete action for non-admin users", async () => {
    renderBrowser("trader");
    await screen.findByText("Macro Desk");

    // Trader can still clone but should not see delete buttons
    expect(screen.getAllByRole("button", { name: /Clone/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "✕" })).not.toBeInTheDocument();
  });
});
