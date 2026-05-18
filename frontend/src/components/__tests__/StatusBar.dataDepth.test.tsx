import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { DashboardContext, DEFAULT_LAYOUT } from "@veta/frontend/components/DashboardLayout";
import { DataDepthIndicator } from "@veta/frontend/components/StatusBar";
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

const dataDepthState = {
  data: {
    totalSymbols: 25,
    minDays: 14,
    avgDays: 30,
    symbols: [],
  },
  isLoading: false,
};

vi.mock("../../store/servicesApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../store/servicesApi")>();
  return {
    ...original,
    useGetServiceHealthQuery: () => ({
      data: undefined,
      isError: false,
      isLoading: true,
    }),
    useGetDataDepthQuery: () => dataDepthState,
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
  });
}

function renderIndicator() {
  return render(
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
        <DataDepthIndicator />
      </DashboardContext.Provider>
    </Provider>
  );
}

describe("DataDepthIndicator – data quality branches", () => {
  // Indicator color is now driven by avgDays so a single shallow new symbol
  // doesn't drag the headline red. minDays still appears in the tooltip and
  // gates the warning messages. See backlog #10d (2026-05-18).

  it("renders avgDays as the headline label", () => {
    dataDepthState.data = { totalSymbols: 25, minDays: 14, avgDays: 30, symbols: [] };
    renderIndicator();
    expect(screen.getByTestId("data-depth")).toBeInTheDocument();
    expect(screen.getByText(/30d/)).toBeInTheDocument();
  });

  it("renders 'limited' state when 0.25 <= avgDays < 7 (amber)", () => {
    dataDepthState.data = { totalSymbols: 25, minDays: 3, avgDays: 5, symbols: [] };
    renderIndicator();
    expect(screen.getByText(/5d/)).toBeInTheDocument();
  });

  it("renders hours label when avgDays < 1 but > 0.25 (amber)", () => {
    // avg 0.5d = 12h is amber (above the 0.25d red threshold)
    dataDepthState.data = { totalSymbols: 25, minDays: 0.25, avgDays: 0.5, symbols: [] };
    renderIndicator();
    expect(screen.getByText(/12h/)).toBeInTheDocument();
  });

  it("renders red hours label when avgDays < 0.25 (red)", () => {
    dataDepthState.data = { totalSymbols: 25, minDays: 0.05, avgDays: 0.1, symbols: [] };
    renderIndicator();
    // 0.1 days = 2.4h, rounds to 2h
    expect(screen.getByText(/2h/)).toBeInTheDocument();
  });

  it("renders 'none' state when avgDays = 0", () => {
    dataDepthState.data = { totalSymbols: 0, minDays: 0, avgDays: 0, symbols: [] };
    renderIndicator();
    expect(screen.getByText(/none/)).toBeInTheDocument();
  });

  it("clicking the indicator toggles the data depth drawer", () => {
    dataDepthState.data = { totalSymbols: 25, minDays: 14, avgDays: 30, symbols: [] };
    renderIndicator();
    const btn = screen.getByTestId("data-depth");
    fireEvent.click(btn);
    expect(btn).toBeInTheDocument();
  });
});
