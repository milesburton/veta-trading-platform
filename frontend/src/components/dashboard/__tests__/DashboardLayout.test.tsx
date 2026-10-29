import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  DashboardContext,
  DashboardProvider,
  useDashboard,
} from "@veta/frontend/components/dashboard/DashboardContext";
import { makeDefaultModel } from "@veta/frontend/components/dashboard/layoutModels";
import { DEFAULT_LAYOUT } from "@veta/frontend/components/dashboard/layoutUtils";
import type { PanelId } from "@veta/frontend/components/dashboard/panelRegistry";
import {
  PANEL_DESCRIPTIONS,
  PANEL_IDS,
  PANEL_TITLES,
} from "@veta/frontend/components/dashboard/panelRegistry";
import { type IJsonModel, Model } from "flexlayout-react";
import { useContext } from "react";
import { describe, expect, it } from "vite-plus/test";

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

function ContextInspector() {
  const { activePanelIds, addPanel, removePanel, resetLayout, setLayout, removeTabById, setModel } =
    useDashboard();
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
      <button type="button" onClick={() => setLayout(() => [])}>
        Set Layout Noop
      </button>
      <button type="button" onClick={() => removeTabById("order-blotter")}>
        Remove By Id
      </button>
      <button
        type="button"
        onClick={() => setModel(Model.fromJson(makeMinimalModel(["market-ladder"])))}
      >
        Set Model
      </button>
      <button
        type="button"
        onClick={() =>
          resetLayout(
            makeMinimalModel(["order-ticket", "market-ladder", "order-blotter"]) as IJsonModel
          )
        }
      >
        Reset Template
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

function expectActiveCount(count: number) {
  expect(screen.getByTestId("active-count")).toHaveTextContent(new RegExp(`^${count}$`));
}

function expectDefaultLayoutActive() {
  expectActiveCount(DEFAULT_LAYOUT.length);
  for (const { panelType } of DEFAULT_LAYOUT) {
    expect(screen.getByTestId("active-ids")).toHaveTextContent(panelType);
  }
}

describe("DashboardProvider – initial state", () => {
  it("provides activePanelIds from DEFAULT_LAYOUT on mount", () => {
    renderWithDefault();
    expectDefaultLayoutActive();
  });

  it("always starts from DEFAULT_LAYOUT regardless of localStorage contents", () => {
    localStorage.setItem("dashboard-layout", JSON.stringify({ _v: 99, flex: {} }));
    renderWithDefault();
    expectActiveCount(DEFAULT_LAYOUT.length);
    localStorage.clear();
  });

  it("starts with empty layout when no initialModel provided", () => {
    renderProvider();
    expectActiveCount(0);
  });
});

describe("DashboardProvider – addPanel", () => {
  it("adds a panel that was not in the active set", () => {
    renderProvider(undefined, makeMinimalModel(["market-ladder", "order-ticket"]));
    expectActiveCount(2);
    act(() => {
      fireEvent.click(screen.getByText("Add Chart"));
    });
    expectActiveCount(3);
  });

  it("does not duplicate a singleton panel already in the layout", () => {
    renderWithDefault();
    expectActiveCount(DEFAULT_LAYOUT.length);
    act(() => {
      fireEvent.click(screen.getByText("Add Chart"));
    });
    expectActiveCount(DEFAULT_LAYOUT.length);
  });
});

describe("DashboardProvider – removePanel", () => {
  it("removes a panel from the active set", () => {
    renderWithDefault();
    expectActiveCount(DEFAULT_LAYOUT.length);
    act(() => {
      fireEvent.click(screen.getByText("Remove Blotter"));
    });
    expectActiveCount(DEFAULT_LAYOUT.length - 1);
    expect(screen.getByTestId("active-ids")).not.toHaveTextContent("order-blotter");
  });
});

describe("DashboardProvider – resetLayout", () => {
  it("restores the DEFAULT_LAYOUT panel set after removal", () => {
    renderWithDefault();

    // Remove blotter first
    act(() => {
      fireEvent.click(screen.getByText("Remove Blotter"));
    });
    expect(screen.getByTestId("active-ids")).not.toHaveTextContent("order-blotter");

    // Reset should restore it
    act(() => {
      fireEvent.click(screen.getByText("Reset"));
    });

    expectDefaultLayoutActive();
  });

  it("supports resetting from an explicit template model", () => {
    renderProvider();
    act(() => {
      fireEvent.click(screen.getByText("Reset Template"));
    });
    const active = screen.getByTestId("active-ids");
    expect(active).toHaveTextContent("order-ticket");
    expect(active).toHaveTextContent("market-ladder");
    expect(active).toHaveTextContent("order-blotter");
  });
});

describe("DashboardProvider – model and tab controls", () => {
  it("setModel replaces active panel set", () => {
    renderWithDefault();
    act(() => {
      fireEvent.click(screen.getByText("Set Model"));
    });
    expect(screen.getByTestId("active-ids")).toHaveTextContent("market-ladder");
    expect(screen.getByTestId("active-ids")).not.toHaveTextContent("order-blotter");
  });

  it("removeTabById removes a specific tab instance", () => {
    renderWithDefault();
    expect(screen.getByTestId("active-ids")).toHaveTextContent("order-blotter");
    act(() => {
      fireEvent.click(screen.getByText("Remove By Id"));
    });
    expect(screen.getByTestId("active-ids")).not.toHaveTextContent("order-blotter");
  });

  it("setLayout callback remains a no-op by design", () => {
    renderWithDefault();
    act(() => {
      fireEvent.click(screen.getByText("Set Layout Noop"));
    });
    expectDefaultLayoutActive();
  });
});

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

describe("DashboardContext – default value", () => {
  it("provides empty activePanelIds without a provider", () => {
    function Check() {
      const ctx = useContext(DashboardContext);
      return <span data-testid="size">{ctx.activePanelIds.size}</span>;
    }
    render(<Check />);
    expect(screen.getByTestId("size")).toHaveTextContent(/^0$/);
  });
});
