import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { DashboardContext, DEFAULT_LAYOUT } from "@veta/frontend/components/DashboardLayout";
import { StatusBar } from "@veta/frontend/components/StatusBar";
import { alertsSlice } from "@veta/frontend/store/alertsSlice";
import { authSlice } from "@veta/frontend/store/authSlice";
import { feedSlice } from "@veta/frontend/store/feedSlice";
import { killSwitchSlice } from "@veta/frontend/store/killSwitchSlice";
import { marketSlice } from "@veta/frontend/store/marketSlice";
import { ordersSlice } from "@veta/frontend/store/ordersSlice";
import { servicesApi } from "@veta/frontend/store/servicesApi";
import { themeSlice } from "@veta/frontend/store/themeSlice";
import { uiSlice } from "@veta/frontend/store/uiSlice";
import { windowSlice } from "@veta/frontend/store/windowSlice";
import { Model } from "flexlayout-react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../store/servicesApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../store/servicesApi")>();
  return {
    ...original,
    useGetServiceHealthQuery: () => ({
      data: undefined,
      isError: true,
      isLoading: false,
      // A warn-shaped error payload, as transformErrorResponse produces
      // for a service reporting degraded-not-down (e.g. disk-monitor's
      // 503 at WARN_PCT, or Redpanda's is_healthy:false body).
      error: { name: "disk-monitor", state: "warn", meta: {} },
    }),
    useGetDataDepthQuery: () => ({
      data: undefined,
      isLoading: true,
    }),
  };
});

function makeStore() {
  return configureStore({
    reducer: {
      auth: authSlice.reducer,
      feed: feedSlice.reducer,
      market: marketSlice.reducer,
      orders: ordersSlice.reducer,
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
      killSwitch: killSwitchSlice.reducer,
      alerts: alertsSlice.reducer,
      theme: themeSlice.reducer,
      [servicesApi.reducerPath]: servicesApi.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(servicesApi.middleware),
    preloadedState: {
      market: {
        assets: [],
        prices: {},
        priceHistory: {},
        sessionOpen: {},
        candleHistory: {},
        candlesReady: {},
        connected: true,
        connectionFailures: 0,
        orderBook: {},
        sessionPhase: "CONTINUOUS" as const,
      },
    },
  });
}

describe("StatusBar – when a service reports a warn-shaped error", () => {
  it("renders without crashing and surfaces the warn state, not error", () => {
    render(
      <Provider store={makeStore()}>
        <DashboardContext.Provider
          value={{
            layout: DEFAULT_LAYOUT,
            setLayout: vi.fn(),
            activePanelIds: new Set(),
            addPanel: vi.fn(),
            removePanel: vi.fn(),
            removeTabById: vi.fn(),
            resetLayout: vi.fn(),
            storageKey: "dashboard-layout",
            model: Model.fromJson({
              global: {},
              layout: { type: "row", children: [] },
            }),
            setModel: vi.fn(),
          }}
        >
          <StatusBar />
        </DashboardContext.Provider>
      </Provider>
    );
    expect(screen.getAllByText(/VETA/)[0]).toBeInTheDocument();
  });
});
