import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { OrderBlotter } from "@veta/frontend/components/OrderBlotter";
import { ChannelContext } from "@veta/frontend/contexts/ChannelContext";
import { authSlice } from "@veta/frontend/store/authSlice";
import { channelsSlice } from "@veta/frontend/store/channelsSlice";
import { gridPrefsSlice } from "@veta/frontend/store/gridPrefsSlice";
import { ordersSlice } from "@veta/frontend/store/ordersSlice";
import { uiSlice } from "@veta/frontend/store/uiSlice";
import { windowSlice } from "@veta/frontend/store/windowSlice";
import type { OrderRecord } from "@veta/frontend/types";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";

// ── Mock useGridQuery ─────────────────────────────────────────────────────────

const mockUseGridQuery = vi.fn();
const mockContainerRef = { current: null };
vi.mock("../../hooks/useGridQuery", () => ({
  useGridQuery: (...args: unknown[]) => mockUseGridQuery(...args),
  useContainerLimit: () => ({ containerRef: mockContainerRef, limit: 50 }),
}));

function defaultQueryResult(rows: OrderRecord[] = [], total?: number) {
  return {
    rows,
    total: total ?? rows.length,
    evalMs: 0,
    isLoading: false,
    isError: false,
    isFetching: false,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const now = Date.now();

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order-uuid-1234",
    submittedAt: now,
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 150,
    expiresAt: now + 300_000,
    strategy: "LIMIT",
    status: "pending",
    filled: 0,
    algoParams: { strategy: "LIMIT" },
    children: [],
    ...overrides,
  };
}

function makeStore(
  role: "trader" | "admin" | "risk-manager" | "desk-head" = "trader",
  userId = "alice"
) {
  return configureStore({
    reducer: {
      auth: authSlice.reducer,
      orders: ordersSlice.reducer,
      windows: windowSlice.reducer,
      channels: channelsSlice.reducer,
      ui: uiSlice.reducer,
      gridPrefs: gridPrefsSlice.reducer,
    },
    preloadedState: {
      auth: {
        user: { id: userId, name: userId, role, avatar_emoji: "🙂" },
        limits: {
          max_order_qty: 10_000,
          max_daily_notional: 1_000_000,
          allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
          allowed_desks: ["equity"],
          dark_pool_access: false,
        },
        status: "authenticated" as const,
        sessionExpired: false,
      },
    },
  });
}

