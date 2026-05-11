import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { authSlice } from "../../store/authSlice";
import { marketSlice } from "../../store/marketSlice";
import { uiSlice } from "../../store/uiSlice";
import * as orderTicketWindow from "../../utils/orderTicketWindow";
import { QuickTradeBar } from "../QuickTradeBar";

function makeStore(
  opts: { authed?: boolean; role?: "trader" | "admin" } = { authed: true, role: "trader" }
) {
  const store = configureStore({
    reducer: {
      auth: authSlice.reducer,
      market: marketSlice.reducer,
      ui: uiSlice.reducer,
    },
    preloadedState: {
      market: {
        assets: [
          {
            symbol: "AAPL",
            initialPrice: 200,
            volatility: 0.3,
            sector: "Tech",
            lotSize: 1,
            assetClass: "equity" as const,
          },
          {
            symbol: "MSFT",
            initialPrice: 410,
            volatility: 0.25,
            sector: "Tech",
            lotSize: 1,
            assetClass: "equity" as const,
          },
        ],
        prices: { AAPL: 200, MSFT: 410 },
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
  if (opts.authed) {
    store.dispatch({
      type: "auth/setUser",
      payload: { id: "alice", name: "Alice", role: opts.role ?? "trader", avatar_emoji: "👩" },
    });
  }
  return store;
}

function renderBar(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <QuickTradeBar />
    </Provider>
  );
}

describe("QuickTradeBar", () => {
  it("does not render for anonymous visitors", () => {
    renderBar(makeStore({ authed: false }));
    expect(screen.queryByTestId("quick-trade-bar")).toBeNull();
  });

  it("does not render for non-trader roles", () => {
    renderBar(makeStore({ authed: true, role: "admin" }));
    expect(screen.queryByTestId("quick-trade-bar")).toBeNull();
  });

  it("renders for a trader", () => {
    renderBar(makeStore());
    expect(screen.getByTestId("quick-trade-bar")).toBeInTheDocument();
  });

  it("disables Send until input parses", () => {
    renderBar(makeStore());
    const send = screen.getByTestId("quick-trade-send");
    expect(send).toBeDisabled();
    const input = screen.getByTestId("quick-trade-input");
    fireEvent.change(input, { target: { value: "buy 500 aapl @ 200" } });
    expect(send).toBeEnabled();
  });

  it("shows a live preview of the parsed intent", () => {
    renderBar(makeStore());
    fireEvent.change(screen.getByTestId("quick-trade-input"), {
      target: { value: "buy 500 aapl @ 200 twap 30m" },
    });
    expect(screen.getByTestId("quick-trade-preview").textContent).toContain("AAPL");
    expect(screen.getByTestId("quick-trade-preview").textContent).toContain("TWAP");
  });

  it("shows 'no match' when the text cannot be parsed", () => {
    renderBar(makeStore());
    fireEvent.change(screen.getByTestId("quick-trade-input"), {
      target: { value: "hello world" },
    });
    expect(screen.getByTestId("quick-trade-preview").textContent).toContain("no match");
  });

  it("opens the order ticket window with the parsed intent on Send", () => {
    const spy = vi.spyOn(orderTicketWindow, "openOrderTicketWindow").mockImplementation(() => {});
    renderBar(makeStore());
    fireEvent.change(screen.getByTestId("quick-trade-input"), {
      target: { value: "buy 500 aapl @ 200" },
    });
    fireEvent.click(screen.getByTestId("quick-trade-send"));
    expect(spy).toHaveBeenCalledTimes(1);
    const intent = spy.mock.calls[0][1];
    expect(intent).toMatchObject({ side: "BUY", symbol: "AAPL", quantity: 500, limitPrice: 200 });
    spy.mockRestore();
  });

  it("submits on Enter", () => {
    const spy = vi.spyOn(orderTicketWindow, "openOrderTicketWindow").mockImplementation(() => {});
    renderBar(makeStore());
    const input = screen.getByTestId("quick-trade-input");
    fireEvent.change(input, { target: { value: "sell 100 msft @ 412" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("rejects symbols not in the market asset list", () => {
    renderBar(makeStore());
    fireEvent.change(screen.getByTestId("quick-trade-input"), {
      target: { value: "buy 500 unknownsym @ 200" },
    });
    expect(screen.getByTestId("quick-trade-send")).toBeDisabled();
  });
});
