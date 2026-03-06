import { act, fireEvent, render, screen } from "@testing-library/react";
import type { IJsonModel } from "flexlayout-react";
import { useContext } from "react";
import { describe, expect, it } from "vitest";
import { DashboardContext, DashboardProvider, useDashboard } from "../DashboardContext";
import { makeDefaultModel } from "../layoutModels";
import { DEFAULT_LAYOUT } from "../layoutUtils";
import type { PanelId } from "../panelRegistry";
import { PANEL_DESCRIPTIONS, PANEL_IDS, PANEL_TITLES } from "../panelRegistry";

/** Build a minimal flexlayout JSON model with the given panel types */
function makeMinimalModel(panelTypes: PanelId[]): IJsonModel {
  return {
    global: {},
    layout: {
      type: "row",
      children: panelTypes.map((pt) => ({
        type: "tabset",
        weight: Math.floor(100 / panelTypes.length),
        children: [
          {
            type: "tab",
            id: pt,
            name: PANEL_TITLES[pt] ?? pt,
            component: pt,
            config: { panelType: pt },
          },
        ],
      })),
    },
  };
}

// ─── Consumer component for testing context values ────────────────────────────

function ContextInspector() {
  const { activePanelIds, addPanel, removePanel, resetLayout } = useDashboard();
  return (
    <div>
      <span data-testid="active-count">{activePanelIds.size}</span>
      <span data-testid="active-ids">{[...activePanelIds].join(",")}</span>
      <button type="button" onClick={() => addPanel("candle-chart")}>
        Add Chart
      </button>
      <button type="button" onClick={() => removePanel("order-blotter")}>
        Remove Blotter
      </button>
      <button type="button" onClick={() => resetLayout()}>
        Reset
      </button>
    </div>
  );
}

function renderProvider(children = <ContextInspector />, initialModel?: IJsonModel) {
  return render(<DashboardProvider initialModel={initialModel}>{children}</DashboardProvider>);
}

function renderWithDefault(children = <ContextInspector />) {
  return renderProvider(children, makeDefaultModel());
}

// ─── DashboardProvider – initial state ───────────────────────────────────────

describe("DashboardProvider – initial state", () => {
  it("provides activePanelIds from DEFAULT_LAYOUT on mount", () => {
    renderWithDefault();
    const defaultIds = DEFAULT_LAYOUT.map((l) => l.panelType)
      .sort()
      .join(",");
    const activeIds = screen.getByTestId("active-ids").textContent?.split(",").sort().join(",");
    expect(activeIds).toBe(defaultIds);
  });

  it("always starts from DEFAULT_LAYOUT regardless of localStorage contents", () => {
    localStorage.setItem("dashboard-layout", JSON.stringify({ _v: 99, flex: {} }));
    renderWithDefault();
    const count = Number(screen.getByTestId("active-count").textContent);
    expect(count).toBe(DEFAULT_LAYOUT.length);
    localStorage.clear();
  });

  it("starts with empty layout when no initialModel provided", () => {
    renderProvider();
    expect(Number(screen.getByTestId("active-count").textContent)).toBe(0);
  });
});

// ─── DashboardProvider – addPanel ─────────────────────────────────────────────

describe("DashboardProvider – addPanel", () => {
  it("adds a panel that was not in the active set", () => {
    renderProvider(undefined, makeMinimalModel(["market-ladder", "order-ticket"]));
    const before = Number(screen.getByTestId("active-count").textContent);
    expect(before).toBeGreaterThan(0);
    act(() => {
      fireEvent.click(screen.getByText("Add Chart"));
    });
    expect(Number(screen.getByTestId("active-count").textContent)).toBe(before + 1);
  });

  it("does not duplicate a singleton panel already in the layout", () => {
    renderWithDefault();
    const before = Number(screen.getByTestId("active-count").textContent);
    act(() => {
      fireEvent.click(screen.getByText("Add Chart"));
    });
    expect(Number(screen.getByTestId("active-count").textContent)).toBe(before);
  });
});

// ─── DashboardProvider – removePanel ─────────────────────────────────────────

describe("DashboardProvider – removePanel", () => {
  it("removes a panel from the active set", () => {
    renderWithDefault();
    const before = Number(screen.getByTestId("active-count").textContent);
    act(() => {
      fireEvent.click(screen.getByText("Remove Blotter"));
    });
    const after = Number(screen.getByTestId("active-count").textContent);
    expect(after).toBe(before - 1);
    expect(screen.getByTestId("active-ids").textContent).not.toContain("order-blotter");
  });
});

// ─── DashboardProvider – resetLayout ─────────────────────────────────────────

describe("DashboardProvider – resetLayout", () => {
  it("restores the DEFAULT_LAYOUT panel set after removal", () => {
    renderWithDefault();

    // Remove blotter first
    act(() => {
      fireEvent.click(screen.getByText("Remove Blotter"));
    });
    expect(screen.getByTestId("active-ids").textContent).not.toContain("order-blotter");

    // Reset should restore it
    act(() => {
      fireEvent.click(screen.getByText("Reset"));
    });

    const defaultIds = DEFAULT_LAYOUT.map((l) => l.panelType)
      .sort()
      .join(",");
    const activeIds = screen.getByTestId("active-ids").textContent?.split(",").sort().join(",");
    expect(activeIds).toBe(defaultIds);
  });
});

// ─── PANEL_IDS and PANEL_TITLES integrity ─────────────────────────────────────

describe("Panel registry", () => {
  it("every PANEL_ID has a title in PANEL_TITLES", () => {
    for (const id of PANEL_IDS) {
      expect(PANEL_TITLES[id]).toBeTruthy();
    }
  });

  it("every PANEL_ID has a description in PANEL_DESCRIPTIONS", () => {
    for (const id of PANEL_IDS) {
      expect(PANEL_DESCRIPTIONS[id]).toBeTruthy();
    }
  });

  it("DEFAULT_LAYOUT panelTypes are all valid PANEL_IDs", () => {
    for (const item of DEFAULT_LAYOUT) {
      expect(PANEL_IDS).toContain(item.panelType as PanelId);
    }
  });
});

// ─── Default context values (no provider) ────────────────────────────────────

describe("DashboardContext – default value", () => {
  it("provides empty activePanelIds without a provider", () => {
    function Check() {
      const ctx = useContext(DashboardContext);
      return <span data-testid="size">{ctx.activePanelIds.size}</span>;
    }
    render(<Check />);
    expect(screen.getByTestId("size").textContent).toBe("0");
  });
});
