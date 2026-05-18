import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { MarketMatch } from "@veta/frontend/components/MarketMatch";
import { ChannelContext } from "@veta/frontend/contexts/ChannelContext";
import { channelsSlice } from "@veta/frontend/store/channelsSlice";
import { gridPrefsSlice } from "@veta/frontend/store/gridPrefsSlice";
import { marketSlice } from "@veta/frontend/store/marketSlice";
import { observabilitySlice } from "@veta/frontend/store/observabilitySlice";
import { ordersSlice } from "@veta/frontend/store/ordersSlice";
import { uiSlice } from "@veta/frontend/store/uiSlice";
import { windowSlice } from "@veta/frontend/store/windowSlice";
import type { ObsEvent, Strategy } from "@veta/frontend/types";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeStore(events: ObsEvent[] = [], channelAsset?: string) {
  return configureStore({
    reducer: {
      market: marketSlice.reducer,
      orders: ordersSlice.reducer,
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
      observability: observabilitySlice.reducer,
      channels: channelsSlice.reducer,
      gridPrefs: gridPrefsSlice.reducer,
    },
    preloadedState: {
      observability: { events },
      market: {
        assets: [],
        prices: {},
        priceHistory: {},
        sessionOpen: {},
        candleHistory: {},
        candlesReady: {},
        orderBook: {},
        connected: true,
        connectionFailures: 0,
        sessionPhase: "CONTINUOUS" as const,
      },
      ui: {
        activeStrategy: "TWAP" as Strategy,
        activeSide: "BUY" as "BUY" | "SELL",
        showShortcuts: false,
        selectedAsset: null,
        updateAvailable: false,
        upgradeStatus: { inProgress: false, message: null },
        optionPrefill: null,
        orderTicketWindowSize: { w: 480, h: 780 },
      },
      channels: {
        data: {
          1: { selectedAsset: channelAsset ?? null, selectedOrderId: null },
          2: { selectedAsset: null, selectedOrderId: null },
          3: { selectedAsset: null, selectedOrderId: null },
          4: { selectedAsset: null, selectedOrderId: null },
          5: { selectedAsset: null, selectedOrderId: null },
          6: { selectedAsset: null, selectedOrderId: null },
        },
      },
    },
  });
}

function renderMatch(events: ObsEvent[] = [], channelAsset?: string) {
  const store = makeStore(events, channelAsset);
  const incoming = channelAsset ? 1 : null;
  render(
    <Provider store={store}>
      <ChannelContext.Provider
        value={{
          instanceId: "test",
          panelType: "market-match",
          outgoing: null,
          incoming,
        }}
      >
        <MarketMatch />
      </ChannelContext.Provider>
    </Provider>
  );
  return store;
}

function makeFillEvent(overrides: Record<string, unknown> = {}): ObsEvent {
  return {
    type: "orders.filled",
    ts: 1_700_000_000_000,
    payload: {
      ts: 1_700_000_000_000,
      asset: "AAPL",
      side: "BUY",
      filledQty: 100,
      avgFillPrice: 155.5,
      marketImpactBps: 2.0,
      venue: "XNAS",
      liquidityFlag: "MAKER",
      commissionUSD: 0.5,
      parentOrderId: "ord-001",
      ...overrides,
    },
  };
}

describe("MarketMatch – empty state", () => {
  it("shows no fills message when no events", () => {
    renderMatch([]);
    expect(screen.getByText(/No fills recorded yet/i)).toBeInTheDocument();
  });

  it("renders Market Match label in toolbar", () => {
    renderMatch([]);
    expect(screen.getByText("Market Match")).toBeInTheDocument();
  });

  it("shows fill count as 0", () => {
    renderMatch([]);
    expect(screen.getByText("0 fills")).toBeInTheDocument();
  });
});

