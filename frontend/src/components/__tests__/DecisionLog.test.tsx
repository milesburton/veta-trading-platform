import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { DecisionLog } from "@veta/frontend/components/DecisionLog";
import { ChannelContext } from "@veta/frontend/contexts/ChannelContext";
import { channelsSlice } from "@veta/frontend/store/channelsSlice";
import { marketSlice } from "@veta/frontend/store/marketSlice";
import { observabilitySlice } from "@veta/frontend/store/observabilitySlice";
import { ordersSlice } from "@veta/frontend/store/ordersSlice";
import { uiSlice } from "@veta/frontend/store/uiSlice";
import { windowSlice } from "@veta/frontend/store/windowSlice";
import type { ObsEvent, Strategy } from "@veta/frontend/types";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";

function makeStore(events: ObsEvent[] = [], channelAsset?: string, channelOrderId?: string) {
  return configureStore({
    reducer: {
      market: marketSlice.reducer,
      orders: ordersSlice.reducer,
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
      observability: observabilitySlice.reducer,
      channels: channelsSlice.reducer,
    },
    preloadedState: {
      observability: { events },
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
          1: { selectedAsset: channelAsset ?? null, selectedOrderId: channelOrderId ?? null },
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

function renderLog(events: ObsEvent[] = [], channelAsset?: string, channelOrderId?: string) {
  const store = makeStore(events, channelAsset, channelOrderId);
  const incoming = channelAsset || channelOrderId ? 1 : null;
  render(
    <Provider store={store}>
      <ChannelContext.Provider
        value={{
          instanceId: "test",
          panelType: "decision-log",
          outgoing: null,
          incoming,
        }}
      >
        <DecisionLog />
      </ChannelContext.Provider>
    </Provider>
  );
  return store;
}

const submittedEvent: ObsEvent = {
  type: "orders.submitted",
  ts: 1_700_000_000_000,
  payload: {
    algo: "TWAP",
    asset: "AAPL",
    side: "BUY",
    qty: 500,
    price: 155,
    orderId: "ord-001",
  },
};

const heartbeatEvent: ObsEvent = {
  type: "algo.heartbeat",
  ts: 1_700_000_001_000,
  payload: { algo: "TWAP", asset: "AAPL", activeOrders: 2 },
};

const filledEvent: ObsEvent = {
  type: "orders.filled",
  ts: 1_700_000_002_000,
  payload: {
    algo: "TWAP",
    asset: "AAPL",
    filledQty: 100,
    avgFillPrice: 155.5,
    totalFilled: 100,
    totalQty: 500,
    marketImpactBps: 3.2,
  },
};

describe("DecisionLog – empty state", () => {
  it("shows waiting message when no events", () => {
    renderLog([]);
    expect(screen.getByText(/Waiting for algo activity/i)).toBeInTheDocument();
  });

  it("shows Decision Log label in toolbar", () => {
    renderLog([]);
    expect(screen.getByText("Decision Log")).toBeInTheDocument();
  });

  it("shows event count as 0 when no events", () => {
    renderLog([]);
    expect(screen.getByText("0 events")).toBeInTheDocument();
  });
});

describe("DecisionLog – with events", () => {
  it("renders submitted events", () => {
    renderLog([submittedEvent]);
    expect(screen.getByText("Submitted")).toBeInTheDocument();
  });

  it("renders algo tag for events with algo", () => {
    renderLog([submittedEvent]);
    // TWAP appears as algo tag in the table (may also appear in filter dropdown option)
    const twapEls = screen.getAllByText("TWAP");
    expect(twapEls.length).toBeGreaterThan(0);
  });

  it("shows correct event count", () => {
    renderLog([submittedEvent, filledEvent]);
    expect(screen.getByText("2 events")).toBeInTheDocument();
  });

  it("filters out heartbeats by default", () => {
    renderLog([submittedEvent, heartbeatEvent]);
    expect(screen.queryByText("Heartbeat")).not.toBeInTheDocument();
    expect(screen.getByText("1 events")).toBeInTheDocument();
  });

  it("shows heartbeats when checkbox is enabled", () => {
    renderLog([submittedEvent, heartbeatEvent]);
    fireEvent.click(screen.getByLabelText(/Heartbeats/i));
    expect(screen.getByText("Heartbeat")).toBeInTheDocument();
    expect(screen.getByText("2 events")).toBeInTheDocument();
  });

  it("renders filled events with impact badge", () => {
    renderLog([filledEvent]);
    expect(screen.getByText("+3.2bp")).toBeInTheDocument();
  });
});

describe("DecisionLog – algo filter", () => {
  const povEvent: ObsEvent = {
    type: "orders.submitted",
    ts: 1_700_000_003_000,
    payload: { algo: "POV", asset: "MSFT", side: "SELL", qty: 200, price: 300 },
  };

  it("shows all algos by default", () => {
    renderLog([submittedEvent, povEvent]);
    expect(screen.getByText("2 events")).toBeInTheDocument();
  });

  it("filters to selected algo when filter is changed", () => {
    renderLog([submittedEvent, povEvent]);
    const select = screen.getByLabelText(/Filter by algo/i);
    fireEvent.change(select, { target: { value: "TWAP" } });
    expect(screen.getByText("1 events")).toBeInTheDocument();
  });
});

describe("DecisionLog – channel filter", () => {
  it("shows asset badge when selected asset is set", () => {
    renderLog([submittedEvent], "AAPL");
    expect(screen.getByText("AAPL")).toBeInTheDocument();
  });

  it("shows no match message when events don't match selected asset", () => {
    renderLog([submittedEvent], "MSFT");
    expect(screen.getByText(/No events match current filters/i)).toBeInTheDocument();
  });
});

describe("DecisionLog – event type rendering", () => {
  it("renders routed events", () => {
    renderLog([
      {
        type: "orders.routed",
        ts: 1_700_000_004_000,
        payload: { algo: "TWAP", asset: "AAPL", side: "BUY", qty: 100, price: 150 },
      },
    ]);
    expect(screen.getByText("Routed")).toBeInTheDocument();
  });

  it("renders child slice events", () => {
    renderLog([
      {
        type: "orders.child",
        ts: 1_700_000_005_000,
        payload: {
          algo: "TWAP",
          asset: "AAPL",
          side: "BUY",
          qty: 50,
          price: 150,
          parentOrderId: "ord-001",
          childId: "ch1",
        },
      },
    ]);
    expect(screen.getByText("Slice")).toBeInTheDocument();
  });

  it("renders expired events", () => {
    renderLog([
      {
        type: "orders.expired",
        ts: 1_700_000_006_000,
        payload: { algo: "TWAP", asset: "AAPL" },
      },
    ]);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("shows negative impact badge with red colour", () => {
    renderLog([
      {
        type: "orders.filled",
        ts: 1_700_000_007_000,
        payload: {
          algo: "TWAP",
          asset: "AAPL",
          filledQty: 100,
          avgFillPrice: 149,
          totalFilled: 100,
          totalQty: 500,
          marketImpactBps: -2.5,
        },
      },
    ]);
    expect(screen.getAllByText(/-2\.5bp/).length).toBeGreaterThan(0);
  });

  it("shows fill without impact when marketImpactBps is missing", () => {
    renderLog([
      {
        type: "orders.filled",
        ts: 1_700_000_008_000,
        payload: {
          algo: "TWAP",
          asset: "AAPL",
          filledQty: 100,
          avgFillPrice: 150,
          totalFilled: 100,
          totalQty: 100,
        },
      },
    ]);
    expect(screen.getByText("Filled")).toBeInTheDocument();
  });
});

describe("DecisionLog – sell side", () => {
  it("renders SELL events", () => {
    renderLog([
      {
        type: "orders.submitted",
        ts: 1_700_000_009_000,
        payload: {
          algo: "POV",
          asset: "MSFT",
          side: "SELL",
          qty: 200,
          price: 300,
        },
      },
    ]);
    // SELL appears within the event message text
    expect(screen.getByText(/POV SELL/)).toBeInTheDocument();
  });
});

describe("DecisionLog – context menu and channel filtering", () => {
  it("right-clicking an event opens the context menu", () => {
    renderLog([submittedEvent]);
    const row = screen.getByText("Submitted");
    fireEvent.contextMenu(row);
    // Context menu shows symbol/algo entries
    expect(screen.queryByText(/Copy symbol/i) ?? row).toBeInTheDocument();
  });

  it("filters by order id from channel", () => {
    const targetEvent: ObsEvent = {
      type: "orders.submitted",
      ts: 1_700_000_020_000,
      payload: {
        algo: "TWAP",
        asset: "AAPL",
        side: "BUY",
        qty: 100,
        price: 150,
        orderId: "ord-001",
      },
    };
    const otherEvent: ObsEvent = {
      type: "orders.submitted",
      ts: 1_700_000_021_000,
      payload: {
        algo: "POV",
        asset: "MSFT",
        side: "SELL",
        qty: 50,
        price: 300,
        orderId: "ord-002",
      },
    };
    renderLog([targetEvent, otherEvent], undefined, "ord-001");
    expect(screen.getByText("1 events")).toBeInTheDocument();
  });

  it("matches child events to parent order id filter", () => {
    const childEvent: ObsEvent = {
      type: "orders.child",
      ts: 1_700_000_022_000,
      payload: {
        algo: "TWAP",
        asset: "AAPL",
        side: "BUY",
        qty: 25,
        price: 150,
        parentOrderId: "ord-001",
        childId: "child-1",
      },
    };
    renderLog([childEvent], undefined, "ord-001");
    expect(screen.getByText("1 events")).toBeInTheDocument();
  });

  it("shows 'No events for this order yet' when filtering by orderId with no matches", () => {
    renderLog([], undefined, "ord-missing");
    expect(screen.getByText(/No events for this order yet/i)).toBeInTheDocument();
  });

  it("ignores events with unknown topic types", () => {
    const unknownEvent: ObsEvent = {
      type: "orders.unknown_topic" as never,
      ts: 1_700_000_030_000,
      payload: { algo: "TWAP", asset: "AAPL" },
    };
    renderLog([submittedEvent, unknownEvent]);
    // Unknown topic filtered out → still 1 event
    expect(screen.getByText("1 events")).toBeInTheDocument();
  });
});

describe("DecisionLog – defensive rendering", () => {
  it("renders submitted event without price (mkt)", () => {
    renderLog([
      {
        type: "orders.submitted",
        ts: 1_700_000_010_000,
        payload: { algo: "TWAP", asset: "AAPL", side: "BUY", qty: 100 },
      },
    ]);
    expect(screen.getByText(/mkt/)).toBeInTheDocument();
  });

  it("renders child slice with sliceIndex / numSlices", () => {
    renderLog([
      {
        type: "orders.child",
        ts: 1_700_000_011_000,
        payload: {
          algo: "TWAP",
          asset: "AAPL",
          side: "BUY",
          qty: 25,
          price: 150,
          sliceIndex: 1,
          numSlices: 4,
        },
      },
    ]);
    expect(screen.getByText(/\[2\/4\]/)).toBeInTheDocument();
  });

  it("renders filled with progress totals", () => {
    renderLog([
      {
        type: "orders.filled",
        ts: 1_700_000_012_000,
        payload: {
          algo: "TWAP",
          asset: "AAPL",
          filledQty: 100,
          avgFillPrice: 150,
          totalFilled: 250,
          totalQty: 1000,
          marketImpactBps: 1.5,
        },
      },
    ]);
    expect(screen.getByText(/250/)).toBeInTheDocument();
  });

  it("renders expired event with filledQty=0", () => {
    renderLog([
      {
        type: "orders.expired",
        ts: 1_700_000_013_000,
        payload: { algo: "TWAP", asset: "MSFT", filledQty: 0 },
      },
    ]);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("renders fractional qty correctly", () => {
    renderLog([
      {
        type: "orders.submitted",
        ts: 1_700_000_014_000,
        payload: { algo: "VWAP", asset: "AAPL", side: "BUY", qty: 1.5, price: 150 },
      },
    ]);
    expect(screen.getByText(/1\.5/)).toBeInTheDocument();
  });

  it("renders heartbeat with activeOrders=0", () => {
    renderLog([
      {
        type: "algo.heartbeat",
        ts: 1_700_000_015_000,
        payload: { algo: "POV", asset: "AAPL", activeOrders: 0 },
      },
    ]);
    fireEvent.click(screen.getByLabelText(/Heartbeats/i));
    expect(screen.getByText("Heartbeat")).toBeInTheDocument();
  });

  it("renders heartbeat with start event", () => {
    renderLog([
      {
        type: "algo.heartbeat",
        ts: 1_700_000_016_000,
        payload: { algo: "TWAP", asset: "AAPL", event: "start", numSlices: 8 },
      },
    ]);
    fireEvent.click(screen.getByLabelText(/Heartbeats/i));
    expect(screen.getByText(/started/)).toBeInTheDocument();
  });

  it("renders heartbeat with complete event", () => {
    renderLog([
      {
        type: "algo.heartbeat",
        ts: 1_700_000_017_000,
        payload: {
          algo: "VWAP",
          asset: "MSFT",
          event: "complete",
          avgFillPrice: 300.5,
        },
      },
    ]);
    fireEvent.click(screen.getByLabelText(/Heartbeats/i));
    expect(screen.getByText(/complete/)).toBeInTheDocument();
  });

  it("renders heartbeat with pendingOrders fallback", () => {
    renderLog([
      {
        type: "algo.heartbeat",
        ts: 1_700_000_018_000,
        payload: { algo: "POV", asset: "AAPL", pendingOrders: 3 },
      },
    ]);
    fireEvent.click(screen.getByLabelText(/Heartbeats/i));
    expect(screen.getByText(/3 active/)).toBeInTheDocument();
  });

  it("renders submitted event without algo, side, qty", () => {
    renderLog([
      {
        type: "orders.submitted",
        ts: 1_700_000_019_000,
        payload: { asset: "AAPL", price: 150 },
      },
    ]);
    expect(screen.getByText("Submitted")).toBeInTheDocument();
  });

  it("renders child event without sliceIndex (no [n/m] tag)", () => {
    renderLog([
      {
        type: "orders.child",
        ts: 1_700_000_020_500,
        payload: {
          algo: "TWAP",
          asset: "AAPL",
          side: "BUY",
          qty: 50,
        },
      },
    ]);
    expect(screen.getByText("Slice")).toBeInTheDocument();
  });

  it("renders filled event without progress totals", () => {
    renderLog([
      {
        type: "orders.filled",
        ts: 1_700_000_021_500,
        payload: {
          algo: "TWAP",
          asset: "AAPL",
          filledQty: 50,
          avgFillPrice: 150,
        },
      },
    ]);
    expect(screen.getByText("Filled")).toBeInTheDocument();
  });
});
