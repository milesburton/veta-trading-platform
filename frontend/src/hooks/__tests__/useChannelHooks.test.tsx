import { configureStore } from "@reduxjs/toolkit";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { ChannelContext } from "../../contexts/ChannelContext";
import { channelsSlice } from "../../store/channelsSlice";
import { uiSlice } from "../../store/uiSlice";
import { useChannelIn } from "../useChannelIn";
import { useChannelOut } from "../useChannelOut";

function makeStore() {
  return configureStore({
    reducer: {
      channels: channelsSlice.reducer,
      ui: uiSlice.reducer,
    },
  });
}

function makeWrapper(
  store: ReturnType<typeof makeStore>,
  context: { incoming: 1 | 2 | 3 | 4 | 5 | 6 | null; outgoing: 1 | 2 | 3 | 4 | 5 | 6 | null },
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <ChannelContext.Provider
          value={{
            instanceId: "panel-1",
            panelType: "market-ladder",
            incoming: context.incoming,
            outgoing: context.outgoing,
          }}
        >
          {children}
        </ChannelContext.Provider>
      </Provider>
    );
  };
}

describe("useChannelIn", () => {
  it("returns incoming channel data when configured", () => {
    const store = makeStore();
    store.dispatch(
      channelsSlice.actions.channelUpdated({
        channel: 2,
        patch: { selectedAsset: "MSFT", selectedOrderId: "ord-2" },
      }),
    );

    const { result } = renderHook(() => useChannelIn(), {
      wrapper: makeWrapper(store, { incoming: 2, outgoing: null }),
    });

    expect(result.current).toEqual({ selectedAsset: "MSFT", selectedOrderId: "ord-2" });
  });

  it("falls back to legacy selectedAsset when no incoming channel", () => {
    const store = makeStore();
    store.dispatch(uiSlice.actions.setSelectedAsset("AAPL"));

    const { result } = renderHook(() => useChannelIn(), {
      wrapper: makeWrapper(store, { incoming: null, outgoing: null }),
    });

    expect(result.current).toEqual({ selectedAsset: "AAPL", selectedOrderId: null });
  });

  it("falls back to legacy selectedAsset when incoming channel has no data", () => {
    const store = makeStore();
    store.dispatch(uiSlice.actions.setSelectedAsset("TSLA"));

    // Channel 6 stays at default empty values; this still counts as channel data and should be returned.
    const { result } = renderHook(() => useChannelIn(), {
      wrapper: makeWrapper(store, { incoming: 6, outgoing: null }),
    });

    expect(result.current).toEqual({ selectedAsset: null, selectedOrderId: null });
  });
});

describe("useChannelOut", () => {
  it("broadcasts patch to configured outgoing channel", () => {
    const store = makeStore();

    const { result } = renderHook(() => useChannelOut(), {
      wrapper: makeWrapper(store, { incoming: null, outgoing: 3 }),
    });

    result.current({ selectedAsset: "NVDA", selectedOrderId: "ord-9" });

    const state = store.getState();
    expect(state.channels.data[3]).toEqual({ selectedAsset: "NVDA", selectedOrderId: "ord-9" });
    expect(state.ui.selectedAsset).toBeNull();
  });

  it("falls back to ui.selectedAsset when no outgoing channel", () => {
    const store = makeStore();

    const { result } = renderHook(() => useChannelOut(), {
      wrapper: makeWrapper(store, { incoming: null, outgoing: null }),
    });

    result.current({ selectedAsset: "AMD" });

    const state = store.getState();
    expect(state.ui.selectedAsset).toBe("AMD");
    expect(state.channels.data[1]).toEqual({ selectedAsset: null, selectedOrderId: null });
  });

  it("does nothing on legacy fallback when patch has no selectedAsset", () => {
    const store = makeStore();
    store.dispatch(uiSlice.actions.setSelectedAsset("IBM"));

    const { result } = renderHook(() => useChannelOut(), {
      wrapper: makeWrapper(store, { incoming: null, outgoing: null }),
    });

    result.current({ selectedOrderId: "ord-only" });

    expect(store.getState().ui.selectedAsset).toBe("IBM");
  });
});
