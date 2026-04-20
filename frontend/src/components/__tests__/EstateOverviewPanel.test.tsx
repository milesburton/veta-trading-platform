import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Alert } from "../../store/alertsSlice";
import { alertsSlice } from "../../store/alertsSlice";
import { observabilitySlice } from "../../store/observabilitySlice";
import { ordersSlice } from "../../store/ordersSlice";
import { EstateOverviewPanel } from "../EstateOverviewPanel";

const byService: Record<string, { ok: boolean; version: string }> = {
  OMS: { ok: true, version: "1.0.0" },
  Gateway: { ok: false, version: "-" },
};

vi.mock("recharts", () => {
  const Mock = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Mock,
    LineChart: Mock,
    Tooltip: () => null,
    XAxis: () => null,
    Line: () => null,
  };
});

vi.mock("../../store/servicesApi.ts", () => ({
  SERVICES: [
    { name: "OMS", url: "http://oms/health", category: "core" },
    { name: "Gateway", url: "http://gw/health", category: "core" },
  ],
  useGetServiceHealthQuery: (svc: { name: string; url: string }) => {
    const row = byService[svc.name];
    if (!row || !row.ok) return { data: undefined, isError: true };
    return {
      data: {
        name: svc.name,
        url: svc.url,
        state: "ok",
        version: row.version,
        meta: {},
        lastChecked: 1,
      },
      isError: false,
    };
  },
}));

function renderPanel(preloadedAlerts: Alert[] = []) {
  const store = configureStore({
    reducer: {
      orders: ordersSlice.reducer,
      observability: observabilitySlice.reducer,
      alerts: alertsSlice.reducer,
    },
    preloadedState: {
      orders: { orders: [], lastSubmittedOrderId: null },
      observability: { events: [] },
      alerts: { alerts: preloadedAlerts, muteRules: [] },
    },
  });

  render(
    <Provider store={store}>
      <EstateOverviewPanel />
    </Provider>
  );

  return store;
}

describe("EstateOverviewPanel", () => {
  beforeEach(() => {
    byService.OMS = { ok: true, version: "1.0.0" };
    byService.Gateway = { ok: false, version: "-" };
  });

  it("renders service rows, empty timeline, and service alert feed", () => {
    renderPanel();

    expect(screen.getByText(/Estate Overview/i)).toBeInTheDocument();
    expect(screen.getByText("OMS")).toBeInTheDocument();
    expect(screen.getByText("Gateway")).toBeInTheDocument();
    expect(screen.getByText(/Event Timeline/i)).toBeInTheDocument();
    expect(screen.getByText(/No events yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Gateway: service down/i)).toBeInTheDocument();
  });

  it("dismisses visible alerts from the feed", () => {
    const now = Date.now();
    renderPanel([
      {
        id: "a-1",
        severity: "WARNING",
        source: "order",
        message: "Order flood detected",
        ts: now,
        dismissed: false,
      },
    ]);

    expect(screen.getByText(/Order flood detected/i)).toBeInTheDocument();
    const row = screen.getByText(/Order flood detected/i).closest("div");
    if (!row) throw new Error("expected alert row");
    fireEvent.click(within(row).getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText(/Order flood detected/i)).not.toBeInTheDocument();
  });
});
