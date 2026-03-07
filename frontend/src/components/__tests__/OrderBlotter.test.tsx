import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { ChannelContext } from "../../contexts/ChannelContext";
import { channelsSlice } from "../../store/channelsSlice";
import { gridPrefsSlice } from "../../store/gridPrefsSlice";
import { ordersSlice } from "../../store/ordersSlice";
import { uiSlice } from "../../store/uiSlice";
import { windowSlice } from "../../store/windowSlice";
import type { OrderRecord } from "../../types";
import { OrderBlotter } from "../OrderBlotter";

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

function makeStore() {
  return configureStore({
    reducer: {
      orders: ordersSlice.reducer,
      windows: windowSlice.reducer,
      channels: channelsSlice.reducer,
      ui: uiSlice.reducer,
      gridPrefs: gridPrefsSlice.reducer,
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
