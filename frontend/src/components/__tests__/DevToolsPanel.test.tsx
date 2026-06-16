import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DevToolsPanel } from "@veta/frontend/components/DevToolsPanel";
import type { MuteRule } from "@veta/frontend/store/alertsSlice";
import { alertsSlice } from "@veta/frontend/store/alertsSlice";
import { authSlice } from "@veta/frontend/store/authSlice";
import { marketSlice } from "@veta/frontend/store/marketSlice";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runDemoDay = vi.fn();
const runLoadTest = vi.fn();

vi.mock("../../store/gatewayApi.ts", () => ({
  useRunDemoDayMutation: () => [runDemoDay, { isLoading: false }],
  useRunLoadTestMutation: () => [runLoadTest, { isLoading: false }],
}));

function renderPanel(muteRules: MuteRule[] = []) {
  const store = configureStore({
    reducer: {
      alerts: alertsSlice.reducer,
      auth: authSlice.reducer,
      market: marketSlice.reducer,
    },
    preloadedState: {
      alerts: {
        alerts: [],
        muteRules,
      },
      auth: {
        user: {
          id: "alice",
          name: "Alice",
          role: "admin" as const,
          avatar_emoji: "🧪",
        },
        limits: {
          max_order_qty: 10000,
          max_daily_notional: 1000000,
          allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
          allowed_desks: ["equity"],
          dark_pool_access: false,
        },
        status: "authenticated" as const,
        sessionExpired: false,
      },
      market: {
        assets: [],
        prices: {},
        sessionOpen: {},
        priceHistory: {},
        candleHistory: {},
        candlesReady: {},
        orderBook: {},
        connected: true,
        connectionFailures: 0,
        sessionPhase: "CONTINUOUS" as const,
      },
    },
  });

  render(
    <Provider store={store}>
      <DevToolsPanel />
    </Provider>
  );

  return store;
}

describe("DevToolsPanel", () => {
  beforeEach(() => {
    runDemoDay.mockReset();
    runLoadTest.mockReset();
  });

  it("shows connection state and current user", () => {
    renderPanel();

    expect(screen.getByText(/WebSocket/i)).toBeInTheDocument();
    expect(screen.getByText(/Connected/i)).toBeInTheDocument();
    expect(screen.getByText(/Alice \(admin\)/i)).toBeInTheDocument();
  });

  it("fires a custom alert into the alerts store", () => {
    const store = renderPanel();

    fireEvent.change(screen.getByPlaceholderText(/Alert message/i), {
      target: { value: "Latency spike detected" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Fire Alert/i }));

    expect(store.getState().alerts.alerts.length).toBe(1);
    expect(store.getState().alerts.alerts[0].message).toMatch(/Latency spike detected/i);
  });

  it("runs quick trade injection and load test actions", async () => {
    runDemoDay.mockResolvedValue({
      data: { submitted: 50, scenario: "standard", elapsedMs: 500 },
    });
    runLoadTest.mockResolvedValue({
      data: {
        submitted: 33,
        strategy: "TWAP",
        symbols: ["AAPL"],
        elapsedMs: 400,
      },
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Standard Day/i }));
    await waitFor(() => {
      expect(runDemoDay).toHaveBeenCalledWith({ scenario: "standard" });
    });
    expect(await screen.findByText(/Injected 50 orders/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Orders/i), {
      target: { value: "33" },
    });
    fireEvent.change(screen.getByLabelText(/Strategy/i), {
      target: { value: "TWAP" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Run$/i }));

    await waitFor(() => {
      expect(runLoadTest).toHaveBeenCalledWith({
        orderCount: 33,
        strategy: "TWAP",
        symbols: ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA"],
      });
    });
    expect(await screen.findByText(/Load test: 33 TWAP orders submitted/i)).toBeInTheDocument();
  });

  it("fires a preset alert into the alerts store", () => {
    const store = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Kill Switch Activated/i }));

    expect(store.getState().alerts.alerts.length).toBe(1);
    expect(store.getState().alerts.alerts[0].source).toBe("kill-switch");
    expect(store.getState().alerts.alerts[0].severity).toBe("CRITICAL");
  });

  it("changes custom alert severity, source, and detail before firing", () => {
    const store = renderPanel();

    fireEvent.change(screen.getByDisplayValue("WARNING"), {
      target: { value: "CRITICAL" },
    });
    fireEvent.change(screen.getByDisplayValue("service"), {
      target: { value: "algo" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Detail \(optional\)/i), {
      target: { value: "Extra context" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Fire Alert/i }));

    const fired = store.getState().alerts.alerts[0];
    expect(fired.severity).toBe("CRITICAL");
    expect(fired.source).toBe("algo");
    expect(fired.detail).toBe("Extra context");
  });

  it("renders mute rules, removes one, and clears all", () => {
    const store = renderPanel([
      {
        id: "rule-1",
        severity: "WARNING",
        source: "algo",
        messageContains: "heartbeat",
        createdAt: Date.now(),
      },
      {
        id: "rule-2",
        severity: "INFO",
        createdAt: Date.now(),
      },
    ]);

    expect(screen.getByText(/Mute Rules \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/WARNING \+ algo \+ "heartbeat"/i)).toBeInTheDocument();

    const removeButtons = screen.getAllByRole("button", { name: "×" });
    fireEvent.click(removeButtons[0]);
    expect(store.getState().alerts.muteRules.map((r) => r.id)).toEqual(["rule-2"]);

    fireEvent.click(screen.getByRole("button", { name: /Clear all rules/i }));
    expect(store.getState().alerts.muteRules.length).toBe(0);
  });

  it("labels a mute rule with no fields as all", () => {
    renderPanel([
      {
        id: "rule-empty",
        createdAt: Date.now(),
      },
    ]);

    expect(screen.getByText("all")).toBeInTheDocument();
  });

  it("renders a mute rule with only a severity field", () => {
    renderPanel([
      {
        id: "rule-sev-only",
        severity: "CRITICAL",
        createdAt: Date.now(),
      },
    ]);

    const removeButtons = screen.getAllByRole("button", { name: "×" });
    expect(removeButtons).toHaveLength(1);
    expect(removeButtons[0].previousSibling?.textContent).toBe("CRITICAL");
  });

  it("renders a mute rule with only a source field", () => {
    renderPanel([
      {
        id: "rule-src-only",
        source: "order",
        createdAt: Date.now(),
      },
    ]);

    const removeButtons = screen.getAllByRole("button", { name: "×" });
    expect(removeButtons).toHaveLength(1);
    expect(removeButtons[0].previousSibling?.textContent).toBe("order");
  });

  it("fires a custom alert without a detail value", () => {
    const store = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Fire Alert/i }));

    expect(store.getState().alerts.alerts.length).toBe(1);
    expect(store.getState().alerts.alerts[0].detail).toBeUndefined();
  });

  it("reports failures when quick trade and load test return errors", async () => {
    runDemoDay.mockResolvedValue({ error: { status: 500 } });
    runLoadTest.mockResolvedValue({ error: { status: 500 } });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Standard Day/i }));
    expect(await screen.findByText(/Failed — check gateway connection/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Run$/i }));
    expect(await screen.findByText(/Load test failed/i)).toBeInTheDocument();
  });
});
