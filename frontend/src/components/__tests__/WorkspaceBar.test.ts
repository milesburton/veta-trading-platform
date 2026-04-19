import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { Workspace } from "../WorkspaceBar";
import {
  defaultWorkspaceForStyle,
  reconcilePresetWorkspaces,
  seedWorkspaces,
  useWorkspaces,
} from "../WorkspaceBar";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

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
    const { workspaces: out, restored } = reconcilePresetWorkspaces(workspaces, layouts);
    expect(restored).toHaveLength(0);
    expect(out.map((w) => w.id)).toEqual(workspaces.map((w) => w.id));
  });

  test("restores a missing preset workspace", () => {
    const { workspaces, layouts } = seedWorkspaces();
    const withoutAlgo = workspaces.filter((w) => w.id !== "ws-algo");
    const withoutAlgoLayouts = Object.fromEntries(
      Object.entries(layouts).filter(([k]) => k !== "ws-algo")
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
      Object.entries(layouts).filter(([k]) => k !== "ws-algo")
    );

    const { workspaces: out } = reconcilePresetWorkspaces(withoutAlgo, withoutAlgoLayouts);
    const ids = out.map((w) => w.id);

    expect(ids.indexOf("ws-algo")).toBeGreaterThan(ids.indexOf("ws-trading"));
    expect(ids.indexOf("ws-algo")).toBeLessThan(ids.indexOf("ws-options"));
  });

  test("restored preset is marked locked", () => {
    const { workspaces, layouts } = seedWorkspaces();
    const withoutAlgo = workspaces.filter((w) => w.id !== "ws-algo");
    const withoutAlgoLayouts = Object.fromEntries(
      Object.entries(layouts).filter(([k]) => k !== "ws-algo")
    );

    const { workspaces: out } = reconcilePresetWorkspaces(withoutAlgo, withoutAlgoLayouts);
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

    const { workspaces: out, restored } = reconcilePresetWorkspaces(saved, savedLayouts);

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

    const { workspaces: out, restored } = reconcilePresetWorkspaces(withCustom, layouts);

    expect(restored).toHaveLength(0);
    expect(out.map((w) => w.id)).toContain("ws-custom-1");
  });

  test("does not modify existing layouts when nothing is restored", () => {
    const { workspaces, layouts } = seedWorkspaces();
    const { layouts: outLayouts } = reconcilePresetWorkspaces(workspaces, layouts);
    expect(outLayouts).toEqual(layouts);
  });

  test("restores missing admin preset for role=admin", () => {
    const { workspaces, layouts } = seedWorkspaces("admin");
    const withoutOverview = workspaces.filter((w) => w.id !== "ws-overview");
    const withoutOverviewLayouts = Object.fromEntries(
      Object.entries(layouts).filter(([k]) => k !== "ws-overview")
    );

    const { workspaces: out, restored } = reconcilePresetWorkspaces(
      withoutOverview,
      withoutOverviewLayouts,
      "admin"
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
      Object.entries(layouts).filter(([k]) => k !== "ws-algo")
    );

    const { workspaces: out } = reconcilePresetWorkspaces(withoutAlgo, withoutAlgoLayouts);
    const restored = out.find((w) => w.id === "ws-algo");
    expect(restored?.userLocked).toBeUndefined();
    expect(restored?.locked).toBe(true);
  });
});

describe("defaultWorkspaceForStyle", () => {
  test("prefers mapped workspace when available", () => {
    const { workspaces } = seedWorkspaces();
    expect(defaultWorkspaceForStyle("derivatives_high_touch", workspaces)).toBe("ws-options");
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
    expect(new URLSearchParams(window.location.search).get("ws")).toBe("ws-analysis");
    expect((window.history.state as { workspaceId?: string } | null)?.workspaceId).toBe(
      "ws-analysis"
    );
  });

  test("setWorkspaces resets active id when current id is removed", () => {
    const { result } = renderHook(() => useWorkspaces("u-1", "high_touch"));

    act(() => {
      result.current.handleSelect("ws-overview");
    });
    expect(result.current.activeId).toBe("ws-overview");

    const trimmed = result.current.workspaces.filter((w) => w.id !== "ws-overview");
    act(() => {
      result.current.setWorkspaces(trimmed);
    });

    expect(result.current.activeId).toBe(trimmed[0]?.id ?? "");
  });

  test("popstate selects requested workspace when it exists", () => {
    const { result } = renderHook(() => useWorkspaces("u-1", "high_touch"));

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { workspaceId: "ws-research" } }));
    });
    expect(result.current.activeId).toBe("ws-research");

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { workspaceId: "ws-missing" } }));
    });
    expect(result.current.activeId).toBe("ws-research");
  });
});
