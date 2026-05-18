import { fireEvent, render, screen } from "@testing-library/react";
import { ALERTS_DRAWER_ID, AlertDrawer, AlertList } from "@veta/frontend/components/AlertDrawer";
import { DrawersProvider, useDrawers } from "@veta/frontend/components/drawers/DrawersContext";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatch = vi.fn();
const addPanel = vi.fn();

const alerts = [
  {
    id: "a-1",
    severity: "CRITICAL",
    source: "service",
    message: "Exchange down",
    detail: "tcp timeout",
    ts: Date.now(),
    dismissed: false,
  },
  {
    id: "a-2",
    severity: "INFO",
    source: "workspace",
    message: "Workspace saved",
    ts: Date.now(),
    dismissed: false,
  },
] as const;

const mockState: { alerts: typeof alerts; muteRules: unknown[] } = {
  alerts,
  muteRules: [],
};

vi.mock("../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => {
    return selector({ alerts: mockState });
  },
}));

vi.mock("../dashboard/DashboardContext.tsx", () => ({
  useDashboard: () => ({
    activePanelIds: new Set<string>(),
    addPanel,
  }),
}));

describe("AlertList", () => {
  beforeEach(() => {
    dispatch.mockReset();
    addPanel.mockReset();
  });

  it("filters by severity and source", () => {
    render(
      <AlertList
        alerts={[...alerts]}
        filter="ALL"
        onFilter={() => {}}
        sourceFilter={null}
        onSourceFilter={() => {}}
      />
    );

    expect(screen.getByText(/Exchange down/i)).toBeInTheDocument();
    expect(screen.getByText(/Workspace saved/i)).toBeInTheDocument();
    expect(screen.getByTestId("severity-filter-CRITICAL")).toBeInTheDocument();
    expect(screen.getByTestId("source-filter-service")).toBeInTheDocument();
  });

  it("dispatches mute and dismiss actions from row controls", () => {
    render(
      <AlertList
        alerts={[...alerts]}
        filter="ALL"
        onFilter={() => {}}
        sourceFilter={null}
        onSourceFilter={() => {}}
      />
    );

    fireEvent.click(screen.getAllByTestId("mute-similar-btn")[0]);
    fireEvent.click(screen.getAllByTitle(/Dismiss/i)[0]);

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "alerts/muteRuleAdded" })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "alerts/alertDismissed" })
    );
  });

  it("severity filter hides non-matching alerts", () => {
    render(
      <AlertList
        alerts={[...alerts]}
        filter="CRITICAL"
        onFilter={() => {}}
        sourceFilter={null}
        onSourceFilter={() => {}}
      />
    );
    expect(screen.getByText(/Exchange down/i)).toBeInTheDocument();
    expect(screen.queryByText(/Workspace saved/i)).not.toBeInTheDocument();
  });

  it("source filter hides non-matching alerts", () => {
    render(
      <AlertList
        alerts={[...alerts]}
        filter="ALL"
        onFilter={() => {}}
        sourceFilter="workspace"
        onSourceFilter={() => {}}
      />
    );
    expect(screen.queryByText(/Exchange down/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Workspace saved/i)).toBeInTheDocument();
  });

  it("clicking the active source toggles it off", () => {
    const onSourceFilter = vi.fn();
    render(
      <AlertList
        alerts={[...alerts]}
        filter="ALL"
        onFilter={() => {}}
        sourceFilter="service"
        onSourceFilter={onSourceFilter}
      />
    );
    fireEvent.click(screen.getByTestId("source-filter-service"));
    expect(onSourceFilter).toHaveBeenCalledWith(null);
  });

  it("clicking a different source switches to it", () => {
    const onSourceFilter = vi.fn();
    render(
      <AlertList
        alerts={[...alerts]}
        filter="ALL"
        onFilter={() => {}}
        sourceFilter="service"
        onSourceFilter={onSourceFilter}
      />
    );
    fireEvent.click(screen.getByTestId("source-filter-workspace"));
    expect(onSourceFilter).toHaveBeenCalledWith("workspace");
  });

  it("clicking All Sources resets to null", () => {
    const onSourceFilter = vi.fn();
    render(
      <AlertList
        alerts={[...alerts]}
        filter="ALL"
        onFilter={() => {}}
        sourceFilter="service"
        onSourceFilter={onSourceFilter}
      />
    );
    fireEvent.click(screen.getByTestId("source-filter-all"));
    expect(onSourceFilter).toHaveBeenCalledWith(null);
  });

  it("severity buttons call onFilter with the chosen value", () => {
    const onFilter = vi.fn();
    render(
      <AlertList
        alerts={[...alerts]}
        filter="ALL"
        onFilter={onFilter}
        sourceFilter={null}
        onSourceFilter={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("severity-filter-WARNING"));
    expect(onFilter).toHaveBeenCalledWith("WARNING");
  });

  it("renders empty state when filter excludes all alerts", () => {
    render(
      <AlertList
        alerts={[...alerts]}
        filter="WARNING"
        onFilter={() => {}}
        sourceFilter={null}
        onSourceFilter={() => {}}
      />
    );
    expect(screen.getByText(/No alerts/i)).toBeInTheDocument();
    expect(screen.queryByTestId("alert-row")).not.toBeInTheDocument();
  });

  it("footer shows total count when nothing is filtered", () => {
    render(
      <AlertList
        alerts={[...alerts]}
        filter="ALL"
        onFilter={() => {}}
        sourceFilter={null}
        onSourceFilter={() => {}}
      />
    );
    expect(screen.getByText(/2 alerts$/)).toBeInTheDocument();
  });

  it("footer shows X of Y when a filter is active", () => {
    render(
      <AlertList
        alerts={[...alerts]}
        filter="CRITICAL"
        onFilter={() => {}}
        sourceFilter={null}
        onSourceFilter={() => {}}
      />
    );
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
  });

  it("renders mute-rule count when rules exist", () => {
    mockState.muteRules = [{ source: "service", severity: "CRITICAL" }];
    try {
      render(
        <AlertList
          alerts={[...alerts]}
          filter="ALL"
          onFilter={() => {}}
          sourceFilter={null}
          onSourceFilter={() => {}}
        />
      );
      expect(screen.getByText(/1 mute rule active/)).toBeInTheDocument();
    } finally {
      mockState.muteRules = [];
    }
  });

  it("pluralises the mute-rule count", () => {
    mockState.muteRules = [
      { source: "service", severity: "CRITICAL" },
      { source: "algo", severity: "WARNING" },
    ];
    try {
      render(
        <AlertList
          alerts={[...alerts]}
          filter="ALL"
          onFilter={() => {}}
          sourceFilter={null}
          onSourceFilter={() => {}}
        />
      );
      expect(screen.getByText(/2 mute rules active/)).toBeInTheDocument();
    } finally {
      mockState.muteRules = [];
    }
  });

  it("does not render source filter row when onSourceFilter is omitted", () => {
    render(<AlertList alerts={[...alerts]} filter="ALL" onFilter={() => {}} />);
    expect(screen.queryByTestId("source-filter-all")).not.toBeInTheDocument();
  });

  it("renders ×N count badge on deduped alerts", () => {
    const dedupedAlerts = [
      {
        id: "d-1",
        severity: "WARNING" as const,
        source: "algo" as const,
        message: "Algo TWAP gap",
        ts: Date.now() - 30_000,
        lastTs: Date.now() - 1_000,
        count: 7,
        dismissed: false,
      },
    ];
    render(
      <AlertList
        alerts={dedupedAlerts}
        filter="ALL"
        onFilter={() => {}}
        sourceFilter={null}
        onSourceFilter={() => {}}
      />
    );
    expect(screen.getByTestId("alert-count")).toHaveTextContent("×7");
    expect(screen.getByText(/last/)).toBeInTheDocument();
    expect(screen.getByText(/first/)).toBeInTheDocument();
  });

  it("caps ×N display at 99+", () => {
    const dedupedAlerts = [
      {
        id: "d-2",
        severity: "WARNING" as const,
        source: "algo" as const,
        message: "Algo TWAP gap",
        ts: Date.now(),
        count: 250,
        dismissed: false,
      },
    ];
    render(
      <AlertList
        alerts={dedupedAlerts}
        filter="ALL"
        onFilter={() => {}}
        sourceFilter={null}
        onSourceFilter={() => {}}
      />
    );
    expect(screen.getByTestId("alert-count")).toHaveTextContent("×99+");
  });

  it("renders 'caused by' line when relatedTopic is set", () => {
    const causedAlerts = [
      {
        id: "c-1",
        severity: "WARNING" as const,
        source: "order" as const,
        message: "Order rejected",
        ts: Date.now(),
        relatedTopic: "orders.rejected",
        relatedEventId: "ord-99",
        dismissed: false,
      },
    ];
    render(
      <AlertList
        alerts={causedAlerts}
        filter="ALL"
        onFilter={() => {}}
        sourceFilter={null}
        onSourceFilter={() => {}}
      />
    );
    const line = screen.getByTestId("alert-caused-by");
    expect(line).toHaveTextContent("orders.rejected");
    expect(line).toHaveTextContent("ord-99");
  });

  it("does not render 'caused by' when no related context is set", () => {
    render(
      <AlertList
        alerts={[...alerts]}
        filter="ALL"
        onFilter={() => {}}
        sourceFilter={null}
        onSourceFilter={() => {}}
      />
    );
    expect(screen.queryByTestId("alert-caused-by")).not.toBeInTheDocument();
  });
});

