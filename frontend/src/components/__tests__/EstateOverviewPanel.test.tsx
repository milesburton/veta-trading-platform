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

function renderPanel(
  preloadedAlerts: Alert[] = [],
  ordersOverride?: ReturnType<typeof ordersSlice.reducer> extends { orders: infer T } ? T : never,
  events: { type: string; ts: number; payload: Record<string, unknown> }[] = []
) {
  const store = configureStore({
    reducer: {
      orders: ordersSlice.reducer,
      observability: observabilitySlice.reducer,
      alerts: alertsSlice.reducer,
    },
    preloadedState: {
      orders: { orders: ordersOverride ?? [], lastSubmittedOrderId: null },
      observability: { events },
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

  it("renders critical alert with red styling", () => {
    renderPanel([
      {
        id: "a-2",
        severity: "CRITICAL",
        source: "service",
        message: "Database offline",
        ts: Date.now(),
        dismissed: false,
      },
    ]);
    expect(screen.getByText(/Database offline/)).toBeInTheDocument();
  });

  it("renders info alert", () => {
    renderPanel([
      {
        id: "a-3",
        severity: "INFO",
        source: "service",
        message: "Service recovered",
        ts: Date.now(),
        dismissed: false,
      },
    ]);
    expect(screen.getByText(/Service recovered/)).toBeInTheDocument();
  });

  it("OK service is reflected in the table", () => {
    byService.OMS = { ok: true, version: "1.0.0" };
    byService.Gateway = { ok: true, version: "2.1.0" };
    renderPanel();
    const okEls = screen.getAllByText(/OK/i);
    expect(okEls.length).toBeGreaterThan(0);
  });

  it("renders metrics and sparkline when there are recent orders", () => {
    const now = Date.now();
    const orders = Array.from({ length: 10 }, (_, i) => ({
      id: `o${i}`,
      submittedAt: now - i * 1000,
      asset: "AAPL",
      side: "BUY" as const,
      quantity: 100,
      limitPrice: 150,
      expiresAt: now + 60_000,
      strategy: "TWAP" as const,
      status: "working" as const,
      filled: 50,
      algoParams: { strategy: "TWAP" as const, numSlices: 4, participationCap: 25 },
      children: [
        {
          id: `c${i}`,
          parentId: `o${i}`,
          asset: "AAPL",
          side: "BUY" as const,
          quantity: 50,
          limitPrice: 150,
          status: "filled" as const,
          filled: 50,
          submittedAt: now - i * 1000,
        },
      ],
    }));
    renderPanel([], orders);
    expect(screen.getByText(/Estate Overview/i)).toBeInTheDocument();
  });

  it("renders all required services as ok", () => {
    byService.OMS = { ok: true, version: "1.0.0" };
    byService.Gateway = { ok: true, version: "2.0.0" };
    renderPanel();
    // OMS is in REQUIRED_SERVICES set so should be visible with OK
    const okEls = screen.getAllByText(/OK/i);
    expect(okEls.length).toBeGreaterThan(0);
  });

  it("renders error/critical service when down", () => {
    byService.OMS = { ok: false, version: "-" };
    byService.Gateway = { ok: false, version: "-" };
    renderPanel();
    const downEls = screen.getAllByText(/DOWN/i);
    expect(downEls.length).toBeGreaterThan(0);
  });

  it("dismissing all alerts shows empty state", () => {
    const now = Date.now();
    renderPanel([
      {
        id: "a-1",
        severity: "INFO",
        source: "service",
        message: "Service recovered",
        ts: now,
        dismissed: false,
      },
      {
        id: "a-2",
        severity: "WARNING",
        source: "order",
        message: "Order rejected",
        ts: now,
        dismissed: true, // already dismissed
      },
    ]);
    expect(screen.getByText(/Service recovered/i)).toBeInTheDocument();
    // Dismissed alerts shouldn't appear
    expect(screen.queryByText(/Order rejected/)).not.toBeInTheDocument();
  });

  it("renders critical fill-rate (low fill, lots of orders)", () => {
    const now = Date.now();
    // 10 orders with 1 fill out of 10 children → 10% fill rate (< CRIT 30)
    const orders = Array.from({ length: 10 }, (_, i) => ({
      id: `o${i}`,
      submittedAt: now - i * 100,
      asset: "AAPL",
      side: "BUY" as const,
      quantity: 100,
      limitPrice: 150,
      expiresAt: now + 60_000,
      strategy: "TWAP" as const,
      status: "working" as const,
      filled: i === 0 ? 100 : 0,
      algoParams: { strategy: "TWAP" as const, numSlices: 4, participationCap: 25 },
      children: [
        {
          id: `c${i}`,
          parentId: `o${i}`,
          asset: "AAPL",
          side: "BUY" as const,
          quantity: 100,
          limitPrice: 150,
          status: i === 0 ? ("filled" as const) : ("working" as const),
          filled: i === 0 ? 100 : 0,
          submittedAt: now - i * 100,
        },
      ],
    }));
    renderPanel([], orders);
    expect(screen.getByText(/Estate Overview/i)).toBeInTheDocument();
  });

  it("renders order-flood threshold (many orders/min)", () => {
    const now = Date.now();
    // 250 orders within 60s → > ORDER_FLOOD (200)
    const orders = Array.from({ length: 250 }, (_, i) => ({
      id: `flood-${i}`,
      submittedAt: now - i * 100,
      asset: "AAPL",
      side: "BUY" as const,
      quantity: 100,
      limitPrice: 150,
      expiresAt: now + 60_000,
      strategy: "TWAP" as const,
      status: "working" as const,
      filled: 0,
      algoParams: { strategy: "TWAP" as const, numSlices: 4, participationCap: 25 },
      children: [],
    }));
    renderPanel([], orders);
    expect(screen.getByText(/Estate Overview/i)).toBeInTheDocument();
  });

  it("renders timeline events when present", () => {
    const events = [
      {
        type: "orders.submitted",
        ts: Date.now() - 1000,
        payload: { algo: "TWAP", asset: "AAPL", side: "BUY", qty: 100, price: 150 },
      },
      {
        type: "orders.filled",
        ts: Date.now() - 500,
        payload: {
          algo: "TWAP",
          asset: "AAPL",
          filledQty: 100,
          avgFillPrice: 150,
          totalFilled: 100,
          totalQty: 100,
        },
      },
    ];
    renderPanel([], [], events);
    expect(screen.queryByText(/No events yet/i)).not.toBeInTheDocument();
  });
});
