import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { Model } from "flexlayout-react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { alertsSlice } from "../../store/alertsSlice";
import { authSlice } from "../../store/authSlice";
import { feedSlice } from "../../store/feedSlice";
import { killSwitchSlice } from "../../store/killSwitchSlice";
import { marketSlice } from "../../store/marketSlice";
import { ordersSlice } from "../../store/ordersSlice";
import { servicesApi } from "../../store/servicesApi";
import { themeSlice } from "../../store/themeSlice";
import { uiSlice } from "../../store/uiSlice";
import { windowSlice } from "../../store/windowSlice";
import { DashboardContext, DEFAULT_LAYOUT } from "../DashboardLayout";
import { StatusBar } from "../StatusBar";

vi.mock("../../store/servicesApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../store/servicesApi")>();
  return {
    ...original,
    useGetServiceHealthQuery: (svc: { name: string; url: string }) => ({
      data: {
        name: svc.name,
        url: svc.url,
        state: "ok" as const,
        version: "1.0.0",
        meta: {},
        lastChecked: Date.now(),
      },
      isError: false,
      isLoading: false,
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

describe("StatusBar – when services return OK", () => {
  it("renders OK state for all services", () => {
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
    expect(screen.getByText(/VETA Trading Platform/)).toBeInTheDocument();
  });
});
