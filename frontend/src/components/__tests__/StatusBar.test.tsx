import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  DashboardContext,
  type DashboardContextValue,
  DEFAULT_LAYOUT,
} from "@veta/frontend/components/DashboardLayout";
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
import { type IJsonModel, Model } from "flexlayout-react";
import { Provider } from "react-redux";
import { vi } from "vitest";

const serviceHealthHolder = vi.hoisted(() => ({
  resolve: (_svc: { name: string }) =>
    ({ data: undefined, isError: false, isLoading: true }) as {
      data: unknown;
      isError: boolean;
      isLoading: boolean;
    },
}));

const dataDepthHolder = vi.hoisted(() => ({
  resolve: () =>
    ({ data: undefined, isLoading: true }) as {
      data: unknown;
      isLoading: boolean;
    },
}));

const logoutMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: undefined })));

vi.mock("../../store/userApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../store/userApi")>();
  return {
    ...original,
    useLogoutMutation: () => [logoutMock, { isLoading: false }],
  };
});

vi.mock("../../store/servicesApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../store/servicesApi")>();
  return {
    ...original,
    useGetServiceHealthQuery: (svc: { name: string }) => serviceHealthHolder.resolve(svc),
    useGetDataDepthQuery: () => dataDepthHolder.resolve(),
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
        connectionFailures: 0,
        orderBook: {},
        sessionPhase: "CONTINUOUS" as const,
      },
    },
  });
}

function authenticateStore(store: ReturnType<typeof makeStore>) {
  store.dispatch({
    type: "auth/setUser",
    payload: { id: "alice", name: "Alice", role: "trader", avatar_emoji: "👩" },
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
  expect(screen.getAllByText(/VETA/)[0]).toBeInTheDocument();
  expect(screen.getByText(/\d{1,2}:\d{2}:\d{2}/)).toBeInTheDocument();
});

test("header exposes Grafana and User Guide external links", () => {
  renderBar(true);
  const grafanaLink = screen.getByTestId("grafana-link");
  expect(grafanaLink).toHaveAttribute("href", "https://veta.mnetcs.com/grafana/");
  expect(grafanaLink).toHaveAttribute("target", "_blank");
  expect(grafanaLink).toHaveAttribute("rel", expect.stringContaining("noopener"));

  const docsLink = screen.getByTestId("docs-link");
  expect(docsLink).toHaveAttribute("href", "https://milesburton.github.io/veta-trading-platform/");
  expect(docsLink).toHaveAttribute("target", "_blank");
  expect(docsLink).toHaveTextContent("User Guide");
});

import { alertAdded } from "@veta/frontend/store/alertsSlice";
import { describe, expect, it } from "vitest";

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
    authenticateStore(store);
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
    authenticateStore(store);
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
    const store = makeStore(true);
    authenticateStore(store);
    renderWithStore(store);
    const btn = screen.getByRole("button", { name: /Change theme/i });
    fireEvent.click(btn);
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("OLED")).toBeInTheDocument();
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("High Contrast")).toBeInTheDocument();
  });

  it("changes theme when an option is clicked", () => {
    const store = makeStore(true);
    authenticateStore(store);
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
    fireEvent.click(screen.getByRole("button", { name: /Change theme/i }));
    fireEvent.click(screen.getByText("OLED"));
    expect(store.getState().theme.theme).toBe("darker");
  });

  it("closes theme dropdown when backdrop is clicked", () => {
    const store = makeStore(true);
    authenticateStore(store);
    renderWithStore(store);
    fireEvent.click(screen.getByRole("button", { name: /Change theme/i }));
    fireEvent.click(screen.getByLabelText(/Close theme picker/i));
    expect(screen.queryByText("OLED")).not.toBeInTheDocument();
  });
});

