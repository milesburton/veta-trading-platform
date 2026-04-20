import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { Model } from "flexlayout-react";
import { Provider } from "react-redux";
import { vi } from "vitest";
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
  const original =
    await importOriginal<typeof import("../../store/servicesApi")>();
  return {
    ...original,
    useGetServiceHealthQuery: () => ({
      data: undefined,
      isError: false,
      isLoading: true,
    }),
    useGetDataDepthQuery: () => ({
      data: undefined,
      isLoading: true,
    }),
  };
});

function makeStore(connected: boolean) {
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
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(servicesApi.middleware),
    preloadedState: {
      market: {
        assets: [],
        prices: {},
        priceHistory: {},
        sessionOpen: {},
        candleHistory: {},
        candlesReady: {},
        connected,
        orderBook: {},
        sessionPhase: "CONTINUOUS" as const,
      },
    },
  });
}

function renderBar(connected: boolean) {
  return render(
    <Provider store={makeStore(connected)}>
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
    </Provider>,
  );
}

test("shows brand name and time", () => {
  renderBar(true);
  expect(screen.getByText(/VETA Trading Platform/)).toBeInTheDocument();
  expect(screen.getByText(/\d{1,2}:\d{2}:\d{2}/)).toBeInTheDocument();
});

import { describe, expect, it } from "vitest";
import { alertAdded } from "../../store/alertsSlice";

describe("StatusBar – connected state", () => {
  it("does not show disconnected banner when connected", () => {
    renderBar(true);
    expect(
      screen.queryByTitle(/Gateway disconnected/i),
    ).not.toBeInTheDocument();
  });
});

describe("StatusBar – disconnected state", () => {
  it("shows disconnected status when feed is offline", () => {
    renderBar(false);
    expect(screen.getByTestId("feed-status")).toBeInTheDocument();
  });

  it("shows disconnected label text", () => {
    renderBar(false);
    expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
  });
});

describe("StatusBar – alert badge", () => {
  it("shows alert count when there are alerts", () => {
    const store = makeStore(true);
    store.dispatch(
      alertAdded({
        severity: "WARNING",
        source: "order",
        message: "Test alert",
        ts: Date.now(),
      }),
    );
    render(
      <Provider store={store}>
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
      </Provider>,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
