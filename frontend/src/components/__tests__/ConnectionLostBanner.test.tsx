import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConnectionLostBanner } from "@veta/frontend/components/ConnectionLostBanner";
import { marketSlice } from "@veta/frontend/store/marketSlice";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";

function makeStore(opts: { connected: boolean; connectionFailures: number }) {
  return configureStore({
    reducer: { market: marketSlice.reducer },
    preloadedState: {
      market: {
        assets: [],
        prices: {},
        sessionOpen: {},
        priceHistory: {},
        candleHistory: {},
        candlesReady: {},
        orderBook: {},
        connected: opts.connected,
        connectionFailures: opts.connectionFailures,
        sessionPhase: "CONTINUOUS" as const,
      },
    },
  });
}

function renderBanner(opts: { connected: boolean; connectionFailures: number }) {
  return render(
    <Provider store={makeStore(opts)}>
      <ConnectionLostBanner />
    </Provider>
  );
}

describe("ConnectionLostBanner", () => {
  it("renders nothing when connected", () => {
    renderBanner({ connected: true, connectionFailures: 0 });
    expect(screen.queryByTestId("connection-lost-banner")).toBeNull();
  });

  it("renders nothing when disconnected but below failure threshold", () => {
    renderBanner({ connected: false, connectionFailures: 2 });
    expect(screen.queryByTestId("connection-lost-banner")).toBeNull();
  });

  it("renders nothing once reconnected even if failures still in state momentarily", () => {
    renderBanner({ connected: true, connectionFailures: 5 });
    expect(screen.queryByTestId("connection-lost-banner")).toBeNull();
  });

  it("renders banner with both buttons when threshold met and disconnected", () => {
    renderBanner({ connected: false, connectionFailures: 3 });
    expect(screen.getByTestId("connection-lost-banner")).toBeInTheDocument();
    expect(screen.getByTestId("connection-lost-reconnect")).toBeInTheDocument();
    expect(screen.getByTestId("connection-lost-reload")).toBeInTheDocument();
  });

  it("dispatches gateway/reconnect when Try reconnect clicked", () => {
    const store = makeStore({ connected: false, connectionFailures: 3 });
    const spy = vi.spyOn(store, "dispatch");
    render(
      <Provider store={store}>
        <ConnectionLostBanner />
      </Provider>
    );
    fireEvent.click(screen.getByTestId("connection-lost-reconnect"));
    expect(spy).toHaveBeenCalledWith({ type: "gateway/reconnect" });
    spy.mockRestore();
  });

  it("triggers window.location.reload when Reload page clicked", () => {
    const reloadMock = vi.fn();
    const original = globalThis.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload: reloadMock },
    });
    renderBanner({ connected: false, connectionFailures: 5 });
    fireEvent.click(screen.getByTestId("connection-lost-reload"));
    expect(reloadMock).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });
});
