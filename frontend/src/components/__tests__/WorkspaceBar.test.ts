import { configureStore } from "@reduxjs/toolkit";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { type ComponentType, createElement, type ReactNode } from "react";
import { Provider } from "react-redux";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Workspace } from "../WorkspaceBar";
import {
  defaultWorkspaceForStyle,
  reconcilePresetWorkspaces,
  seedWorkspaces,
  useWorkspaces,
  WorkspaceSidebar,
} from "../WorkspaceBar";

const publishSharedWorkspaceMock = vi.fn();

vi.mock("../../hooks/useWorkspaceSync.ts", () => ({
  publishSharedWorkspace: (...args: unknown[]) =>
    publishSharedWorkspaceMock(...args),
}));

vi.mock("../SharedWorkspaceBrowser.tsx", () => ({
  SharedWorkspaceBrowser: ({
    onClose,
    onClone,
  }: {
    onClose: () => void;
    onClone: (name: string, model: unknown) => void;
  }) =>
    createElement(
      "div",
      { "data-testid": "shared-workspace-browser" },
      createElement(
        "button",
        { onClick: onClose, type: "button" },
        "close-browser",
      ),
      createElement(
        "button",
        {
          onClick: () =>
            onClone("Cloned Workspace", { layout: { type: "row" } }),
          type: "button",
        },
        "clone-from-browser",
      ),
    ),
}));