function renderOpenAlertDrawer(onClose: () => void) {
  function Opener() {
    const { open } = useDrawers();
    useEffect(() => {
      open(ALERTS_DRAWER_ID);
    }, [open]);
    return null;
  }
  return render(
    <DrawersProvider>
      <Opener />
      <AlertDrawer onClose={onClose} />
    </DrawersProvider>
  );
}

describe("AlertDrawer", () => {
  beforeEach(() => {
    dispatch.mockReset();
    addPanel.mockReset();
  });

  it("pins alerts panel and closes drawer", () => {
    const onClose = vi.fn();
    renderOpenAlertDrawer(onClose);

    fireEvent.click(screen.getByTitle(/Pin to dashboard/i));

    expect(addPanel).toHaveBeenCalledWith("alerts");
    expect(onClose).toHaveBeenCalled();
  });

  it("dismisses all alerts from header action", () => {
    renderOpenAlertDrawer(() => {});

    fireEvent.click(screen.getByText(/Dismiss all/i));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "alerts/allAlertsDismissed" })
    );
  });

  it("hides the Dismiss all button when there are no alerts", () => {
    mockState.alerts = [] as unknown as typeof alerts;
    try {
      renderOpenAlertDrawer(() => {});
      expect(screen.queryByText(/Dismiss all/i)).not.toBeInTheDocument();
    } finally {
      mockState.alerts = alerts;
    }
  });
});
