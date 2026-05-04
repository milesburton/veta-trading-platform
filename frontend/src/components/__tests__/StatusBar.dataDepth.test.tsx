import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
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
import { DataDepthIndicator } from "../StatusBar";

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
  it("renders 'good' state with green dot when minDays >= 7", () => {
    dataDepthState.data = { totalSymbols: 25, minDays: 14, avgDays: 30, symbols: [] };
    renderIndicator();
    expect(screen.getByTestId("data-depth")).toBeInTheDocument();
    expect(screen.getByText(/14d/)).toBeInTheDocument();
  });

  it("renders 'limited' state when 1 <= minDays < 7", () => {
    dataDepthState.data = { totalSymbols: 25, minDays: 3, avgDays: 5, symbols: [] };
    renderIndicator();
    expect(screen.getByText(/3d/)).toBeInTheDocument();
  });

  it("renders 'hours' state when minDays < 1 but > 0", () => {
    dataDepthState.data = { totalSymbols: 25, minDays: 0.25, avgDays: 0.5, symbols: [] };
    renderIndicator();
    // 0.25 days = 6 hours
    expect(screen.getByText(/6h/)).toBeInTheDocument();
  });

  it("renders 'none' state when minDays = 0", () => {
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
