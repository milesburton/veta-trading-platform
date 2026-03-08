import { describe, expect, test } from "vitest";
import type { Workspace } from "../WorkspaceBar";
import { reconcilePresetWorkspaces, seedWorkspaces } from "../WorkspaceBar";

// ── seedWorkspaces ────────────────────────────────────────────────────────────

describe("seedWorkspaces", () => {
  test("returns four locked trader workspaces by default", () => {
    const { workspaces } = seedWorkspaces();
    expect(workspaces).toHaveLength(4);
    expect(workspaces.map((w) => w.id)).toEqual([
      "ws-trading",
      "ws-analysis",
      "ws-algo",
      "ws-overview",
    ]);
    for (const w of workspaces) expect(w.locked).toBe(true);
  });

  test("returns two locked admin workspaces for role=admin", () => {
    const { workspaces } = seedWorkspaces("admin");
    expect(workspaces).toHaveLength(2);
    expect(workspaces.map((w) => w.id)).toEqual(["ws-mission-control", "ws-overview"]);
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

    expect(ids.indexOf("ws-algo")).toBeGreaterThan(ids.indexOf("ws-analysis"));
    expect(ids.indexOf("ws-algo")).toBeLessThan(ids.indexOf("ws-overview"));
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
    const saved: Workspace[] = [{ id: "ws-trading", name: "Trading", locked: true }];
    const savedLayouts = { "ws-trading": seedWorkspaces().layouts["ws-trading"] };

    const { workspaces: out, restored } = reconcilePresetWorkspaces(saved, savedLayouts);

    expect(restored).toEqual(["Analysis", "Algo", "Overview"]);
    expect(out.map((w) => w.id)).toEqual(["ws-trading", "ws-analysis", "ws-algo", "ws-overview"]);
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

    expect(restored).toEqual(["Trading", "Analysis", "Algo", "Overview"]);
    expect(out).toHaveLength(4);
  });
});