describe("MarketMatch – with fills", () => {
  it("renders a fill row with asset symbol", () => {
    renderMatch([makeFillEvent()]);
    expect(screen.getAllByText("AAPL").length).toBeGreaterThan(0);
  });

  it("renders BUY side with correct text", () => {
    renderMatch([makeFillEvent({ side: "BUY" })]);
    expect(screen.getByText("BUY")).toBeInTheDocument();
  });

  it("renders SELL side with correct text", () => {
    renderMatch([makeFillEvent({ side: "SELL" })]);
    expect(screen.getByText("SELL")).toBeInTheDocument();
  });

  it("renders fill price", () => {
    renderMatch([makeFillEvent({ avgFillPrice: 155.5 })]);
    expect(screen.getByText("155.50")).toBeInTheDocument();
  });

  it("renders fill quantity", () => {
    renderMatch([makeFillEvent({ filledQty: 100 })]);
    // "100" appears in qty cell and possibly stats — use getAllByText
    expect(screen.getAllByText("100").length).toBeGreaterThan(0);
  });

  it("renders correct fill count", () => {
    renderMatch([makeFillEvent(), makeFillEvent({ asset: "MSFT" })]);
    expect(screen.getByText("2 fills")).toBeInTheDocument();
  });

  it("renders MAKER liquidity flag badge", () => {
    renderMatch([makeFillEvent({ liquidityFlag: "MAKER" })]);
    expect(screen.getByText("MAKER")).toBeInTheDocument();
  });

  it("renders TAKER liquidity flag badge", () => {
    renderMatch([makeFillEvent({ liquidityFlag: "TAKER" })]);
    expect(screen.getByText("TAKER")).toBeInTheDocument();
  });

  it("renders venue code", () => {
    renderMatch([makeFillEvent({ venue: "XNAS" })]);
    // XNAS appears in fill row and stats bar top venues
    expect(screen.getAllByText(/XNAS/).length).toBeGreaterThan(0);
  });

  it("renders positive impact in basis points", () => {
    renderMatch([makeFillEvent({ marketImpactBps: 3.5 })]);
    // Impact appears in fill row and avg impact in stats bar
    expect(screen.getAllByText("+3.5bp").length).toBeGreaterThan(0);
  });

  it("renders negative impact correctly", () => {
    renderMatch([makeFillEvent({ marketImpactBps: -4.2 })]);
    expect(screen.getAllByText("-4.2bp").length).toBeGreaterThan(0);
  });

  it("renders commission amount", () => {
    renderMatch([makeFillEvent({ commissionUSD: 1.25 })]);
    // Commission appears in fill row and total commission in stats bar
    expect(screen.getAllByText("$1.25").length).toBeGreaterThan(0);
  });
});

describe("MarketMatch – stats bar", () => {
  it("renders summary stats section with fills present", () => {
    renderMatch([makeFillEvent()]);
    expect(screen.getByText(/Buy \/ Sell flow/i)).toBeInTheDocument();
    expect(screen.getByText(/Maker \/ Taker/i)).toBeInTheDocument();
    expect(screen.getByText(/Avg Impact/i)).toBeInTheDocument();
    expect(screen.getByText(/Commission/i)).toBeInTheDocument();
  });
});

describe("MarketMatch – channel filter", () => {
  it("filters fills to selected asset only", () => {
    renderMatch([makeFillEvent({ asset: "AAPL" }), makeFillEvent({ asset: "MSFT" })], "AAPL");
    expect(screen.getByText("1 fills")).toBeInTheDocument();
  });

  it("shows no fills message for asset with no matching fills", () => {
    renderMatch([makeFillEvent({ asset: "AAPL" })], "MSFT");
    expect(screen.getByText(/No fills for MSFT/i)).toBeInTheDocument();
  });
});

describe("MarketMatch – table headers", () => {
  it("renders column headers when fills are present", () => {
    renderMatch([makeFillEvent()]);
    expect(screen.getByText("Time")).toBeInTheDocument();
    expect(screen.getByText("Side")).toBeInTheDocument();
    expect(screen.getByText("Asset")).toBeInTheDocument();
    expect(screen.getByText("Qty")).toBeInTheDocument();
    expect(screen.getByText("Fill Px")).toBeInTheDocument();
  });
});

describe("MarketMatch – context menu and fallbacks", () => {
  it("opens fill context menu and copies symbol", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderMatch([makeFillEvent({ asset: "AAPL" })]);

    fireEvent.contextMenu(screen.getByTestId("fill-row"));
    fireEvent.click(screen.getByText("Copy symbol: AAPL"));
    expect(writeText).toHaveBeenCalledWith("AAPL");
  });

  it("shows em dash placeholders when optional fields are missing", () => {
    renderMatch([
      makeFillEvent({
        venue: undefined,
        liquidityFlag: undefined,
        commissionUSD: undefined,
        counterparty: undefined,
        marketImpactBps: undefined,
      }),
    ]);

    expect(screen.getAllByText("—").length).toBeGreaterThan(2);
  });

  it("formats large quantity into K suffix", () => {
    renderMatch([makeFillEvent({ filledQty: 12_500 })]);
    expect(screen.getAllByText("12.5K").length).toBeGreaterThan(0);
  });

  it("formats very large quantity into M suffix", () => {
    renderMatch([makeFillEvent({ filledQty: 2_500_000 })]);
    expect(screen.getAllByText("2.50M").length).toBeGreaterThan(0);
  });

  it("shows No fills for selected channel asset when filter excludes events", () => {
    renderMatch([makeFillEvent({ asset: "AAPL" })], "NVDA");
    expect(screen.getByText(/No fills for NVDA/i)).toBeInTheDocument();
  });

  it("context menu copies fill price", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderMatch([makeFillEvent({ avgFillPrice: 155.5 })]);
    fireEvent.contextMenu(screen.getByTestId("fill-row"));
    fireEvent.click(screen.getByText(/Copy fill price/i));
    expect(writeText).toHaveBeenCalledWith("155.50");
  });

  it("context menu copies order id when present", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderMatch([makeFillEvent({ parentOrderId: "ord-001" })]);
    fireEvent.contextMenu(screen.getByTestId("fill-row"));
    fireEvent.click(screen.getByText(/Copy order ID/i));
    expect(writeText).toHaveBeenCalledWith("ord-001");
  });

  it("renders FX symbols with 4-decimal precision", () => {
    renderMatch([
      makeFillEvent({
        asset: "EUR/USD",
        avgFillPrice: 1.1234,
      }),
    ]);
    expect(screen.getByText("1.1234")).toBeInTheDocument();
  });

  it("formats fractional quantity with one decimal", () => {
    renderMatch([makeFillEvent({ filledQty: 12.5 })]);
    expect(screen.getAllByText(/12\.5/).length).toBeGreaterThan(0);
  });
});