afterEach(() => {
  localStorage.clear();
  publishSharedWorkspaceMock.mockReset();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

function renderSidebar(overrides?: {
  workspaces?: Workspace[];
  activeId?: string;
  onSelect?: ReturnType<typeof vi.fn>;
  onWorkspacesChange?: ReturnType<typeof vi.fn>;
  onCloneWorkspace?: ReturnType<typeof vi.fn>;
  layouts?: Record<string, { toJson: () => unknown }>;
  role?: "trader" | "admin";
}) {
  const store = configureStore({
    reducer: {
      auth: (
        state = { user: { id: "u1", role: overrides?.role ?? "trader" } },
      ) => state,
    },
  });

  const defaultWorkspaces: Workspace[] = [
    { id: "ws-1", name: "Trading", locked: true },
    { id: "ws-2", name: "Research" },
  ];
  const onSelect = overrides?.onSelect ?? vi.fn();
  const onWorkspacesChange = overrides?.onWorkspacesChange ?? vi.fn();
  const onCloneWorkspace = overrides?.onCloneWorkspace ?? vi.fn();
  const layouts =
    overrides?.layouts ??
    ({
      "ws-2": {
        toJson: () => ({ layout: { type: "row" } }),
      },
    } as Record<string, { toJson: () => unknown }>);

  render(
    createElement(
      Provider as unknown as ComponentType<{
        store: typeof store;
        children?: ReactNode;
      }>,
      { store },
      createElement(WorkspaceSidebar, {
        activeId: overrides?.activeId ?? "ws-1",
        onSelect,
        onWorkspacesChange,
        workspaces: overrides?.workspaces ?? defaultWorkspaces,
        layouts: layouts as never,
        onCloneWorkspace,
      }),
    ),
  );

  return { onSelect, onWorkspacesChange, onCloneWorkspace };
}

// ── seedWorkspaces ────────────────────────────────────────────────────────────

describe("seedWorkspaces", () => {
  test("returns eleven locked trader workspaces by default", () => {
    const { workspaces } = seedWorkspaces();
    expect(workspaces).toHaveLength(11);
    expect(workspaces.map((w) => w.id)).toEqual([
      "ws-trading",
      "ws-algo",
      "ws-options",
      "ws-analysis",
      "ws-research",
      "ws-commodities",
      "ws-commodities-analysis",
      "ws-fi-trading",
      "ws-fi-analysis",
      "ws-fi-research",
      "ws-overview",
    ]);
    for (const w of workspaces) expect(w.locked).toBe(true);
  });

  test("returns five locked admin workspaces for role=admin", () => {
    const { workspaces } = seedWorkspaces("admin");
    expect(workspaces).toHaveLength(5);
    expect(workspaces.map((w) => w.id)).toEqual([
      "ws-market-feeds",
      "ws-system-status",
      "ws-pipeline-ops",
      "ws-administration",
      "ws-overview",
    ]);
    for (const w of workspaces) expect(w.locked).toBe(true);
  });

  test("seeds layout JSON for every workspace", () => {
    const { workspaces, layouts } = seedWorkspaces();
    for (const w of workspaces) {
      expect(layouts[w.id]).toBeDefined();
      expect(layouts[w.id].layout).toBeDefined();
    }
  });
});

// ── reconcilePresetWorkspaces ─────────────────────────────────────────────────

describe("reconcilePresetWorkspaces", () => {
  test("returns unchanged list when all presets are present", () => {
    const { workspaces, layouts } = seedWorkspaces();
    const { workspaces: out, restored } = reconcilePresetWorkspaces(
      workspaces,
      layouts,
    );
    expect(restored).toHaveLength(0);
    expect(out.map((w) => w.id)).toEqual(workspaces.map((w) => w.id));
  });

  test("restores a missing preset workspace", () => {
    const { workspaces, layouts } = seedWorkspaces();
    const withoutAlgo = workspaces.filter((w) => w.id !== "ws-algo");
    const withoutAlgoLayouts = Object.fromEntries(
      Object.entries(layouts).filter(([k]) => k !== "ws-algo"),
    );

    const {
      workspaces: out,
      layouts: outLayouts,
      restored,
    } = reconcilePresetWorkspaces(withoutAlgo, withoutAlgoLayouts);

    expect(restored).toEqual(["Algo"]);
    expect(out.map((w) => w.id)).toContain("ws-algo");
    expect(outLayouts["ws-algo"]).toBeDefined();
  });

  test("inserts restored workspace at the correct position", () => {
    const { workspaces, layouts } = seedWorkspaces();
    const withoutAlgo = workspaces.filter((w) => w.id !== "ws-algo");
    const withoutAlgoLayouts = Object.fromEntries(
      Object.entries(layouts).filter(([k]) => k !== "ws-algo"),
    );

    const { workspaces: out } = reconcilePresetWorkspaces(
      withoutAlgo,
      withoutAlgoLayouts,
    );
    const ids = out.map((w) => w.id);

    expect(ids.indexOf("ws-algo")).toBeGreaterThan(ids.indexOf("ws-trading"));
    expect(ids.indexOf("ws-algo")).toBeLessThan(ids.indexOf("ws-options"));
  });

  test("restored preset is marked locked", () => {
    const { workspaces, layouts } = seedWorkspaces();
    const withoutAlgo = workspaces.filter((w) => w.id !== "ws-algo");
    const withoutAlgoLayouts = Object.fromEntries(
      Object.entries(layouts).filter(([k]) => k !== "ws-algo"),
    );

    const { workspaces: out } = reconcilePresetWorkspaces(
      withoutAlgo,
      withoutAlgoLayouts,
    );
    const restored = out.find((w) => w.id === "ws-algo");
    expect(restored?.locked).toBe(true);
  });

  test("restores multiple missing presets in order", () => {
    const saved: Workspace[] = [
      {
        id: "ws-trading",
        name: "Trading",
        locked: true,
      },
    ];
    const savedLayouts = {
      "ws-trading": seedWorkspaces().layouts["ws-trading"],
    };

    const { workspaces: out, restored } = reconcilePresetWorkspaces(
      saved,
      savedLayouts,
    );

    expect(restored).toEqual([
      "Algo",
      "Options",
      "Analysis",
      "Research",
      "Commodities",
      "Cmdty Analysis",
      "FI Trading",
      "FI Analysis",
      "FI Research",
      "Overview",
    ]);
    expect(out.map((w) => w.id)).toEqual([
      "ws-trading",
      "ws-algo",
      "ws-options",
      "ws-analysis",
      "ws-research",
      "ws-commodities",
      "ws-commodities-analysis",
      "ws-fi-trading",
      "ws-fi-analysis",
      "ws-fi-research",
      "ws-overview",
    ]);
  });

  test("preserves custom (non-preset) workspaces", () => {
    const { workspaces, layouts } = seedWorkspaces();
    const custom: Workspace = { id: "ws-custom-1", name: "My Setup" };
    const withCustom = [...workspaces, custom];

    const { workspaces: out, restored } = reconcilePresetWorkspaces(
      withCustom,
      layouts,
    );

    expect(restored).toHaveLength(0);
    expect(out.map((w) => w.id)).toContain("ws-custom-1");
  });

  test("does not modify existing layouts when nothing is restored", () => {
    const { workspaces, layouts } = seedWorkspaces();
    const { layouts: outLayouts } = reconcilePresetWorkspaces(
      workspaces,
      layouts,
    );
    expect(outLayouts).toEqual(layouts);
  });

  test("restores missing admin preset for role=admin", () => {
    const { workspaces, layouts } = seedWorkspaces("admin");
    const withoutOverview = workspaces.filter((w) => w.id !== "ws-overview");
    const withoutOverviewLayouts = Object.fromEntries(
      Object.entries(layouts).filter(([k]) => k !== "ws-overview"),
    );

    const { workspaces: out, restored } = reconcilePresetWorkspaces(
      withoutOverview,
      withoutOverviewLayouts,
      "admin",
    );

    expect(restored).toEqual(["Overview"]);
    expect(out.map((w) => w.id)).toContain("ws-overview");
  });

  test("inserting first preset when list is empty", () => {
    const { workspaces: out, restored } = reconcilePresetWorkspaces([], {});

    expect(restored).toEqual([
      "Trading",
      "Algo",
      "Options",
      "Analysis",
      "Research",
      "Commodities",
      "Cmdty Analysis",
      "FI Trading",
      "FI Analysis",
      "FI Research",
      "Overview",
    ]);
    expect(out).toHaveLength(11);
  });
});

// ── userLocked ────────────────────────────────────────────────────────────────

describe("Workspace userLocked field", () => {
  test("preset workspace does not have userLocked set", () => {
    const { workspaces } = seedWorkspaces();
    for (const w of workspaces) expect(w.userLocked).toBeUndefined();
  });

  test("custom workspace can carry userLocked=true", () => {
    const custom: Workspace = {
      id: "ws-custom-1",
      name: "My Setup",
      userLocked: true,
    };
    expect(custom.userLocked).toBe(true);
    expect(custom.locked).toBeUndefined();
  });

  test("reconcile preserves userLocked on custom workspaces", () => {
    const { workspaces, layouts } = seedWorkspaces();
    const custom: Workspace = {
      id: "ws-custom-1",
      name: "My Setup",
      userLocked: true,
    };
    const withCustom = [...workspaces, custom];

    const { workspaces: out } = reconcilePresetWorkspaces(withCustom, layouts);
    const found = out.find((w) => w.id === "ws-custom-1");
    expect(found?.userLocked).toBe(true);
  });

  test("reconcile does not set userLocked on restored presets", () => {
    const { workspaces, layouts } = seedWorkspaces();
    const withoutAlgo = workspaces.filter((w) => w.id !== "ws-algo");
    const withoutAlgoLayouts = Object.fromEntries(
      Object.entries(layouts).filter(([k]) => k !== "ws-algo"),
    );

    const { workspaces: out } = reconcilePresetWorkspaces(
      withoutAlgo,
      withoutAlgoLayouts,
    );
    const restored = out.find((w) => w.id === "ws-algo");
    expect(restored?.userLocked).toBeUndefined();
    expect(restored?.locked).toBe(true);
  });
});

describe("defaultWorkspaceForStyle", () => {
  test("prefers mapped workspace when available", () => {
    const { workspaces } = seedWorkspaces();
    expect(defaultWorkspaceForStyle("derivatives_high_touch", workspaces)).toBe(
      "ws-options",
    );
  });

  test("falls back to first workspace when preferred is unavailable", () => {
    const available: Workspace[] = [
      { id: "ws-custom", name: "Custom" },
      { id: "ws-alt", name: "Alt" },
    ];
    expect(defaultWorkspaceForStyle("low_touch", available)).toBe("ws-custom");
    expect(defaultWorkspaceForStyle(undefined, available)).toBe("ws-custom");
  });
});

describe("useWorkspaces", () => {
  test("uses valid workspace id from URL query on first render", () => {
    window.history.replaceState(null, "", "/?ws=ws-options");
    const { result } = renderHook(() => useWorkspaces("u-1", "high_touch"));
    expect(result.current.activeId).toBe("ws-options");
  });

  test("falls back to trading style default when URL workspace is invalid", () => {
    window.history.replaceState(null, "", "/?ws=missing");
    const { result } = renderHook(() => useWorkspaces("u-1", "low_touch"));
    expect(result.current.activeId).toBe("ws-algo");
  });

  test("handleSelect updates active workspace and pushes URL state", () => {
    window.history.replaceState(null, "", "/");
    const { result } = renderHook(() => useWorkspaces("u-1", "high_touch"));

    act(() => {
      result.current.handleSelect("ws-analysis");
    });

    expect(result.current.activeId).toBe("ws-analysis");
    expect(new URLSearchParams(window.location.search).get("ws")).toBe(
      "ws-analysis",
    );
    expect(
      (window.history.state as { workspaceId?: string } | null)?.workspaceId,
    ).toBe("ws-analysis");
  });

  test("setWorkspaces resets active id when current id is removed", () => {
    const { result } = renderHook(() => useWorkspaces("u-1", "high_touch"));

    act(() => {
      result.current.handleSelect("ws-overview");
    });
    expect(result.current.activeId).toBe("ws-overview");

    const trimmed = result.current.workspaces.filter(
      (w) => w.id !== "ws-overview",
    );
    act(() => {
      result.current.setWorkspaces(trimmed);
    });

    expect(result.current.activeId).toBe(trimmed[0]?.id ?? "");
  });

  test("popstate selects requested workspace when it exists", () => {
    const { result } = renderHook(() => useWorkspaces("u-1", "high_touch"));

    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: { workspaceId: "ws-research" },
        }),
      );
    });
    expect(result.current.activeId).toBe("ws-research");

    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: { workspaceId: "ws-missing" } }),
      );
    });
    expect(result.current.activeId).toBe("ws-research");
  });
});

