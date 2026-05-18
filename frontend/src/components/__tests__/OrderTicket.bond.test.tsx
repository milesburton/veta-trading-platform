import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { TradingProvider } from "../../context/TradingContext";
import { ChannelContext } from "../../contexts/ChannelContext";
import { authSlice } from "../../store/authSlice";
import { channelsSlice } from "../../store/channelsSlice";
import { killSwitchSlice } from "../../store/killSwitchSlice";
import { marketSlice } from "../../store/marketSlice";
import { ordersSlice } from "../../store/ordersSlice";
import { uiSlice } from "../../store/uiSlice";
import { windowSlice } from "../../store/windowSlice";
import type { AssetDef, MarketPrices } from "../../types";
import { OrderTicket } from "../OrderTicket";

const MOCK_BOND_PRICE = {
  price: 99.5,
  modifiedDuration: 7.5,
  dv01: 0.075,
  convexity: 75,
  yieldAnnual: 0.045,
  yieldChangeBps: 0,
};

vi.mock("../../store/analyticsApi", () => ({
  useGetQuoteMutation: () => [vi.fn().mockResolvedValue({ data: null }), { isLoading: false }],
  useGetBondPriceMutation: () => [
    vi.fn().mockResolvedValue({ data: MOCK_BOND_PRICE }),
    { isLoading: false },
  ],
}));

const assets: AssetDef[] = [
  { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" },
];

const prices: MarketPrices = { AAPL: 155 };

function renderTicket() {
  const testStore = configureStore({
    reducer: {
      auth: authSlice.reducer,
      market: marketSlice.reducer,
      orders: ordersSlice.reducer,
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
      channels: channelsSlice.reducer,
      killSwitch: killSwitchSlice.reducer,
    },
    preloadedState: {
      auth: {
        user: {
          id: "alice",
          name: "Alice Chen",
          role: "trader" as const,
          avatar_emoji: "🙂",
        },
        limits: {
          max_order_qty: 10_000,
          max_daily_notional: 1_000_000,
          allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
          allowed_desks: ["equity", "fi", "derivatives"],
          dark_pool_access: false,
        },
        status: "authenticated" as const,
        sessionExpired: false,
      },
      market: {
        assets,
        prices,
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
  render(
    <Provider store={testStore}>
      <ChannelContext.Provider
        value={{
          instanceId: "ot",
          panelType: "order-ticket",
          outgoing: null,
          incoming: null,
        }}
      >
        <TradingProvider>
          <OrderTicket />
        </TradingProvider>
      </ChannelContext.Provider>
    </Provider>
  );
  return testStore;
}

describe("OrderTicket – bond pricing", () => {
  it("renders bond price details after quote loads", async () => {
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "Bond" }));
    await waitFor(
      () => {
        expect(screen.queryByLabelText(/Bond price/i)).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
    expect(screen.getByText(/Mod Duration/i)).toBeInTheDocument();
    expect(screen.getByText(/DV01/i)).toBeInTheDocument();
    expect(screen.getByText(/Convexity/i)).toBeInTheDocument();
  });

  it("submits a bond order successfully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const store = renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "Bond" }));
    await waitFor(
      () => {
        expect(screen.queryByLabelText(/Bond price/i)).toBeInTheDocument();
      },
      { timeout: 2000 }
    );

    fireEvent.click(screen.getByRole("button", { name: /Submit BUY/i }));
    await waitFor(() => {
      expect(store.getState().orders.orders.length).toBeGreaterThan(0);
    });
    vi.unstubAllGlobals();
  });
});
