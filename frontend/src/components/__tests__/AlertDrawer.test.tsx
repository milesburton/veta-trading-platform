import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlertDrawer, AlertList } from "../AlertDrawer";

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

vi.mock("../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => {
    const state = {
      alerts: {
        alerts,
        muteRules: [],
      },
    };
    return selector(state);
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
});

describe("AlertDrawer", () => {
  beforeEach(() => {
    dispatch.mockReset();
    addPanel.mockReset();
  });

  it("pins alerts panel and closes drawer", () => {
    const onClose = vi.fn();
    render(<AlertDrawer onClose={onClose} />);

    fireEvent.click(screen.getByTitle(/Pin to dashboard/i));

    expect(addPanel).toHaveBeenCalledWith("alerts");
    expect(onClose).toHaveBeenCalled();
  });

  it("dismisses all alerts from header action", () => {
    render(<AlertDrawer onClose={() => {}} />);

    fireEvent.click(screen.getByText(/Dismiss all/i));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "alerts/allAlertsDismissed" })
    );
  });
});