describe("WorkspaceSidebar", () => {
  test("renders workspace names and add button", () => {
    renderSidebar();

    expect(screen.getByText("Trading")).toBeInTheDocument();
    expect(screen.getByText("Research")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add new workspace/i }),
    ).toBeInTheDocument();
  });

  test("adds a workspace and selects it", () => {
    const { onSelect, onWorkspacesChange } = renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: /add new workspace/i }));

    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    const [next] = onWorkspacesChange.mock.calls[0] as [Workspace[]];
    expect(next).toHaveLength(3);
    expect(next[2].id).toMatch(/^ws-\d+$/);
    expect(next[2].name).toBe("Workspace 3");
    expect(onSelect).toHaveBeenCalledWith(next[2].id);
  });

  test("right click starts rename and enter commits trimmed name", () => {
    const { onWorkspacesChange } = renderSidebar({
      workspaces: [
        { id: "ws-1", name: "Trading", locked: true },
        { id: "ws-2", name: "Research" },
      ],
    });

    fireEvent.contextMenu(screen.getByTestId("workspace-tab-ws-2"));
    const renameInput = screen.getByLabelText("Rename workspace Research");
    fireEvent.change(renameInput, {
      target: { value: "  Renamed Workspace  " },
    });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    const [next] = onWorkspacesChange.mock.calls[0] as [Workspace[]];
    expect(next.find((w) => w.id === "ws-2")?.name).toBe("Renamed Workspace");
  });

  test("lock action updates userLocked flag", () => {
    const { onWorkspacesChange } = renderSidebar({
      workspaces: [
        { id: "ws-1", name: "Trading", locked: true },
        { id: "ws-2", name: "Research", userLocked: false },
      ],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Lock workspace Research" }),
    );
    const next = onWorkspacesChange.mock.calls[0]?.[0] as Workspace[];
    expect(next.find((w) => w.id === "ws-2")?.userLocked).toBe(true);
  });

  test("unlock action updates userLocked flag", () => {
    const { onWorkspacesChange } = renderSidebar({
      workspaces: [
        { id: "ws-1", name: "Trading", locked: true },
        { id: "ws-2", name: "Research", userLocked: true },
      ],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Unlock workspace Research" }),
    );
    const next = onWorkspacesChange.mock.calls[0]?.[0] as Workspace[];
    expect(next.find((w) => w.id === "ws-2")?.userLocked).toBe(false);
  });

  test("delete flow confirms before removing workspace", () => {
    const { onWorkspacesChange } = renderSidebar({
      activeId: "ws-2",
      workspaces: [
        { id: "ws-1", name: "Trading", locked: true },
        { id: "ws-2", name: "Research" },
      ],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Delete workspace Research" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    const [next] = onWorkspacesChange.mock.calls[0] as [Workspace[]];
    expect(next.map((w) => w.id)).toEqual(["ws-1"]);
  });

  test("share flow opens dialog and copies generated URL", async () => {
    publishSharedWorkspaceMock.mockResolvedValueOnce("shared-123");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderSidebar({
      layouts: {
        "ws-2": { toJson: () => ({ layout: { type: "row", children: [] } }) },
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Share workspace Research" }),
    );
    fireEvent.change(screen.getByPlaceholderText(/add a description/i), {
      target: { value: "Morning setup" },
    });
    fireEvent.click(screen.getByRole("button", { name: /share & copy link/i }));

    await waitFor(() => {
      expect(publishSharedWorkspaceMock).toHaveBeenCalledWith(
        "Research",
        "Morning setup",
        expect.any(Object),
      );
    });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("?shared=shared-123"),
    );
    expect(await screen.findByText("Link copied!")).toBeInTheDocument();
  });

  test("browse shared workspaces supports clone callback", () => {
    const { onSelect, onWorkspacesChange, onCloneWorkspace } = renderSidebar();

    fireEvent.click(
      screen.getByRole("button", { name: /browse shared workspaces/i }),
    );
    expect(screen.getByTestId("shared-workspace-browser")).toBeInTheDocument();

    fireEvent.click(screen.getByText("clone-from-browser"));

    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    const [next] = onWorkspacesChange.mock.calls[0] as [Workspace[]];
    const cloned = next.find((w) => w.name === "Cloned Workspace");
    expect(cloned?.id).toMatch(/^ws-\d+$/);
    expect(onSelect).toHaveBeenCalledWith(cloned?.id);
    expect(onCloneWorkspace).toHaveBeenCalledWith(cloned?.id, {
      layout: { type: "row" },
    });
  });

  test("when not pinned, sidebar can render collapsed initials", () => {
    localStorage.setItem("sidebar-pinned", "false");
    renderSidebar();

    const list = screen.getByLabelText("Workspaces");
    fireEvent.mouseEnter(screen.getByTestId("workspace-sidebar"));
    fireEvent.mouseLeave(screen.getByTestId("workspace-sidebar"));
    expect(list).toBeInTheDocument();
    expect(screen.getByTestId("workspace-tab-ws-1")).toHaveTextContent("T");
  });
});
