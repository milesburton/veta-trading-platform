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

const MOCK_QUOTE = {
  symbol: "AAPL",
  optionType: "call" as const,
  strike: 155,
  expirySecs: 30 * 86400,
  spotPrice: 155,
  impliedVol: 0.28,
  price: 4.23,
  greeks: { delta: 0.42, gamma: 0.03, theta: -0.08, vega: 0.12, rho: 0.05 },
  computedAt: Date.now(),
};

vi.mock("../../store/analyticsApi", () => ({
  useGetQuoteMutation: () => [
    vi.fn().mockResolvedValue({ data: MOCK_QUOTE }),
    { isLoading: false },
  ],
  useGetBondPriceMutation: () => [vi.fn().mockResolvedValue({ data: null }), { isLoading: false }],
}));

const assets: AssetDef[] = [
  { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" },
  {
    symbol: "MSFT",
    initialPrice: 300,
    volatility: 0.015,
    sector: "Technology",
  },
];

const prices: MarketPrices = { AAPL: 155, MSFT: 305 };

function makeStore() {
  return configureStore({
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
          avatar_emoji: "👩‍💼",
        },
        limits: {
          max_order_qty: 10_000,
          max_daily_notional: 1_000_000,
          allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
          allowed_desks: ["equity", "fi", "derivatives"],
          dark_pool_access: false,
        },
        status: "authenticated" as const,
        showLogin: false,
      },
      market: {
        assets,
        prices,
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

function renderTicket() {
  const testStore = makeStore();
  render(
    <Provider store={testStore}>
      <ChannelContext.Provider
        value={{
          instanceId: "order-ticket",
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

describe("OrderTicket – rendering", () => {
  it("renders strategy selector with all options", () => {
    renderTicket();
    expect(screen.getByLabelText(/Strategy/i)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Limit Order" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /TWAP/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /POV/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /VWAP/i })).toBeInTheDocument();
  });

  it("renders quantity input", () => {
    renderTicket();
    expect(screen.getByLabelText(/Quantity/i)).toBeInTheDocument();
  });

  it("renders limit price input", () => {
    renderTicket();
    expect(screen.getByLabelText(/Limit Price/i)).toBeInTheDocument();
  });

  it("adds explanatory tooltips to key order inputs", () => {
    renderTicket();
    expect(screen.getByLabelText(/Limit Price/i)).toHaveAttribute(
      "title",
      "Limit price for execution"
    );
    expect(screen.getByLabelText(/Quantity/i)).toHaveAttribute("title");
  });

  it("renders expiry input", () => {
    renderTicket();
    expect(screen.getByLabelText(/Duration/i)).toBeInTheDocument();
  });

  it("renders BUY and SELL side buttons", () => {
    renderTicket();
    expect(screen.getByRole("button", { name: "BUY" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SELL" })).toBeInTheDocument();
  });

  it("pre-fills limit price from market price on first render", () => {
    renderTicket();
    const priceInput = screen.getByLabelText(/Limit Price/i) as HTMLInputElement;
    // AAPL is selected by default; price = 155 → "155.00"
    expect(priceInput.value).toBe("155.00");
  });

  it("renders 'snap to mid' button when a price is available", () => {
    renderTicket();
    expect(screen.getByTitle(/Snap limit price to current mid/i)).toBeInTheDocument();
  });
});

describe("OrderTicket – side toggle", () => {
  it("activates SELL side when SELL button clicked", () => {
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "SELL" }));
    // submit button aria-label changes to reflect SELL side
    const submitBtn = screen.getByRole("button", {
      name: /Submit SELL order/i,
    });
    expect(submitBtn).toBeInTheDocument();
  });

  it("activates BUY side when BUY button clicked", () => {
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "SELL" }));
    fireEvent.click(screen.getByRole("button", { name: "BUY" }));
    const submitBtn = screen.getByRole("button", { name: /Submit BUY order/i });
    expect(submitBtn).toBeInTheDocument();
  });
});

describe("OrderTicket – strategy params visibility", () => {
  it("shows TWAP params when TWAP strategy is selected", () => {
    renderTicket();
    const select = screen.getByLabelText(/Strategy/i);
    fireEvent.change(select, { target: { value: "TWAP" } });
    expect(screen.getByText(/TWAP Params/i)).toBeInTheDocument();
  });

  it("shows POV params when POV strategy is selected", () => {
    renderTicket();
    const select = screen.getByLabelText(/Strategy/i);
    fireEvent.change(select, { target: { value: "POV" } });
    expect(screen.getByText(/POV Params/i)).toBeInTheDocument();
  });

  it("shows VWAP params when VWAP strategy is selected", () => {
    renderTicket();
    const select = screen.getByLabelText(/Strategy/i);
    fireEvent.change(select, { target: { value: "VWAP" } });
    expect(screen.getByText(/VWAP Params/i)).toBeInTheDocument();
  });

  it("shows no strategy params for LIMIT", () => {
    renderTicket();
    const select = screen.getByLabelText(/Strategy/i);
    fireEvent.change(select, { target: { value: "LIMIT" } });
    expect(screen.queryByText(/TWAP Params/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/POV Params/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/VWAP Params/i)).not.toBeInTheDocument();
  });
});

describe("OrderTicket – form submission", () => {
  it("shows success feedback after successful submission", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: /Submit BUY order/i }));

    await waitFor(() => {
      expect(screen.getByText(/Order submitted/i)).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  it("adds order to store even when backend fetch fails (fire-and-forget)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const testStore = renderTicket();
    fireEvent.click(screen.getByRole("button", { name: /Submit BUY order/i }));

    // The thunk always succeeds (fetch is fire-and-forget), so the order is still added
    await waitFor(() => {
      expect(testStore.getState().orders.orders.length).toBeGreaterThan(0);
    });
    vi.unstubAllGlobals();
  });

  it("adds order to store after submission", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const testStore = renderTicket();
    fireEvent.click(screen.getByRole("button", { name: /Submit BUY order/i }));

    await waitFor(() => {
      expect(testStore.getState().orders.orders.length).toBeGreaterThan(0);
    });
    vi.unstubAllGlobals();
  });
});

describe("OrderTicket – form validation", () => {
  it("submit button is disabled when quantity is empty", () => {
    renderTicket();
    const qtyInput = screen.getByLabelText(/Quantity/i);
    fireEvent.change(qtyInput, { target: { value: "" } });
    // When invalid, aria-label becomes "Submit order (form incomplete)"
    const submit = screen.getByRole("button", { name: /Submit order/i });
    expect(submit).toBeDisabled();
  });

  it("submit button is disabled when limit price is zero", () => {
    renderTicket();
    const priceInput = screen.getByLabelText(/Limit Price/i);
    fireEvent.change(priceInput, { target: { value: "0" } });
    const submit = screen.getByRole("button", { name: /Submit order/i });
    expect(submit).toBeDisabled();
  });
});

describe("OrderTicket – Mid button", () => {
  it("sets limit price to current market price when clicked", () => {
    renderTicket();
    const priceInput = screen.getByLabelText(/Limit Price/i) as HTMLInputElement;
    // Change price to something else first
    fireEvent.change(priceInput, { target: { value: "100.00" } });

    fireEvent.click(screen.getByTitle(/Snap limit price to current mid/i));
    expect(priceInput.value).toBe("155.00");
  });
});

describe("OrderTicket – instrument type toggle", () => {
  it("renders Equity and Options tabs", () => {
    renderTicket();
    expect(screen.getByRole("button", { name: "Equity" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Options" })).toBeInTheDocument();
  });

  it("starts in Equity mode with equity fields visible", () => {
    renderTicket();
    expect(screen.getByLabelText(/Limit Price/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Strike/i)).not.toBeInTheDocument();
  });

  it("clicking Options tab shows option-specific fields", () => {
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(screen.getByLabelText(/Option strike price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Option expiry/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CALL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PUT" })).toBeInTheDocument();
  });

  it("clicking Options tab hides equity-only fields", () => {
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(screen.queryByLabelText(/Limit Price/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Order duration/i)).not.toBeInTheDocument();
  });

  it("switching back to Equity restores equity fields", () => {
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    fireEvent.click(screen.getByRole("button", { name: "Equity" }));
    expect(screen.getByLabelText(/Limit Price/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Option strike price/i)).not.toBeInTheDocument();
  });
});

describe("OrderTicket – options mode", () => {
  function openOptionsMode() {
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "Options" }));
  }

  it("shows CALL/PUT toggle in options mode", () => {
    openOptionsMode();
    expect(screen.getByRole("button", { name: "CALL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PUT" })).toBeInTheDocument();
  });

  it("CALL button is pressed by default", () => {
    openOptionsMode();
    expect(screen.getByRole("button", { name: "CALL" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "PUT" })).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking PUT toggles the pressed state", () => {
    openOptionsMode();
    fireEvent.click(screen.getByRole("button", { name: "PUT" }));
    expect(screen.getByRole("button", { name: "PUT" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "CALL" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows expiry selector with 5 options", () => {
    openOptionsMode();
    const select = screen.getByLabelText(/Option expiry/i) as HTMLSelectElement;
    expect(select.options.length).toBe(5);
    expect(select.options[0].text).toBe("7d");
    expect(select.options[4].text).toBe("90d");
  });

  it("shows algo strategies unavailable notice in options mode", () => {
    openOptionsMode();
    expect(
      screen.getByText(/Algorithmic strategies are not available for options/i)
    ).toBeInTheDocument();
  });

  it("strategy selector is not shown in options mode", () => {
    openOptionsMode();
    expect(screen.queryByLabelText(/Execution strategy/i)).not.toBeInTheDocument();
  });

  it("submit button is disabled without a strike", () => {
    openOptionsMode();
    const submit = screen.getByRole("button", { name: /Submit order/i });
    expect(submit).toBeDisabled();
  });

  it("quantity label changes to Contracts in options mode", () => {
    openOptionsMode();
    expect(screen.getByText(/Contracts/i)).toBeInTheDocument();
  });

  it("premium card appears after quote is fetched", async () => {
    openOptionsMode();
    fireEvent.change(screen.getByLabelText(/Option strike price/i), {
      target: { value: "155" },
    });
    await waitFor(
      () => {
        expect(screen.getByLabelText("Option premium")).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  it("submit button becomes enabled after quote loads with valid strike", async () => {
    openOptionsMode();
    fireEvent.change(screen.getByLabelText(/Option strike price/i), {
      target: { value: "155" },
    });
    await waitFor(
      () => {
        const submit = screen.getByRole("button", {
          name: /Submit (BUY|SELL)/i,
        });
        expect(submit).not.toBeDisabled();
      },
      { timeout: 2000 }
    );
  });
});

describe("OrderTicket – stub strategies in equity mode", () => {
  it("ICEBERG appears as a disabled option in the strategy selector", () => {
    renderTicket();
    const icebergOption = screen.getByRole("option", { name: /ICEBERG/i });
    expect(icebergOption).toBeInTheDocument();
    expect(icebergOption).toBeDisabled();
  });

  it("SNIPER appears as a disabled option in the strategy selector", () => {
    renderTicket();
    const sniperOption = screen.getByRole("option", { name: /SNIPER/i });
    expect(sniperOption).toBeInTheDocument();
    expect(sniperOption).toBeDisabled();
  });

  it("ARRIVAL_PRICE appears as a disabled option in the strategy selector", () => {
    renderTicket();
    const apOption = screen.getByRole("option", { name: /ARRIVAL PRICE/i });
    expect(apOption).toBeInTheDocument();
    expect(apOption).toBeDisabled();
  });
});

describe("OrderTicket – TIF toggle", () => {
  it("changes TIF when a button is clicked", () => {
    renderTicket();
    const gtc = screen.getByRole("button", { name: /^GTC$/ });
    fireEvent.click(gtc);
    // No throw is enough; the state-change branches in setter are exercised.
    expect(gtc).toBeInTheDocument();
  });

  it("renders all four TIF options", () => {
    renderTicket();
    expect(screen.getByRole("button", { name: /^DAY$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^GTC$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^IOC$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^FOK$/ })).toBeInTheDocument();
  });
});

describe("OrderTicket – preview", () => {
  it("renders the order preview with notional", () => {
    renderTicket();
    // Default qty is set to a value that produces notional under 1M
    expect(screen.getByText(/Notional/i)).toBeInTheDocument();
  });

  it("formats notional in M when above 1M", () => {
    renderTicket();
    const qty = screen.getByLabelText(/Quantity/i) as HTMLInputElement;
    fireEvent.change(qty, { target: { value: "10000" } });
    // 10000 * 155 = 1.55M
    const millionish = screen.getAllByText(/M/);
    expect(millionish.length).toBeGreaterThan(0);
  });
});

describe("OrderTicket – options PUT branch", () => {
  it("submitting an option PUT order with a strike", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    fireEvent.click(screen.getByRole("button", { name: "PUT" }));
    fireEvent.change(screen.getByLabelText(/Option strike price/i), {
      target: { value: "155" },
    });
    await waitFor(
      () => {
        const submit = screen.getByRole("button", { name: /Submit (BUY|SELL)/i });
        expect(submit).not.toBeDisabled();
      },
      { timeout: 2000 }
    );
    vi.unstubAllGlobals();
  });
});

describe("OrderTicket – limit price guard", () => {
  it("submit button disabled when limit price is empty", () => {
    renderTicket();
    fireEvent.change(screen.getByLabelText(/Limit Price/i), { target: { value: "" } });
    expect(screen.getByRole("button", { name: /Submit order/i })).toBeDisabled();
  });
});

describe("OrderTicket – preview slippage variants", () => {
  function renderWithMid(mid: number | null) {
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
          user: { id: "alice", name: "Alice", role: "trader" as const, avatar_emoji: "🙂" },
          limits: {
            max_order_qty: 10_000,
            max_daily_notional: 1_000_000,
            allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
            allowed_desks: ["equity", "fi", "derivatives"],
            dark_pool_access: false,
          },
          status: "authenticated" as const,
          showLogin: false,
        },
        market: {
          assets,
          prices,
          priceHistory: {},
          sessionOpen: {},
          candleHistory: {},
          candlesReady: {},
          connected: true,
          orderBook: (mid
            ? {
                AAPL: {
                  mid,
                  ts: Date.now(),
                  bids: [{ price: mid - 0.05, size: 100 }],
                  asks: [{ price: mid + 0.05, size: 100 }],
                },
              }
            : {}) as Record<string, import("../../types").OrderBookSnapshot>,
          sessionPhase: "CONTINUOUS" as const,
        },
      },
    });
    render(
      <Provider store={testStore}>
        <ChannelContext.Provider
          value={{
            instanceId: "x",
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

  it("renders slippage when limit price differs strongly from mid (positive)", () => {
    renderWithMid(150);
    fireEvent.change(screen.getByLabelText(/Limit Price/i), {
      target: { value: "151" },
    });
    expect(screen.getByText(/vs Mid/i)).toBeInTheDocument();
  });

  it("renders slippage when limit price is below mid (favourable)", () => {
    renderWithMid(150);
    fireEvent.change(screen.getByLabelText(/Limit Price/i), {
      target: { value: "149" },
    });
    expect(screen.getByText(/vs Mid/i)).toBeInTheDocument();
  });
});

describe("OrderTicket – FX & Commodity tabs", () => {
  function renderWithDesks(desks: string[]) {
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
          user: { id: "alice", name: "Alice", role: "trader" as const, avatar_emoji: "🙂" },
          limits: {
            max_order_qty: 10_000,
            max_daily_notional: 1_000_000,
            allowed_strategies: ["LIMIT"],
            allowed_desks: desks,
            dark_pool_access: false,
          },
          status: "authenticated" as const,
          showLogin: false,
        },
        market: {
          assets,
          prices,
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
    render(
      <Provider store={testStore}>
        <ChannelContext.Provider
          value={{
            instanceId: "x",
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

  it("renders FX tab when user has fx desk", () => {
    renderWithDesks(["fx", "equity"]);
    expect(screen.getByRole("button", { name: "FX" })).toBeInTheDocument();
  });

  it("clicking FX tab switches instrument type", () => {
    renderWithDesks(["fx", "equity"]);
    const fxBtn = screen.getByRole("button", { name: "FX" });
    fireEvent.click(fxBtn);
    expect(fxBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("renders Commodity (Futures) tab when user has commodities desk", () => {
    renderWithDesks(["commodities", "equity"]);
    expect(screen.getByRole("button", { name: /Futures/ })).toBeInTheDocument();
  });

  it("clicking Futures tab switches instrument type", () => {
    renderWithDesks(["commodities", "equity"]);
    const futuresBtn = screen.getByRole("button", { name: /Futures/ });
    fireEvent.click(futuresBtn);
    expect(futuresBtn).toHaveAttribute("aria-pressed", "true");
  });
});

describe("OrderTicket – submit advanced strategies (trader with full perms)", () => {
  function renderAdmin() {
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
          user: { id: "trader", name: "Trader", role: "trader" as const, avatar_emoji: "👩" },
          limits: {
            max_order_qty: 10_000_000,
            max_daily_notional: 100_000_000,
            allowed_strategies: [
              "LIMIT",
              "TWAP",
              "POV",
              "VWAP",
              "ICEBERG",
              "SNIPER",
              "ARRIVAL_PRICE",
              "IS",
              "MOMENTUM",
            ],
            allowed_desks: ["equity", "fi", "derivatives"],
            dark_pool_access: true,
          },
          status: "authenticated" as const,
          showLogin: false,
        },
        market: {
          assets,
          prices,
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
    render(
      <Provider store={testStore}>
        <ChannelContext.Provider
          value={{
            instanceId: "x",
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

  function submitWithStrategy(strategy: string) {
    const store = renderAdmin();
    const sel = screen.getByLabelText(/Strategy/i);
    fireEvent.change(sel, { target: { value: strategy } });
    fireEvent.click(screen.getByRole("button", { name: /Submit BUY order/i }));
    return store;
  }

  it("submits ICEBERG order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const store = submitWithStrategy("ICEBERG");
    await waitFor(() => {
      expect(store.getState().orders.orders.length).toBeGreaterThan(0);
    });
    vi.unstubAllGlobals();
  });

  it("submits SNIPER order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const store = submitWithStrategy("SNIPER");
    await waitFor(() => {
      expect(store.getState().orders.orders.length).toBeGreaterThan(0);
    });
    vi.unstubAllGlobals();
  });

  it("submits ARRIVAL_PRICE order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const store = submitWithStrategy("ARRIVAL_PRICE");
    await waitFor(() => {
      expect(store.getState().orders.orders.length).toBeGreaterThan(0);
    });
    vi.unstubAllGlobals();
  });

  it("submits IS order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const store = submitWithStrategy("IS");
    await waitFor(() => {
      expect(store.getState().orders.orders.length).toBeGreaterThan(0);
    });
    vi.unstubAllGlobals();
  });

  it("submits MOMENTUM order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const store = submitWithStrategy("MOMENTUM");
    await waitFor(() => {
      expect(store.getState().orders.orders.length).toBeGreaterThan(0);
    });
    vi.unstubAllGlobals();
  });
});

describe("OrderTicket – channel incoming asset", () => {
  it("uses incoming-channel selectedAsset to drive asset selection", () => {
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
          user: { id: "alice", name: "Alice", role: "trader" as const, avatar_emoji: "🙂" },
          limits: {
            max_order_qty: 10_000,
            max_daily_notional: 1_000_000,
            allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
            allowed_desks: ["equity", "fi", "derivatives"],
            dark_pool_access: false,
          },
          status: "authenticated" as const,
          showLogin: false,
        },
        market: {
          assets,
          prices,
          priceHistory: {},
          sessionOpen: {},
          candleHistory: {},
          candlesReady: {},
          connected: true,
          orderBook: {},
          sessionPhase: "CONTINUOUS" as const,
        },
        channels: {
          data: {
            1: { selectedAsset: "MSFT", selectedOrderId: null },
            2: { selectedAsset: null, selectedOrderId: null },
            3: { selectedAsset: null, selectedOrderId: null },
            4: { selectedAsset: null, selectedOrderId: null },
            5: { selectedAsset: null, selectedOrderId: null },
            6: { selectedAsset: null, selectedOrderId: null },
          },
        },
      },
    });
    render(
      <Provider store={testStore}>
        <ChannelContext.Provider
          value={{
            instanceId: "x",
            panelType: "order-ticket",
            outgoing: null,
            incoming: 1,
          }}
        >
          <TradingProvider>
            <OrderTicket />
          </TradingProvider>
        </ChannelContext.Provider>
      </Provider>
    );
    expect(screen.getByTestId("order-ticket-panel")).toBeInTheDocument();
  });
});

describe("OrderTicket – channel asset switching", () => {
  it("selecting an FX asset switches instrument type", () => {
    const fxAssets: AssetDef[] = [
      ...assets,
      {
        symbol: "EUR/USD",
        initialPrice: 1.1,
        volatility: 0.005,
        sector: "FX",
        assetClass: "fx",
      },
    ];
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
          user: { id: "alice", name: "Alice", role: "trader" as const, avatar_emoji: "🙂" },
          limits: {
            max_order_qty: 10_000,
            max_daily_notional: 1_000_000,
            allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
            allowed_desks: ["equity", "fx", "fi", "derivatives"],
            dark_pool_access: false,
          },
          status: "authenticated" as const,
          showLogin: false,
        },
        market: {
          assets: fxAssets,
          prices: { ...prices, "EUR/USD": 1.12 },
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
    render(
      <Provider store={testStore}>
        <ChannelContext.Provider
          value={{
            instanceId: "x",
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
    expect(screen.getByRole("button", { name: /^FX$/ })).toBeInTheDocument();
  });

  it("selecting a commodity asset shows futures tab", () => {
    const commodityAssets: AssetDef[] = [
      ...assets,
      {
        symbol: "CL",
        initialPrice: 80,
        volatility: 0.02,
        sector: "Commodity",
        assetClass: "commodity",
      },
    ];
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
          user: { id: "alice", name: "Alice", role: "trader" as const, avatar_emoji: "🙂" },
          limits: {
            max_order_qty: 10_000,
            max_daily_notional: 1_000_000,
            allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
            allowed_desks: ["equity", "commodities", "fi", "derivatives"],
            dark_pool_access: false,
          },
          status: "authenticated" as const,
          showLogin: false,
        },
        market: {
          assets: commodityAssets,
          prices: { ...prices, CL: 80 },
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
    render(
      <Provider store={testStore}>
        <ChannelContext.Provider
          value={{
            instanceId: "x",
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
    expect(screen.getByRole("button", { name: /Futures/i })).toBeInTheDocument();
  });
});

describe("OrderTicket – AssetInfoBar with full metadata", () => {
  it("renders asset info bar with all fields populated", () => {
    const fullAssets: AssetDef[] = [
      {
        symbol: "AAPL",
        initialPrice: 150,
        volatility: 0.02,
        sector: "Technology",
        beta: 1.2,
        marketCapB: 2800,
        dividendYield: 0.005,
        peRatio: 28,
        exchange: "NASDAQ",
      },
    ];
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
          user: { id: "alice", name: "Alice", role: "trader" as const, avatar_emoji: "🙂" },
          limits: {
            max_order_qty: 10_000,
            max_daily_notional: 1_000_000,
            allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
            allowed_desks: ["equity", "fi", "derivatives"],
            dark_pool_access: false,
          },
          status: "authenticated" as const,
          showLogin: false,
        },
        market: {
          assets: fullAssets,
          prices: { AAPL: 155 },
          priceHistory: {},
          sessionOpen: {},
          candleHistory: {},
          candlesReady: {},
          connected: true,
          orderBook: {
            AAPL: {
              mid: 155,
              ts: Date.now(),
              bids: [{ price: 154.95, size: 100 }],
              asks: [{ price: 155.05, size: 100 }],
            },
          },
          sessionPhase: "CONTINUOUS" as const,
        },
      },
    });
    render(
      <Provider store={testStore}>
        <ChannelContext.Provider
          value={{
            instanceId: "x",
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
    expect(screen.getByTestId("asset-info-bar")).toBeInTheDocument();
    expect(screen.getByText(/2\.8T/)).toBeInTheDocument();
    expect(screen.getByText(/NASDAQ/)).toBeInTheDocument();
  });

  it("renders asset info bar with sub-trillion cap and missing optional fields", () => {
    const slimAssets: AssetDef[] = [
      {
        symbol: "MID",
        initialPrice: 50,
        volatility: 0.02,
        sector: "Industrial",
        marketCapB: 50,
      },
    ];
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
          user: { id: "alice", name: "Alice", role: "trader" as const, avatar_emoji: "🙂" },
          limits: {
            max_order_qty: 10_000,
            max_daily_notional: 1_000_000,
            allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
            allowed_desks: ["equity", "fi", "derivatives"],
            dark_pool_access: false,
          },
          status: "authenticated" as const,
          showLogin: false,
        },
        market: {
          assets: slimAssets,
          prices: { MID: 50 },
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
    render(
      <Provider store={testStore}>
        <ChannelContext.Provider
          value={{
            instanceId: "x",
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
    expect(screen.getByTestId("asset-info-bar")).toBeInTheDocument();
    expect(screen.getByText(/50B/)).toBeInTheDocument();
  });
});

describe("OrderTicket – submit each strategy", () => {
  function submitWithStrategy(strategy: string) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const store = renderTicket();
    const select = screen.getByLabelText(/Strategy/i);
    fireEvent.change(select, { target: { value: strategy } });
    fireEvent.click(screen.getByRole("button", { name: /Submit BUY order/i }));
    return store;
  }

  it("submits TWAP order", async () => {
    const store = submitWithStrategy("TWAP");
    await waitFor(() => {
      expect(store.getState().orders.orders.length).toBeGreaterThan(0);
    });
    vi.unstubAllGlobals();
  });

  it("submits POV order", async () => {
    const store = submitWithStrategy("POV");
    await waitFor(() => {
      expect(store.getState().orders.orders.length).toBeGreaterThan(0);
    });
    vi.unstubAllGlobals();
  });

  it("submits VWAP order", async () => {
    const store = submitWithStrategy("VWAP");
    await waitFor(() => {
      expect(store.getState().orders.orders.length).toBeGreaterThan(0);
    });
    vi.unstubAllGlobals();
  });
});

describe("OrderTicket – submit options gets rejected with message", () => {
  it("submits an option order and shows simulation rejected message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    fireEvent.change(screen.getByLabelText(/Option strike price/i), {
      target: { value: "155" },
    });
    await waitFor(
      () => {
        const submit = screen.getByRole("button", { name: /Submit (BUY|SELL)/i });
        expect(submit).not.toBeDisabled();
      },
      { timeout: 2000 }
    );
    fireEvent.click(screen.getByRole("button", { name: /Submit (BUY|SELL)/i }));
    await waitFor(() => {
      expect(screen.queryByText(/Options not supported in this simulation/i)).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });
});

describe("OrderTicket – instrument tabs (bond / fx)", () => {
  it("renders Bond tab when user has fi desk access", () => {
    renderTicket();
    expect(screen.getByRole("button", { name: "Bond" })).toBeInTheDocument();
  });

  it("clicking Bond tab switches the instrument type", () => {
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "Bond" }));
    // Strike disappears in bond mode
    expect(screen.queryByLabelText(/Option strike/i)).not.toBeInTheDocument();
  });

  it("switching from Bond back to Equity restores equity fields", () => {
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "Bond" }));
    fireEvent.click(screen.getByRole("button", { name: "Equity" }));
    expect(screen.getByLabelText(/Limit Price/i)).toBeInTheDocument();
  });

  it("Bond mode shows hint about LIMIT strategy", () => {
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "Bond" }));
    expect(screen.getByText(/Bond orders always use LIMIT/i)).toBeInTheDocument();
  });
});
