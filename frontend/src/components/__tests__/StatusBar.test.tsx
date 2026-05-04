import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
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
  const original = await importOriginal<typeof import("../../store/servicesApi")>();
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
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(servicesApi.middleware),
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
    </Provider>
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
    expect(screen.queryByTitle(/Gateway disconnected/i)).not.toBeInTheDocument();
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
      })
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
      </Provider>
    );
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows '99+' when there are more than 99 alerts", () => {
    const store = makeStore(true);
    for (let i = 0; i < 105; i++) {
      store.dispatch(
        alertAdded({
          severity: "WARNING",
          source: "order",
          message: `Alert ${i}`,
          ts: Date.now() + i,
        })
      );
    }
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
      </Provider>
    );
    expect(screen.getByText("99+")).toBeInTheDocument();
  });
});

describe("StatusBar – theme switcher", () => {
  it("opens theme dropdown when Theme button clicked", () => {
    renderBar(true);
    const btn = screen.getByText("Theme");
    fireEvent.click(btn);
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("OLED")).toBeInTheDocument();
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("High Contrast")).toBeInTheDocument();
  });

  it("changes theme when an option is clicked", () => {
    const store = makeStore(true);
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
      </Provider>
    );
    fireEvent.click(screen.getByText("Theme"));
    fireEvent.click(screen.getByText("OLED"));
    expect(store.getState().theme.theme).toBe("darker");
  });

  it("closes theme dropdown when backdrop is clicked", () => {
    renderBar(true);
    fireEvent.click(screen.getByText("Theme"));
    fireEvent.click(screen.getByLabelText(/Close theme picker/i));
    expect(screen.queryByText("OLED")).not.toBeInTheDocument();
  });
});

describe("StatusBar – update banner", () => {
  it("renders update banner when ui.updateAvailable is set", () => {
    const store = makeStore(true);
    store.dispatch({ type: "ui/setUpdateAvailable", payload: true });
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
      </Provider>
    );
    expect(screen.getByTestId("update-banner")).toBeInTheDocument();
  });
});

describe("StatusBar – upgrade banner", () => {
  it("renders upgrade banner when upgrade in progress", () => {
    const store = makeStore(true);
    store.dispatch({
      type: "ui/setUpgradeStatus",
      payload: { inProgress: true, message: "Rolling out" },
    });
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
      </Provider>
    );
    expect(screen.getByTestId("upgrade-banner")).toBeInTheDocument();
    expect(screen.getByText("Rolling out")).toBeInTheDocument();
  });

  it("renders default upgrade message when no message is supplied", () => {
    const store = makeStore(true);
    store.dispatch({
      type: "ui/setUpgradeStatus",
      payload: { inProgress: true, message: null },
    });
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
      </Provider>
    );
    expect(screen.getByText(/System upgrade in progress/i)).toBeInTheDocument();
  });
});

describe("StatusBar – data freshness", () => {
  it("shows live indicator when feeds are fresh", () => {
    const store = makeStore(true);
    const now = Date.now();
    store.dispatch({
      type: "feed/feedReceived",
      payload: "market",
    });
    store.dispatch({
      type: "feed/feedReceived",
      payload: "orders",
    });
    void now;
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
      </Provider>
    );
    expect(screen.getByTestId("feed-status")).toBeInTheDocument();
  });
});

describe("StatusBar – authenticated user", () => {
  it("renders new-order button for trader role", () => {
    const store = makeStore(true);
    store.dispatch({
      type: "auth/setUser",
      payload: { id: "alice", name: "Alice", role: "trader", avatar_emoji: "👩" },
    });
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
      </Provider>
    );
    expect(screen.getByTestId("new-order-btn")).toBeInTheDocument();
  });

  it("renders user info and logout for admin", () => {
    const store = makeStore(true);
    store.dispatch({
      type: "auth/setUser",
      payload: { id: "root", name: "Root", role: "admin", avatar_emoji: "🛡️" },
    });
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
      </Provider>
    );
    expect(screen.getByTestId("user-menu-btn")).toBeInTheDocument();
    expect(screen.getByTestId("logout-btn")).toBeInTheDocument();
    expect(screen.queryByTestId("new-order-btn")).not.toBeInTheDocument();
  });
});