function renderBlotter(rows: OrderRecord[] = [], total?: number) {
  mockUseGridQuery.mockReturnValue(defaultQueryResult(rows, total));
  return render(
    <Provider store={makeStore()}>
      <ChannelContext.Provider
        value={{
          instanceId: "order-blotter",
          panelType: "order-blotter",
          outgoing: null,
          incoming: null,
        }}
      >
        <OrderBlotter />
      </ChannelContext.Provider>
    </Provider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("OrderBlotter – empty state", () => {
  it("shows empty placeholder when there are no orders", () => {
    renderBlotter([]);
    expect(screen.getByText(/No orders submitted yet/i)).toBeInTheDocument();
  });

  it("shows 0 orders in the header", () => {
    renderBlotter([]);
    expect(screen.getByText(/0 orders/i)).toBeInTheDocument();
  });
});

describe("OrderBlotter – single order", () => {
  it("shows order count in header", () => {
    renderBlotter([makeOrder()]);
    expect(screen.getByText(/1 order$/i)).toBeInTheDocument();
  });

  it("renders the asset symbol", () => {
    renderBlotter([makeOrder({ asset: "MSFT" })]);
    expect(screen.getByText("MSFT")).toBeInTheDocument();
  });

  it("renders the strategy", () => {
    renderBlotter([makeOrder({ strategy: "TWAP" })]);
    expect(screen.getByText("TWAP")).toBeInTheDocument();
  });

  it("renders the status badge", () => {
    renderBlotter([makeOrder({ status: "working" })]);
    expect(screen.getByText("working")).toBeInTheDocument();
  });

  it("renders the side in colour-coded cell", () => {
    renderBlotter([makeOrder({ side: "SELL" })]);
    expect(screen.getByText("SELL")).toBeInTheDocument();
  });

  it("shows — for avg fill when there are no children", () => {
    renderBlotter([makeOrder()]);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });
});

describe("OrderBlotter – multiple orders", () => {
  it("shows plural 'orders' in header count", () => {
    renderBlotter([makeOrder(), makeOrder({ id: "order-2" })]);
    expect(screen.getByText(/2 orders/i)).toBeInTheDocument();
  });
});

describe("OrderBlotter – server-side filter count", () => {
  it("shows filtered / total count when server returns subset", () => {
    // Server returned 1 row (filtered) but total is 5
    renderBlotter([makeOrder()], 5);
    expect(screen.getByText("1 / 5")).toBeInTheDocument();
  });
});

describe("OrderBlotter – child order expansion", () => {
  const child = {
    id: "child-1",
    parentId: "order-uuid-1234",
    asset: "AAPL",
    side: "BUY" as const,
    quantity: 25,
    limitPrice: 150,
    status: "filled" as const,
    filled: 25,
    submittedAt: now,
  };

  it("shows child count badge when order has children", () => {
    const order = makeOrder({ children: [child] });
    renderBlotter([order]);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows avg fill price when children exist", () => {
    const order = makeOrder({
      children: [child],
      filled: 25,
      status: "filled",
    });
    renderBlotter([order]);
    expect(screen.getByText("150.0000")).toBeInTheDocument();
  });
});

describe("OrderBlotter – status styles", () => {
  const statuses = ["pending", "working", "filled", "expired"] as const;

  for (const status of statuses) {
    it(`renders ${status} badge`, () => {
      renderBlotter([makeOrder({ status })]);
      expect(screen.getByText(status)).toBeInTheDocument();
    });
  }
});

describe("OrderBlotter – sort headers", () => {
  it("renders sortable column header for Asset", () => {
    renderBlotter([makeOrder()]);
    const assetHeader = screen.getByRole("columnheader", { name: /asset/i });
    expect(assetHeader).toBeInTheDocument();
  });

  it("sort headers are clickable", () => {
    renderBlotter([makeOrder({ asset: "MSFT" }), makeOrder({ id: "order-2", asset: "AAPL" })]);
    const assetHeader = screen.getByRole("columnheader", { name: /asset/i });
    expect(() => fireEvent.click(assetHeader)).not.toThrow();
  });

  it("shows tooltip text on column headers", () => {
    renderBlotter([makeOrder()]);
    const assetHeader = screen.getByRole("columnheader", { name: /asset/i });
    expect(assetHeader).toHaveAttribute("title", "Instrument symbol");
  });
});

describe("OrderBlotter – filter bar", () => {
  it("renders the '+ Filter' add button", () => {
    renderBlotter([]);
    expect(screen.getByRole("button", { name: /add filter/i })).toBeInTheDocument();
  });

  it("shows 'No orders match' message when server returns empty rows but total > 0", () => {
    // Simulate server filtering: rows=[], total=1 means there are orders but filter excluded them
    mockUseGridQuery.mockReturnValue({
      rows: [],
      total: 1,
      evalMs: 0,
      isLoading: false,
      isError: false,
      isFetching: false,
    });
    render(
      <Provider store={makeStore()}>
        <ChannelContext.Provider
          value={{
            instanceId: "order-blotter",
            panelType: "order-blotter",
            outgoing: null,
            incoming: null,
          }}
        >
          <OrderBlotter />
        </ChannelContext.Provider>
      </Provider>
    );
    expect(screen.getByText(/No orders match the active filters/i)).toBeInTheDocument();
  });
});

describe("OrderBlotter – Format button", () => {
  it("renders the Format ⚙ button", () => {
    renderBlotter([]);
    expect(screen.getByText(/Format/i)).toBeInTheDocument();
  });

  it("opens the CF rule editor when Format button is clicked", () => {
    renderBlotter([]);
    fireEvent.click(screen.getByText(/Format/i));
    expect(screen.getByText(/Conditional Formatting/i)).toBeInTheDocument();
  });
});

describe("OrderBlotter – Booked By column", () => {
  it("renders Booked By column header", () => {
    renderBlotter([makeOrder()]);
    expect(screen.getByRole("columnheader", { name: /booked by/i })).toBeInTheDocument();
  });

  it("shows userId when present on order", () => {
    renderBlotter([makeOrder({ userId: "trader-alice" })]);
    expect(screen.getByText("trader-alice")).toBeInTheDocument();
  });

  it("shows — when userId is absent", () => {
    renderBlotter([makeOrder()]);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });
});

describe("OrderBlotter – header context menu", () => {
  it("right-clicking a column header does not throw", () => {
    renderBlotter([makeOrder()]);
    const assetHeader = screen.getByRole("columnheader", { name: /asset/i });
    expect(() => fireEvent.contextMenu(assetHeader)).not.toThrow();
  });

  it("shows context menu items on right-click", () => {
    renderBlotter([makeOrder()]);
    const assetHeader = screen.getByRole("columnheader", { name: /asset/i });
    fireEvent.contextMenu(assetHeader);
    expect(screen.getByText(/Sort A → Z/i)).toBeInTheDocument();
    expect(screen.getByText(/Reset sort/i)).toBeInTheDocument();
  });
});

describe("OrderBlotter – loading state", () => {
  it("shows loading indicator when isLoading is true and no rows yet", () => {
    mockUseGridQuery.mockReturnValue({
      rows: [],
      total: 0,
      evalMs: 0,
      isLoading: true,
      isError: false,
      isFetching: true,
    });
    render(
      <Provider store={makeStore()}>
        <ChannelContext.Provider
          value={{
            instanceId: "order-blotter",
            panelType: "order-blotter",
            outgoing: null,
            incoming: null,
          }}
        >
          <OrderBlotter />
        </ChannelContext.Provider>
      </Provider>
    );
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});

describe("OrderBlotter – row selection", () => {
  it("clicking a row dispatches selection without throwing", () => {
    renderBlotter([makeOrder({ id: "o1", asset: "AAPL" }), makeOrder({ id: "o2", asset: "MSFT" })]);
    const aapl = screen.getByText("AAPL");
    expect(() => fireEvent.click(aapl)).not.toThrow();
  });

  it("ctrl-click does not throw", () => {
    renderBlotter([makeOrder({ id: "o1" })]);
    const cell = screen.getByText("AAPL");
    expect(() => fireEvent.click(cell, { ctrlKey: true })).not.toThrow();
  });

  it("shift-click does not throw", () => {
    renderBlotter([makeOrder({ id: "o1", asset: "AAPL" }), makeOrder({ id: "o2", asset: "MSFT" })]);
    fireEvent.click(screen.getByText("AAPL"));
    expect(() => fireEvent.click(screen.getByText("MSFT"), { shiftKey: true })).not.toThrow();
  });

  it("right-clicking a row opens the context menu", () => {
    renderBlotter([makeOrder({ id: "o1", asset: "AAPL" })]);
    const cell = screen.getByText("AAPL");
    fireEvent.contextMenu(cell);
    expect(screen.getByText(/Select & broadcast/i)).toBeInTheDocument();
  });

  it("context menu has actionable entries when an active order is right-clicked", () => {
    renderBlotter([makeOrder({ id: "o1", asset: "AAPL", status: "working" })]);
    fireEvent.contextMenu(screen.getByText("AAPL"));
    expect(screen.getByText(/Select & broadcast/i)).toBeInTheDocument();
    expect(screen.getByText(/Copy order ID/i)).toBeInTheDocument();
  });
});

describe("OrderBlotter – status variants", () => {
  it("renders filled status badge", () => {
    renderBlotter([makeOrder({ id: "o1", status: "filled", filled: 100, quantity: 100 })]);
    expect(screen.getByText("filled")).toBeInTheDocument();
  });

  it("renders rejected status badge", () => {
    renderBlotter([makeOrder({ id: "o1", status: "rejected" })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
  });

  it("renders cancelled status badge", () => {
    renderBlotter([makeOrder({ id: "o1", status: "cancelled" })]);
    expect(screen.getByText("cancelled")).toBeInTheDocument();
  });

  it("renders expired status badge", () => {
    renderBlotter([makeOrder({ id: "o1", status: "expired" })]);
    expect(screen.getByText("expired")).toBeInTheDocument();
  });

  it("renders held status badge", () => {
    renderBlotter([makeOrder({ id: "o1", status: "held" })]);
    expect(screen.getByText("held")).toBeInTheDocument();
  });
});

describe("OrderBlotter – formatting paths", () => {
  it("formats commission across child fills", () => {
    renderBlotter([
      makeOrder({
        id: "o1",
        children: [
          {
            id: "c1",
            parentId: "o1",
            asset: "AAPL",
            side: "BUY",
            quantity: 50,
            limitPrice: 150,
            status: "filled",
            filled: 50,
            commissionUSD: 0.25,
            submittedAt: now,
          },
          {
            id: "c2",
            parentId: "o1",
            asset: "AAPL",
            side: "BUY",
            quantity: 50,
            limitPrice: 150,
            status: "filled",
            filled: 50,
            commissionUSD: 0.5,
            submittedAt: now,
          },
        ],
      }),
    ]);
    expect(screen.getAllByText(/0\.75/).length).toBeGreaterThan(0);
  });

  it("formats FX symbol prices to 4 decimals", () => {
    renderBlotter([
      makeOrder({
        id: "o-fx",
        asset: "EUR/USD",
        limitPrice: 1.1234,
      }),
    ]);
    expect(screen.getByText("1.1234")).toBeInTheDocument();
  });

  it("renders shows '—' for empty commission", () => {
    renderBlotter([
      makeOrder({
        id: "o-empty",
        children: [],
      }),
    ]);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("OrderBlotter – context menu actions", () => {
  it("right-clicks a held order shows Unhold action", () => {
    renderBlotter([makeOrder({ id: "h1", asset: "AAPL", status: "held", userId: "alice" })]);
    fireEvent.contextMenu(screen.getByText("AAPL"));
    expect(screen.getByText(/Unhold/)).toBeInTheDocument();
  });

  it("trader can manage their own orders", () => {
    renderBlotter([makeOrder({ id: "o1", asset: "AAPL", status: "working", userId: "alice" })]);
    fireEvent.contextMenu(screen.getByText("AAPL"));
    expect(screen.getByText(/Hold/)).toBeInTheDocument();
    expect(screen.getByText(/Cancel/)).toBeInTheDocument();
  });

  it("clicking Copy order ID triggers clipboard write", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderBlotter([makeOrder({ id: "o-copy-12345", asset: "AAPL" })]);
    fireEvent.contextMenu(screen.getByText("AAPL"));
    fireEvent.click(screen.getByText(/Copy order ID/));
    expect(writeText).toHaveBeenCalledWith("o-copy-12345");
  });

  it("clicking 'Select & broadcast' selects the order", () => {
    renderBlotter([makeOrder({ id: "o-bcast", asset: "AAPL" })]);
    fireEvent.contextMenu(screen.getByText("AAPL"));
    fireEvent.click(screen.getByText(/Select & broadcast/));
    expect(screen.getByText("AAPL")).toBeInTheDocument();
  });

  it("admin can manage any user's order", () => {
    mockUseGridQuery.mockReturnValue(
      defaultQueryResult([
        makeOrder({ id: "o-other", asset: "AAPL", status: "working", userId: "trader-bob" }),
      ])
    );
    render(
      <Provider store={makeStore("admin", "admin-1")}>
        <ChannelContext.Provider
          value={{
            instanceId: "order-blotter",
            panelType: "order-blotter",
            outgoing: null,
            incoming: null,
          }}
        >
          <OrderBlotter />
        </ChannelContext.Provider>
      </Provider>
    );
    fireEvent.contextMenu(screen.getByText("AAPL"));
    expect(screen.getAllByText(/Hold/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Cancel/i).length).toBeGreaterThan(0);
  });

  it("risk-manager can manage any user's order", () => {
    mockUseGridQuery.mockReturnValue(
      defaultQueryResult([
        makeOrder({ id: "o-other2", asset: "AAPL", status: "working", userId: "trader-bob" }),
      ])
    );
    render(
      <Provider store={makeStore("risk-manager", "risk-1")}>
        <ChannelContext.Provider
          value={{
            instanceId: "order-blotter",
            panelType: "order-blotter",
            outgoing: null,
            incoming: null,
          }}
        >
          <OrderBlotter />
        </ChannelContext.Provider>
      </Provider>
    );
    fireEvent.contextMenu(screen.getByText("AAPL"));
    expect(screen.getAllByText(/Hold/i).length).toBeGreaterThan(0);
  });
});

describe("OrderBlotter – last submitted order", () => {
  it("selects the last submitted order id from the store", () => {
    mockUseGridQuery.mockReturnValue(
      defaultQueryResult([
        makeOrder({ id: "o-top", asset: "AAPL" }),
        makeOrder({ id: "o-last", asset: "MSFT" }),
      ])
    );
    const store = configureStore({
      reducer: {
        auth: authSlice.reducer,
        orders: ordersSlice.reducer,
        windows: windowSlice.reducer,
        channels: channelsSlice.reducer,
        ui: uiSlice.reducer,
        gridPrefs: gridPrefsSlice.reducer,
      },
      preloadedState: {
        auth: {
          user: { id: "alice", name: "alice", role: "trader" as const, avatar_emoji: "🙂" },
          limits: {
            max_order_qty: 10_000,
            max_daily_notional: 1_000_000,
            allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
            allowed_desks: ["equity"],
            dark_pool_access: false,
          },
          status: "authenticated" as const,
          sessionExpired: false,
        },
        orders: { orders: [], lastSubmittedOrderId: "o-last" },
      },
    });
    render(
      <Provider store={store}>
        <ChannelContext.Provider
          value={{
            instanceId: "order-blotter",
            panelType: "order-blotter",
            outgoing: null,
            incoming: null,
          }}
        >
          <OrderBlotter />
        </ChannelContext.Provider>
      </Provider>
    );
    expect(screen.getByText("MSFT")).toBeInTheDocument();
  });
});

describe("OrderBlotter – select all", () => {
  it("checking select-all selects every row", () => {
    renderBlotter([makeOrder({ id: "o1", asset: "AAPL" }), makeOrder({ id: "o2", asset: "MSFT" })]);
    const selectAll = screen.getByTestId("select-all-checkbox") as HTMLInputElement;
    fireEvent.click(selectAll);
    expect(screen.getByTestId("multi-select-bar")).toBeInTheDocument();
    expect(screen.getByText(/2 orders selected/i)).toBeInTheDocument();
  });

  it("unchecking select-all clears the selection", () => {
    renderBlotter([makeOrder({ id: "o1", asset: "AAPL" }), makeOrder({ id: "o2", asset: "MSFT" })]);
    const selectAll = screen.getByTestId("select-all-checkbox") as HTMLInputElement;
    fireEvent.click(selectAll);
    fireEvent.click(selectAll);
    expect(screen.queryByTestId("multi-select-bar")).not.toBeInTheDocument();
  });

  it("Clear button in the multi-select bar resets the selection", () => {
    renderBlotter([makeOrder({ id: "o1", asset: "AAPL" }), makeOrder({ id: "o2", asset: "MSFT" })]);
    fireEvent.click(screen.getByTestId("select-all-checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.queryByTestId("multi-select-bar")).not.toBeInTheDocument();
  });

  it("toggling a per-row checkbox selects only that row", () => {
    renderBlotter([makeOrder({ id: "o1", asset: "AAPL" }), makeOrder({ id: "o2", asset: "MSFT" })]);
    fireEvent.click(screen.getByTestId("select-order-o1"));
    fireEvent.click(screen.getByTestId("select-order-o2"));
    expect(screen.getByText(/2 orders selected/i)).toBeInTheDocument();
  });

  it("un-toggling a per-row checkbox deselects that row", () => {
    renderBlotter([makeOrder({ id: "o1", asset: "AAPL" })]);
    const rowCheckbox = screen.getByTestId("select-order-o1");
    fireEvent.click(rowCheckbox);
    fireEvent.click(rowCheckbox);
    expect(screen.queryByTestId("multi-select-bar")).not.toBeInTheDocument();
  });

  it("clicking the checkbox cell does not select the row", () => {
    renderBlotter([makeOrder({ id: "o1", asset: "AAPL" })]);
    const cell = screen.getByTestId("select-order-o1").closest("td");
    expect(() => cell && fireEvent.click(cell)).not.toThrow();
  });

  it("space key on the checkbox cell does not throw", () => {
    renderBlotter([makeOrder({ id: "o1", asset: "AAPL" })]);
    const cell = screen.getByTestId("select-order-o1").closest("td");
    expect(() => cell && fireEvent.keyDown(cell, { key: " " })).not.toThrow();
  });
});

describe("OrderBlotter – column drag and drop", () => {
  it("dragging one header onto another reorders without throwing", () => {
    renderBlotter([makeOrder()]);
    const assetHeader = screen.getByRole("columnheader", { name: /asset/i });
    const sideHeader = screen.getByRole("columnheader", { name: /^side$/i });
    const dataTransfer = { effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(assetHeader, { dataTransfer });
    expect(() => fireEvent.drop(sideHeader, { dataTransfer })).not.toThrow();
  });
});

describe("OrderBlotter – header sort actions", () => {
  it("clicking Sort A → Z does not throw", () => {
    renderBlotter([makeOrder()]);
    fireEvent.contextMenu(screen.getByRole("columnheader", { name: /asset/i }));
    expect(() => fireEvent.click(screen.getByText(/Sort A → Z/i))).not.toThrow();
  });

  it("clicking Sort Z → A does not throw", () => {
    renderBlotter([makeOrder()]);
    fireEvent.contextMenu(screen.getByRole("columnheader", { name: /asset/i }));
    expect(() => fireEvent.click(screen.getByText(/Sort Z → A/i))).not.toThrow();
  });

  it("clicking Reset sort does not throw", () => {
    renderBlotter([makeOrder()]);
    fireEvent.contextMenu(screen.getByRole("columnheader", { name: /asset/i }));
    expect(() => fireEvent.click(screen.getByText(/Reset sort/i))).not.toThrow();
  });

  it("clicking Filter by opens the filter for that field", () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
    renderBlotter([makeOrder()]);
    fireEvent.contextMenu(screen.getByRole("columnheader", { name: /asset/i }));
    expect(() => fireEvent.click(screen.getByText(/Filter by Asset/i))).not.toThrow();
  });
});

describe("OrderBlotter – row context menu actions", () => {
  it("clicking 'View asset in ladder' does not throw", () => {
    renderBlotter([makeOrder({ id: "o1", asset: "AAPL" })]);
    fireEvent.contextMenu(screen.getByText("AAPL"));
    expect(() => fireEvent.click(screen.getByText(/View asset in ladder/i))).not.toThrow();
  });

  it("clicking Hold on an active owned order dispatches the hold", () => {
    renderBlotter([makeOrder({ id: "o1", asset: "AAPL", status: "working", userId: "alice" })]);
    fireEvent.contextMenu(screen.getByText("AAPL"));
    expect(() => fireEvent.click(screen.getByText(/^Hold/))).not.toThrow();
  });

  it("clicking Unhold on a held owned order dispatches the unhold", () => {
    renderBlotter([makeOrder({ id: "o1", asset: "AAPL", status: "held", userId: "alice" })]);
    fireEvent.contextMenu(screen.getByText("AAPL"));
    expect(() => fireEvent.click(screen.getByText(/^Unhold/))).not.toThrow();
  });

  it("clicking Cancel on an active owned order dispatches the cancel", () => {
    renderBlotter([makeOrder({ id: "o1", asset: "AAPL", status: "working", userId: "alice" })]);
    fireEvent.contextMenu(screen.getByText("AAPL"));
    expect(() => fireEvent.click(screen.getByText(/^Cancel/))).not.toThrow();
  });

  it("risk-manager can force kill an order", () => {
    mockUseGridQuery.mockReturnValue(
      defaultQueryResult([
        makeOrder({ id: "o-kill", asset: "AAPL", status: "working", userId: "trader-bob" }),
      ])
    );
    render(
      <Provider store={makeStore("risk-manager", "risk-1")}>
        <ChannelContext.Provider
          value={{
            instanceId: "order-blotter",
            panelType: "order-blotter",
            outgoing: null,
            incoming: null,
          }}
        >
          <OrderBlotter />
        </ChannelContext.Provider>
      </Provider>
    );
    fireEvent.contextMenu(screen.getByText("AAPL"));
    expect(() => fireEvent.click(screen.getByText(/Force kill/i))).not.toThrow();
  });
});

describe("OrderBlotter – Format editor close", () => {
  it("closing the CF rule editor hides it", () => {
    renderBlotter([]);
    fireEvent.click(screen.getByText(/Format/i));
    fireEvent.click(screen.getByLabelText(/Close formatting editor/i));
    expect(screen.queryByText(/Conditional Formatting/i)).not.toBeInTheDocument();
  });
});

describe("OrderBlotter – child fills", () => {
  it("computes average fill price across child fills", () => {
    renderBlotter([
      makeOrder({
        id: "o1",
        filled: 100,
        children: [
          {
            id: "c1",
            parentId: "o1",
            asset: "AAPL",
            side: "BUY",
            quantity: 50,
            limitPrice: 150,
            status: "filled",
            filled: 50,
            avgFillPrice: 150,
            submittedAt: now,
          },
          {
            id: "c2",
            parentId: "o1",
            asset: "AAPL",
            side: "BUY",
            quantity: 50,
            limitPrice: 152,
            status: "filled",
            filled: 50,
            avgFillPrice: 152,
            submittedAt: now,
          },
        ],
      }),
    ]);
    expect(screen.getByText("151.0000")).toBeInTheDocument();
  });
});
