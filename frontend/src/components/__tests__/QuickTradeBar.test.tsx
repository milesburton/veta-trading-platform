import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authSlice } from "../../store/authSlice";
import { marketSlice } from "../../store/marketSlice";
import { uiSlice } from "../../store/uiSlice";
import * as orderTicketWindow from "../../utils/orderTicketWindow";

const parseTicketMock = vi.fn();
const useParseTicketMutationMock = vi.fn();

vi.mock("../../store/parseTicketApi", () => ({
  useParseTicketMutation: () => useParseTicketMutationMock(),
}));

function setMutationResult(opts: { loading?: boolean; result?: unknown; error?: unknown } = {}) {
  parseTicketMock.mockReset();
  if (opts.error) {
    parseTicketMock.mockReturnValue({ unwrap: () => Promise.reject(opts.error) });
  } else if (opts.result !== undefined) {
    parseTicketMock.mockReturnValue({ unwrap: () => Promise.resolve(opts.result) });
  } else {
    parseTicketMock.mockReturnValue({ unwrap: () => Promise.resolve({ error: "noop" }) });
  }
  useParseTicketMutationMock.mockReturnValue([
    parseTicketMock,
    { isLoading: opts.loading ?? false },
  ]);
}

import { QuickTradeBar } from "../QuickTradeBar";

beforeEach(() => {
  setMutationResult();
});

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

describe("QuickTradeBar — visibility", () => {
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
});

describe("QuickTradeBar — regex path", () => {
  it("disables Send until input parses", () => {
    renderBar(makeStore());
    const send = screen.getByTestId("quick-trade-send");
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByTestId("quick-trade-input"), {
      target: { value: "buy 500 aapl @ 200" },
    });
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

  it("opens the order ticket on Send", () => {
    const spy = vi.spyOn(orderTicketWindow, "openOrderTicketWindow").mockImplementation(() => {});
    renderBar(makeStore());
    fireEvent.change(screen.getByTestId("quick-trade-input"), {
      target: { value: "buy 500 aapl @ 200" },
    });
    fireEvent.click(screen.getByTestId("quick-trade-send"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toMatchObject({ side: "BUY", symbol: "AAPL", quantity: 500 });
    spy.mockRestore();
  });

  it("Enter submits when regex matched", () => {
    const spy = vi.spyOn(orderTicketWindow, "openOrderTicketWindow").mockImplementation(() => {});
    renderBar(makeStore());
    const input = screen.getByTestId("quick-trade-input");
    fireEvent.change(input, { target: { value: "sell 100 msft @ 412" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("rejects unknown symbols", () => {
    renderBar(makeStore());
    fireEvent.change(screen.getByTestId("quick-trade-input"), {
      target: { value: "buy 500 unknownsym @ 200" },
    });
    expect(screen.getByTestId("quick-trade-send")).toBeDisabled();
  });
});

describe("QuickTradeBar — LLM fallback", () => {
  it("Ask AI is disabled while regex parse matches", () => {
    renderBar(makeStore());
    fireEvent.change(screen.getByTestId("quick-trade-input"), {
      target: { value: "buy 500 aapl @ 200" },
    });
    expect(screen.getByTestId("quick-trade-ask-ai")).toBeDisabled();
  });

  it("Ask AI is disabled until input is at least 8 chars", () => {
    renderBar(makeStore());
    fireEvent.change(screen.getByTestId("quick-trade-input"), {
      target: { value: "hi" },
    });
    expect(screen.getByTestId("quick-trade-ask-ai")).toBeDisabled();
  });

  it("Ask AI enables for unparseable longer input", () => {
    renderBar(makeStore());
    fireEvent.change(screen.getByTestId("quick-trade-input"), {
      target: { value: "hedge half my aapl into msft" },
    });
    expect(screen.getByTestId("quick-trade-ask-ai")).toBeEnabled();
  });

  it("Ask AI click opens ticket with LLM-returned intent", async () => {
    setMutationResult({
      result: {
        intent: { side: "BUY", symbol: "AAPL", quantity: 300, strategy: "TWAP" },
      },
    });
    const spy = vi.spyOn(orderTicketWindow, "openOrderTicketWindow").mockImplementation(() => {});
    renderBar(makeStore());
    fireEvent.change(screen.getByTestId("quick-trade-input"), {
      target: { value: "twap into aapl over the day" },
    });
    fireEvent.click(screen.getByTestId("quick-trade-ask-ai"));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][1]).toMatchObject({ side: "BUY", symbol: "AAPL", strategy: "TWAP" });
    spy.mockRestore();
  });

  it("surfaces a friendly message when LLM is offline (503)", async () => {
    setMutationResult({ error: { status: 503, data: { error: "llm_unavailable" } } });
    renderBar(makeStore());
    fireEvent.change(screen.getByTestId("quick-trade-input"), {
      target: { value: "hedge half my aapl into msft" },
    });
    fireEvent.click(screen.getByTestId("quick-trade-ask-ai"));
    await waitFor(() =>
      expect(screen.getByTestId("quick-trade-flash").textContent).toContain("AI is offline")
    );
  });

  it("surfaces 422 unparseable message", async () => {
    setMutationResult({ error: { status: 422, data: { error: "unparseable" } } });
    renderBar(makeStore());
    fireEvent.change(screen.getByTestId("quick-trade-input"), {
      target: { value: "make me rich please" },
    });
    fireEvent.click(screen.getByTestId("quick-trade-ask-ai"));
    await waitFor(() =>
      expect(screen.getByTestId("quick-trade-flash").textContent).toContain("couldn't parse")
    );
  });

  it("Enter falls through to Ask AI when no regex match", async () => {
    setMutationResult({
      result: { intent: { side: "SELL", symbol: "MSFT", quantity: 50 } },
    });
    const spy = vi.spyOn(orderTicketWindow, "openOrderTicketWindow").mockImplementation(() => {});
    renderBar(makeStore());
    const input = screen.getByTestId("quick-trade-input");
    fireEvent.change(input, { target: { value: "trim half my microsoft position" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][1]).toMatchObject({ symbol: "MSFT", quantity: 50 });
    spy.mockRestore();
  });

  it("rejects LLM response that fails schema validation", async () => {
    setMutationResult({
      result: { intent: { side: "INVALID", symbol: "aapl" } },
    });
    renderBar(makeStore());
    fireEvent.change(screen.getByTestId("quick-trade-input"), {
      target: { value: "buy fake order plz" },
    });
    fireEvent.click(screen.getByTestId("quick-trade-ask-ai"));
    await waitFor(() =>
      expect(screen.getByTestId("quick-trade-flash").textContent).toContain("failed validation")
    );
  });
});
