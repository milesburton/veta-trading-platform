import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authSlice } from "../../store/authSlice";
import { marketSlice } from "../../store/marketSlice";
import { MarketDataSourcesPanel } from "../MarketDataSourcesPanel";

const useGetSourcesQuery = vi.fn();
const useGetOverridesQuery = vi.fn();
const useSetOverridesMutation = vi.fn();

const setOverrides = vi.fn();

vi.mock("../../store/marketDataApi.ts", () => ({
  useGetSourcesQuery: () => useGetSourcesQuery(),
  useGetOverridesQuery: () => useGetOverridesQuery(),
  useSetOverridesMutation: () => useSetOverridesMutation(),
}));

function makeStore(role: "admin" | "trader" = "admin") {
  return configureStore({
    reducer: {
      auth: authSlice.reducer,
      market: marketSlice.reducer,
    },
    preloadedState: {
      auth: {
        user: {
          id: "u-1",
          name: role === "admin" ? "Admin" : "Trader",
          role,
          avatar_emoji: role === "admin" ? "A" : "T",
        },
        limits: {
          max_order_qty: 10000,
          max_daily_notional: 1000000,
          allowed_strategies: ["LIMIT"],
          allowed_desks: ["equity"],
          dark_pool_access: false,
        },
        status: "authenticated" as const,
      },
      market: {
        // Object shape deliberately mirrors how this panel currently derives symbols.
        assets: {
          AAPL: { symbol: "AAPL" },
          MSFT: { symbol: "MSFT" },
        } as unknown as never,
        prices: {},
        priceHistory: {},
        sessionOpen: {},
        candleHistory: {},
        candlesReady: {},
        connected: true,
        orderBook: {},
        sessionPhase: "CONTINUOUS" as const,
      },
    },
  });
}

function renderPanel(role: "admin" | "trader" = "admin") {
  render(
    <Provider store={makeStore(role)}>
      <MarketDataSourcesPanel />
    </Provider>,
  );
}

beforeEach(() => {
  setOverrides.mockReset();
  setOverrides.mockReturnValue({
    unwrap: () => Promise.resolve({ overrides: {} }),
  });

  useGetSourcesQuery.mockReturnValue({
    data: [
      {
        id: "synthetic",
        label: "Synthetic",
        description: "Fallback source",
        enabled: true,
        requiresApiKey: false,
        apiKeyConfigured: false,
        active: true,
      },
      {
        id: "polygon",
        label: "Polygon",
        description: "External real-time feed",
        enabled: true,
        requiresApiKey: true,
        apiKeyConfigured: true,
        active: true,
      },
      {
        id: "fred",
        label: "FRED",
        description: "Rates data",
        enabled: false,
        requiresApiKey: true,
        apiKeyConfigured: false,
        active: false,
      },
    ],
  });

  useGetOverridesQuery.mockReturnValue({
    data: { overrides: { AAPL: "polygon" } },
    isLoading: false,
  });

  useSetOverridesMutation.mockReturnValue([setOverrides, { isLoading: false }]);
});

describe("MarketDataSourcesPanel", () => {
  it("renders source cards and provider status", () => {
    renderPanel();

    expect(screen.getByText("Market Data Sources")).toBeInTheDocument();
    expect(screen.getAllByText("Polygon").length).toBeGreaterThan(0);
    expect(screen.getByText(/API key configured/i)).toBeInTheDocument();
    expect(screen.getByText(/API key not set/i)).toBeInTheDocument();
  });

  it("filters to overrides only", async () => {
    renderPanel();

    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("MSFT")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Overrides only/i }));

    await waitFor(() => {
      expect(screen.getByText("AAPL")).toBeInTheDocument();
      expect(screen.queryByText("MSFT")).not.toBeInTheDocument();
    });
  });

  it("allows admin to change source and save merged overrides", async () => {
    renderPanel("admin");

    const selects = screen.getAllByRole("combobox");
    const aaplSelect = selects.find(
      (s) => (s as HTMLSelectElement).value === "polygon",
    );
    const msftSelect = selects.find(
      (s) => (s as HTMLSelectElement).value === "synthetic",
    );

    expect(aaplSelect).toBeTruthy();
    expect(msftSelect).toBeTruthy();

    fireEvent.change(msftSelect as HTMLSelectElement, {
      target: { value: "polygon" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => {
      expect(setOverrides).toHaveBeenCalledWith({
        AAPL: "polygon",
        MSFT: "polygon",
      });
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });
  });

  it("reset all to synthetic then save removes existing overrides", async () => {
    renderPanel("admin");

    fireEvent.click(
      screen.getByRole("button", { name: /Reset All to Synthetic/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => {
      expect(setOverrides).toHaveBeenCalledWith({});
    });
  });

  it("hides admin controls for non-admin users", () => {
    renderPanel("trader");

    expect(
      screen.queryByRole("button", { name: /Save Changes/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Reset All to Synthetic/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  });
});
