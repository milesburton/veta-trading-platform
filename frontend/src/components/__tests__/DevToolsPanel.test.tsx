import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { alertsSlice } from "../../store/alertsSlice";
import { authSlice } from "../../store/authSlice";
import { marketSlice } from "../../store/marketSlice";
import { DevToolsPanel } from "../DevToolsPanel";

const runDemoDay = vi.fn();
const runLoadTest = vi.fn();

vi.mock("../../store/gatewayApi.ts", () => ({
  useRunDemoDayMutation: () => [runDemoDay, { isLoading: false }],
  useRunLoadTestMutation: () => [runLoadTest, { isLoading: false }],
}));

function renderPanel() {
  const store = configureStore({
    reducer: {
      alerts: alertsSlice.reducer,
      auth: authSlice.reducer,
      market: marketSlice.reducer,
    },
    preloadedState: {
      alerts: {
        alerts: [],
        muteRules: [],
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
});