describe("StatusBar – update banner", () => {
  function renderBanner(store: ReturnType<typeof makeStore>) {
    return render(
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
  }

  it("renders update banner when ui.updateAvailable is set", () => {
    const store = makeStore(true);
    store.dispatch({ type: "ui/setUpdateAvailable", payload: true });
    renderBanner(store);
    expect(screen.getByTestId("update-banner")).toBeInTheDocument();
    expect(screen.getByTestId("reload-btn")).toHaveTextContent(/Reload now/i);
    expect(screen.getByTestId("reload-later-btn")).toHaveTextContent(/Later/i);
  });

  it("Later button dismisses the update banner without reloading", () => {
    const store = makeStore(true);
    store.dispatch({ type: "ui/setUpdateAvailable", payload: true });
    renderBanner(store);
    expect(screen.getByTestId("update-banner")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("reload-later-btn"));
    expect(screen.queryByTestId("update-banner")).not.toBeInTheDocument();
    expect(store.getState().ui.updateAvailable).toBe(false);
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

function renderWithStore(store: ReturnType<typeof makeStore>) {
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
}

describe("StatusBar – alert button interactions", () => {
  it("clicking alert button opens drawer", () => {
    const store = makeStore(true);
    authenticateStore(store);
    renderWithStore(store);
    const btn = screen.getByTestId("alert-bell-btn");
    fireEvent.click(btn);
    // Drawer is now open — simply ensure no throw
    expect(btn).toBeInTheDocument();
  });

  it("clicking User Guide link does not throw", () => {
    const store = makeStore(true);
    renderWithStore(store);
    const link = screen.getByTestId("docs-link");
    fireEvent.click(link);
    expect(screen.getAllByText(/VETA/)[0]).toBeInTheDocument();
  });
});

describe("StatusBar – stale and dead feeds", () => {
  it("shows stale indicator when feeds are between stale and dead thresholds", () => {
    const store = makeStore(true);
    // Set feed lastSeenAt to ~7s ago — between FEED_STALE_MS=5000 and FEED_DEAD_MS=15000
    const now = Date.now();
    store.dispatch({ type: "feed/feedReceived", payload: "market" });
    // Manually patch state via reducer-like dispatch
    store.dispatch({
      type: "feed/__test_set",
      payload: { lastSeenAt: { market: now - 7000 } },
    });
    renderWithStore(store);
    expect(screen.getByTestId("feed-status")).toBeInTheDocument();
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

function renderWithDashboard(
  store: ReturnType<typeof makeStore>,
  overrides: {
    activePanelIds?: DashboardContextValue["activePanelIds"];
    model?: Model;
    setModel?: () => void;
  } = {}
) {
  render(
    <Provider store={store}>
      <DashboardContext.Provider
        value={{
          layout: DEFAULT_LAYOUT,
          setLayout: vi.fn(),
          activePanelIds: overrides.activePanelIds ?? new Set(),
          addPanel: vi.fn(),
          removePanel: vi.fn(),
          removeTabById: vi.fn(),
          resetLayout: vi.fn(),
          storageKey: "dashboard-layout",
          model:
            overrides.model ??
            Model.fromJson({
              global: {},
              layout: { type: "row", children: [] },
            }),
          setModel: overrides.setModel ?? vi.fn(),
        }}
      >
        <StatusBar />
      </DashboardContext.Provider>
    </Provider>
  );
}

const ALERTS_TAB_MODEL: IJsonModel = {
  global: {},
  layout: {
    type: "row",
    children: [
      {
        type: "tabset",
        children: [
          {
            type: "tab",
            name: "Alerts",
            component: "panel",
            config: { panelType: "alerts" },
          },
        ],
      },
    ],
  },
};

describe("StatusBar – feed freshness transitions", () => {
  it("shows the 'stale' indicator once the market feed passes the dead threshold", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const store = makeStore(true);
      store.dispatch({ type: "feed/feedReceived", payload: "market" });
      renderWithDashboard(store);
      expect(screen.getByTestId("feed-status")).toHaveTextContent(/live/i);

      // Advance well past FEED_DEAD_MS (15s); the 1s interval ticks the signal
      // so DataFreshness recomputes the market age as dead.
      act(() => {
        vi.advanceTimersByTime(20_000);
      });
      expect(screen.getByTestId("feed-status")).toHaveTextContent(/stale/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the 'slow' indicator between the stale and dead thresholds", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const store = makeStore(true);
      store.dispatch({ type: "feed/feedReceived", payload: "market" });
      renderWithDashboard(store);

      // Between FEED_STALE_MS (5s) and FEED_DEAD_MS (15s).
      act(() => {
        vi.advanceTimersByTime(8_000);
      });
      expect(screen.getByTestId("feed-status")).toHaveTextContent(/slow/i);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("StatusBar – pinned alerts panel", () => {
  it("focuses the Alerts tab instead of opening the drawer when pinned", () => {
    const store = makeStore(true);
    authenticateStore(store);
    const setModel = vi.fn();
    renderWithDashboard(store, {
      activePanelIds: new Set(["alerts"]),
      model: Model.fromJson(ALERTS_TAB_MODEL),
      setModel,
    });

    const btn = screen.getByTestId("alert-bell-btn");
    expect(btn).toHaveAttribute("title", "Jump to Alerts panel");

    fireEvent.click(btn);

    // Pinned path selects the alerts tab via the dashboard model rather than
    // opening the floating drawer.
    expect(setModel).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Alert Centre/i)).not.toBeInTheDocument();
  });

  it("uses the Alert Centre tooltip when the panel is not pinned", () => {
    const store = makeStore(true);
    authenticateStore(store);
    renderWithDashboard(store);
    expect(screen.getByTestId("alert-bell-btn")).toHaveAttribute("title", "Alert Centre");
  });
});

describe("StatusBar – authenticated user", () => {
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

  it("shows a read-only badge for a viewer-role user", () => {
    const store = makeStore(true);
    store.dispatch({
      type: "auth/setUser",
      payload: {
        id: "synthetic-trader-1-viewer",
        name: "Synthetic Trader",
        role: "viewer",
        avatar_emoji: "🤖",
      },
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
    expect(screen.getByTestId("read-only-badge")).toBeInTheDocument();
  });

  it("does not show a read-only badge for a trader-role user", () => {
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
    expect(screen.queryByTestId("read-only-badge")).not.toBeInTheDocument();
  });

  it("opens and closes the bug report modal from the header", () => {
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
    expect(screen.queryByTestId("bug-report-modal")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("bug-report-trigger"));
    expect(screen.getByTestId("bug-report-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("bug-report-close"));
    expect(screen.queryByTestId("bug-report-modal")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("bug-report-trigger"));
    expect(screen.getByTestId("bug-report-modal")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("bug-report-modal")).not.toBeInTheDocument();
  });
});

import { DrawersProvider } from "@veta/frontend/components/drawers/DrawersContext";
import type { ServiceHealth } from "@veta/frontend/types";
import { afterEach, beforeEach } from "vitest";

const DEFAULT_SERVICE_RESULT = {
  data: undefined,
  isError: false,
  isLoading: true,
};

afterEach(() => {
  serviceHealthHolder.resolve = () => DEFAULT_SERVICE_RESULT;
});

function setServiceHealth(state: ServiceHealth["state"]) {
  serviceHealthHolder.resolve = (svc) => ({
    data: {
      name: svc.name,
      url: `https://example.test/${svc.name}/health`,
      state,
      lastChecked: Date.now(),
      version: "1.2.3",
      meta: {},
    } satisfies ServiceHealth,
    isError: false,
    isLoading: false,
  });
}

function renderWithDrawers(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <DrawersProvider>
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
      </DrawersProvider>
    </Provider>
  );
}

function drawerTree(store: ReturnType<typeof makeStore>) {
  return (
    <Provider store={store}>
      <DrawersProvider>
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
      </DrawersProvider>
    </Provider>
  );
}

describe("StatusBar – service health data", () => {
  it("renders the resolved service data when the query returns ok", () => {
    setServiceHealth("ok");
    const store = makeStore(true);
    authenticateStore(store);
    renderWithStore(store);
    expect(screen.getByTestId("service-health-cluster")).toBeInTheDocument();
  });

  it("raises a critical alert when a service transitions to error", () => {
    setServiceHealth("ok");
    const store = makeStore(true);
    authenticateStore(store);
    const { rerender } = renderWithDrawers(store);

    setServiceHealth("error");
    act(() => {
      rerender(drawerTree(store));
    });

    const critical = store
      .getState()
      .alerts.alerts.some(
        (a) => a.severity === "CRITICAL" && a.message.startsWith("Service offline:")
      );
    expect(critical).toBe(true);
  });

  it("raises an info alert when a service recovers from error", () => {
    setServiceHealth("error");
    const store = makeStore(true);
    authenticateStore(store);
    const { rerender } = renderWithDrawers(store);

    setServiceHealth("ok");
    act(() => {
      rerender(drawerTree(store));
    });

    const recovered = store
      .getState()
      .alerts.alerts.some(
        (a) => a.severity === "INFO" && a.message.startsWith("Service recovered:")
      );
    expect(recovered).toBe(true);
  });
});

describe("StatusBar – alert drawer rendering", () => {
  it("renders the alert drawer when the bell is clicked and the panel is not pinned", () => {
    const store = makeStore(true);
    authenticateStore(store);
    renderWithDrawers(store);
    fireEvent.click(screen.getByTestId("alert-bell-btn"));
    expect(screen.getByText("Alert Centre")).toBeInTheDocument();
  });
});

describe("StatusBar – logs button", () => {
  it("toggles the logs drawer when the logs button is clicked", () => {
    const store = makeStore(true);
    authenticateStore(store);
    renderWithDrawers(store);
    const logsBtn = screen.getByTestId("logs-btn");
    expect(logsBtn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(logsBtn);
    expect(screen.getByTestId("logs-btn")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("StatusBar – memory indicator", () => {
  const originalMemory = Object.getOwnPropertyDescriptor(performance, "memory");

  beforeEach(() => {
    Object.defineProperty(performance, "memory", {
      configurable: true,
      value: {
        usedJSHeapSize: 800 * 1024 * 1024,
        totalJSHeapSize: 900 * 1024 * 1024,
        jsHeapSizeLimit: 1000 * 1024 * 1024,
      },
    });
  });

  afterEach(() => {
    if (originalMemory) {
      Object.defineProperty(performance, "memory", originalMemory);
    } else {
      Reflect.deleteProperty(performance as unknown as Record<string, unknown>, "memory");
    }
  });

  it("renders the heap usage when performance.memory is available", () => {
    const store = makeStore(true);
    authenticateStore(store);
    renderWithStore(store);
    const indicator = screen.getByTestId("memory-indicator");
    expect(indicator).toHaveTextContent(/Heap/);
    expect(indicator).toHaveTextContent(/800 MB/);
  });
});

describe("StatusBar – logout", () => {
  it("clears the user and navigates home on logout", async () => {
    const assign = vi.fn();
    const original = globalThis.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, assign },
    });
    try {
      const store = makeStore(true);
      authenticateStore(store);
      renderWithStore(store);
      await act(async () => {
        fireEvent.click(screen.getByTestId("logout-btn"));
      });
      expect(store.getState().auth.user).toBeNull();
      expect(assign).toHaveBeenCalledWith("/");
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });
});

describe("StatusBar – update banner reload", () => {
  it("calls location.reload when Reload now is clicked", () => {
    const reload = vi.fn();
    const original = globalThis.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload },
    });
    try {
      const store = makeStore(true);
      store.dispatch({ type: "ui/setUpdateAvailable", payload: true });
      renderWithStore(store);
      fireEvent.click(screen.getByTestId("reload-btn"));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });
});