describe("MarketMatch – BookPosition with order book", () => {
  function makeStoreWithBook(orderPrice: number, side: "BUY" | "SELL", bid: number, ask: number) {
    return configureStore({
      reducer: {
        market: marketSlice.reducer,
        orders: ordersSlice.reducer,
        ui: uiSlice.reducer,
        windows: windowSlice.reducer,
        observability: observabilitySlice.reducer,
        channels: channelsSlice.reducer,
        gridPrefs: gridPrefsSlice.reducer,
      },
      preloadedState: {
        observability: {
          events: [
            {
              type: "orders.filled",
              ts: 1_700_000_000_000,
              payload: {
                ts: 1_700_000_000_000,
                asset: "AAPL",
                side,
                filledQty: 100,
                avgFillPrice: orderPrice,
                liquidityFlag: "MAKER",
              },
            } as ObsEvent,
          ],
        },
        market: {
          assets: [],
          prices: {},
          priceHistory: {},
          sessionOpen: {},
          candleHistory: {},
          candlesReady: {},
          orderBook: {
            AAPL: {
              mid: (bid + ask) / 2,
              ts: Date.now(),
              bids: [{ price: bid, size: 100 }],
              asks: [{ price: ask, size: 100 }],
            },
          },
          connected: true,
          connectionFailures: 0,
          sessionPhase: "CONTINUOUS" as const,
        },
      },
    });
  }

  it("renders BUY order priced at the bid (passive)", () => {
    const store = makeStoreWithBook(100, "BUY", 100, 100.1);
    render(
      <Provider store={store}>
        <ChannelContext.Provider
          value={{
            instanceId: "mm",
            panelType: "market-match",
            outgoing: null,
            incoming: null,
          }}
        >
          <MarketMatch />
        </ChannelContext.Provider>
      </Provider>
    );
    expect(screen.getAllByText(/AAPL/).length).toBeGreaterThan(0);
  });

  it("renders SELL order priced at the ask (passive)", () => {
    const store = makeStoreWithBook(100.1, "SELL", 100, 100.1);
    render(
      <Provider store={store}>
        <ChannelContext.Provider
          value={{
            instanceId: "mm",
            panelType: "market-match",
            outgoing: null,
            incoming: null,
          }}
        >
          <MarketMatch />
        </ChannelContext.Provider>
      </Provider>
    );
    expect(screen.getAllByText(/AAPL/).length).toBeGreaterThan(0);
  });

  it("renders order priced inside spread (aggressive)", () => {
    const store = makeStoreWithBook(100.05, "BUY", 100, 100.1);
    render(
      <Provider store={store}>
        <ChannelContext.Provider
          value={{
            instanceId: "mm",
            panelType: "market-match",
            outgoing: null,
            incoming: null,
          }}
        >
          <MarketMatch />
        </ChannelContext.Provider>
      </Provider>
    );
    expect(screen.getAllByText(/AAPL/).length).toBeGreaterThan(0);
  });

  it("renders gracefully when orderBook has zero spread", () => {
    const store = makeStoreWithBook(100, "BUY", 100, 100);
    render(
      <Provider store={store}>
        <ChannelContext.Provider
          value={{
            instanceId: "mm",
            panelType: "market-match",
            outgoing: null,
            incoming: null,
          }}
        >
          <MarketMatch />
        </ChannelContext.Provider>
      </Provider>
    );
    expect(screen.getAllByText(/AAPL/).length).toBeGreaterThan(0);
  });
});
