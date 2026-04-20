import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { alertsSlice } from "../../store/alertsSlice";
import { AlertsPanel } from "../AlertsPanel";

vi.mock("../AlertDrawer.tsx", () => ({
  AlertList: ({
    alerts,
    filter,
    sourceFilter,
  }: {
    alerts: unknown[];
    filter: string;
    sourceFilter: string | null;
  }) => (
    <div data-testid="mock-alert-list">
      count={alerts.length};filter={filter};source={sourceFilter ?? "none"}
    </div>
  ),
}));

function renderPanel(
  preloadedAlerts: Array<{
    id: string;
    severity: "CRITICAL" | "WARNING" | "INFO";
    source: "service" | "order" | "algo" | "kill-switch" | "workspace";
    message: string;
    ts: number;
    dismissed: boolean;
  }>
) {
  const store = configureStore({
    reducer: { alerts: alertsSlice.reducer },
    preloadedState: {
      alerts: {
        alerts: preloadedAlerts,
        muteRules: [],
      },
    },
  });

  render(
    <Provider store={store}>
      <AlertsPanel />
    </Provider>
  );

  return store;
}

describe("AlertsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading and passes active alerts to list", () => {
    renderPanel([
      {
        id: "a-1",
        severity: "WARNING",
        source: "service",
        message: "latency high",
        ts: Date.now(),
        dismissed: false,
      },
      {
        id: "a-2",
        severity: "INFO",
        source: "order",
        message: "minor update",
        ts: Date.now(),
        dismissed: true,
      },
    ]);

    expect(screen.getByText(/Alert Centre/i)).toBeInTheDocument();
    expect(screen.getByTestId("mock-alert-list")).toHaveTextContent("count=1");
  });

  it("dismisses all active alerts", () => {
    renderPanel([
      {
        id: "a-1",
        severity: "CRITICAL",
        source: "kill-switch",
        message: "halted",
        ts: Date.now(),
        dismissed: false,
      },
    ]);

    expect(screen.getByTestId("dismiss-all-btn")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("dismiss-all-btn"));

    expect(screen.queryByTestId("dismiss-all-btn")).not.toBeInTheDocument();
    expect(screen.getByTestId("mock-alert-list")).toHaveTextContent("count=0");
  });
});
