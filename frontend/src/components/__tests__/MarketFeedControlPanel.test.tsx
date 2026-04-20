import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authSlice } from "../../store/authSlice";
import { marketSlice } from "../../store/marketSlice";
import { MarketFeedControlPanel } from "../MarketFeedControlPanel";

const toggleFeed = vi.fn();
const apiState = {
  loading: false,
  sources: [
    {
      id: "synthetic",
      label: "Synthetic",
      description: "Synthetic feed",
      enabled: true,
      requiresApiKey: false,
      apiKeyConfigured: false,
      active: true,
    },
    {
      id: "polygon",
      label: "Polygon",
      description: "External feed",
      enabled: true,
      requiresApiKey: true,
      apiKeyConfigured: true,
      active: true,
    },
  ],
  overrides: { AAPL: "polygon" },
};

vi.mock("../../store/marketDataApi.ts", () => ({
  useGetSourcesQuery: () => ({
    data: apiState.sources,
    isLoading: apiState.loading,
  }),
  useGetOverridesQuery: () => ({ data: { overrides: apiState.overrides } }),
  useToggleFeedMutation: () => [toggleFeed, { isLoading: false }],
}));

function renderPanel(role: "admin" | "trader" = "admin") {
  const store = configureStore({
    reducer: {
      auth: authSlice.reducer,
      market: marketSlice.reducer,
    },
    preloadedState: {
      auth: {
        user: {
          id: "u-1",
          name: "User",
          role,
          avatar_emoji: "U",
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
        assets: [
          {
            symbol: "AAPL",
            name: "Apple",
            exchange: "NASDAQ",
            sector: "Tech",
            initialPrice: 150,
            volatility: 0.02,
          },
          {
            symbol: "MSFT",
            name: "Microsoft",
            exchange: "NASDAQ",
            sector: "Tech",
            initialPrice: 300,
            volatility: 0.02,
          },
        ],
        prices: {},
        sessionOpen: {},
        priceHistory: {},
        candleHistory: {},
        candlesReady: {},
        connected: true,
        orderBook: {},
        sessionPhase: "CONTINUOUS" as const,
      },
    },
  });

  render(
    <Provider store={store}>
      <MarketFeedControlPanel />
    </Provider>
  );
}

describe("MarketFeedControlPanel", () => {
  beforeEach(() => {
    toggleFeed.mockReset();
    apiState.loading = false;
    apiState.overrides = { AAPL: "polygon" };
    apiState.sources[1].active = true;
  });

  it("renders feed sources and symbol overview", () => {
    renderPanel("admin");

    expect(screen.getByText(/Market Feed Control/i)).toBeInTheDocument();
    expect(screen.getAllByText("Synthetic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Polygon").length).toBeGreaterThan(0);
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("MSFT")).toBeInTheDocument();
    expect(screen.getByText(/2 symbols/i)).toBeInTheDocument();
    expect(screen.getByText(/1 on external feeds/i)).toBeInTheDocument();
  });

  it("allows admin to pause external feed", async () => {
    renderPanel("admin");

    fireEvent.click(screen.getByRole("button", { name: /Pause Feed/i }));

    await waitFor(() => {
      expect(toggleFeed).toHaveBeenCalledWith("polygon");
    });
  });

  it("filters symbols and shows empty match state", () => {
    renderPanel("trader");

    fireEvent.change(screen.getByPlaceholderText(/Search symbol/i), {
      target: { value: "ZZZZ" },
    });

    expect(screen.getByText(/No symbols match/i)).toBeInTheDocument();
  });
});
