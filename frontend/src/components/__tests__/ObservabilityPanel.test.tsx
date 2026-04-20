import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { observabilitySlice } from "../../store/observabilitySlice";
import { ordersSlice } from "../../store/ordersSlice";
import { windowSlice } from "../../store/windowSlice";
import type { ObsEvent } from "../../types";
import { ObservabilityPanel } from "../ObservabilityPanel";

function makeEvent(overrides: Partial<ObsEvent> = {}): ObsEvent {
  return {
    type: "order_submitted",
    ts: Date.now(),
    payload: { orderId: "order-1" },
    ...overrides,
  };
}

function makeStore(events: ObsEvent[] = []) {
  return configureStore({
    reducer: {
      observability: observabilitySlice.reducer,
      orders: ordersSlice.reducer,
      windows: windowSlice.reducer,
    },
    preloadedState: {
      observability: { events },
    },
  });
}

function renderPanel(events: ObsEvent[] = []) {
  return render(
    <Provider store={makeStore(events)}>
      <ObservabilityPanel />
    </Provider>
  );
}

function clickEventsTab() {
  fireEvent.click(screen.getByRole("button", { name: /Events/i }));
}

describe("ObservabilityPanel – empty state", () => {
  it("renders the Observability header", () => {
    renderPanel();
    // Summary tab is default, shows the panel is rendered
    expect(screen.getByText(/Summary/i)).toBeInTheDocument();
  });

  it("shows 'No events yet' when empty on Events tab", () => {
    renderPanel();
    clickEventsTab();
    expect(screen.getByText(/No events yet/i)).toBeInTheDocument();
  });

  it("renders the Export button on Events tab", () => {
    renderPanel();
    clickEventsTab();
    expect(screen.getByRole("button", { name: /Export/i })).toBeInTheDocument();
  });
});

describe("ObservabilityPanel – with events", () => {
  it("renders event type label on Events tab", () => {
    renderPanel([makeEvent({ type: "order_submitted" })]);
    clickEventsTab();
    expect(screen.getByText("order_submitted")).toBeInTheDocument();
  });

  it("renders multiple events on Events tab", () => {
    renderPanel([
      makeEvent({ type: "order_submitted" }),
      makeEvent({ type: "child_created" }),
      makeEvent({ type: "order_patch" }),
    ]);
    clickEventsTab();
    expect(screen.getByText("order_submitted")).toBeInTheDocument();
    expect(screen.getByText("child_created")).toBeInTheDocument();
    expect(screen.getByText("order_patch")).toBeInTheDocument();
  });

  it("renders payload as formatted JSON on Events tab", () => {
    renderPanel([makeEvent({ payload: { orderId: "abc-123" } })]);
    clickEventsTab();
    expect(screen.getByText(/abc-123/)).toBeInTheDocument();
  });

  it("shows — for timestamp when event has no ts", () => {
    renderPanel([makeEvent({ ts: undefined })]);
    clickEventsTab();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("ObservabilityPanel – Export button", () => {
  it("calls window.open with a blob URL on export click", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      value: createObjectURL,
      writable: true,
      configurable: true,
    });

    renderPanel([makeEvent()]);
    clickEventsTab();
    fireEvent.click(screen.getByRole("button", { name: /Export/i }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith("blob:mock-url", "_blank");

    openSpy.mockRestore();
  });
});

describe("ObservabilityPanel – event cap", () => {
  it("renders at most 100 events in the list", () => {
    const events: ObsEvent[] = Array.from({ length: 150 }, (_, i) =>
      makeEvent({ type: `event_${i}`, ts: Date.now() + i })
    );
    renderPanel(events);
    clickEventsTab();
    // event_0 (first in array = newest) is shown
    expect(screen.getByText("event_0")).toBeInTheDocument();
    // event_149 (101st+) should NOT be shown (cap is 100)
    expect(screen.queryByText("event_149")).not.toBeInTheDocument();
  });
});

describe("ObservabilityPanel – Summary tab", () => {
  it("shows Total Orders stat", () => {
    renderPanel();
    expect(screen.getByText(/Total Orders/i)).toBeInTheDocument();
  });

  it("shows Trades tab button", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /Trades/i })).toBeInTheDocument();
  });
});

describe("ObservabilityPanel – Trades tab", () => {
  function makeOrder(
    id: string,
    status: "filled" | "working" | "pending"
  ): import("../../types").OrderRecord {
    return {
      id,
      submittedAt: Date.now() - 5000,
      asset: "AAPL",
      side: "BUY",
      quantity: 100,
      limitPrice: 150,
      expiresAt: Date.now() + 300_000,
      strategy: "TWAP",
      status,
      filled: status === "filled" ? 100 : 0,
      algoParams: { strategy: "TWAP", numSlices: 2, participationCap: 0.1 },
      children:
        status === "filled"
          ? [
              {
                id: `${id}-c1`,
                parentId: id,
                asset: "AAPL",
                side: "BUY",
                quantity: 100,
                limitPrice: 150,
                status: "filled",
                filled: 100,
                submittedAt: Date.now() - 3000,
                avgFillPrice: 149.5,
                commissionUSD: 1.5,
              },
            ]
          : [],
    };
  }

  function makeStoreWithOrders(orders: import("../../types").OrderRecord[]) {
    return configureStore({
      reducer: {
        observability: observabilitySlice.reducer,
        orders: ordersSlice.reducer,
        windows: windowSlice.reducer,
      },
      preloadedState: {
        observability: { events: [] },
        orders: { orders, lastSubmittedOrderId: null },
      },
    });
  }

  function renderPanelWithOrders(orders: import("../../types").OrderRecord[]) {
    return render(
      <Provider store={makeStoreWithOrders(orders)}>
        <ObservabilityPanel />
      </Provider>
    );
  }

  it("switches to Trades tab when clicked", () => {
    renderPanelWithOrders([makeOrder("o1", "filled")]);
    fireEvent.click(screen.getByRole("button", { name: /Trades/i }));
    expect(screen.getByText("Asset")).toBeInTheDocument();
  });

  it("renders a filled order row on the Trades tab", () => {
    renderPanelWithOrders([makeOrder("o1", "filled")]);
    fireEvent.click(screen.getByRole("button", { name: /Trades/i }));
    expect(screen.getAllByText("AAPL").length).toBeGreaterThan(0);
  });

  it("shows empty state on Trades tab when no filled orders", () => {
    renderPanelWithOrders([makeOrder("o1", "working")]);
    fireEvent.click(screen.getByRole("button", { name: /Trades/i }));
    expect(screen.getByText(/No trades yet/i)).toBeInTheDocument();
  });

  it("shows Fill Rate stat on Summary tab with mixed orders", () => {
    renderPanelWithOrders([makeOrder("o1", "filled"), makeOrder("o2", "working")]);
    expect(screen.getByText(/Filled/i)).toBeInTheDocument();
    expect(screen.getByText(/Active/i)).toBeInTheDocument();
  });
});
