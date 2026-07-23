import { configureStore } from "@reduxjs/toolkit";
import { act, render, renderHook, screen } from "@testing-library/react";
import { TradingProvider, useTradingContext } from "@veta/frontend/context/TradingContext";
import { uiSlice } from "@veta/frontend/store/uiSlice";
import { windowSlice } from "@veta/frontend/store/windowSlice";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";

const openOrderTicketWindow = vi.fn();
const hotkeyHandlers = new Map<string, () => void>();

vi.mock("../../utils/orderTicketWindow.ts", () => ({
  openOrderTicketWindow: (...args: unknown[]) => openOrderTicketWindow(...args),
}));

vi.mock("react-hotkeys-hook", () => ({
  useHotkeys: (keys: string, callback: () => void) => {
    hotkeyHandlers.set(keys, callback);
  },
}));

function makeStore() {
  return configureStore({
    reducer: {
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
    },
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={makeStore()}>
      <TradingProvider>{children}</TradingProvider>
    </Provider>
  );
}

describe("TradingProvider – focusTicket / registerTicketRef", () => {
  it("focusTicket calls focus on a registered element", () => {
    const { result } = renderHook(() => useTradingContext(), { wrapper });

    const mockEl = { focus: vi.fn() } as unknown as HTMLElement;

    act(() => {
      result.current.registerTicketRef(mockEl);
    });

    act(() => {
      result.current.focusTicket();
    });

    expect(mockEl.focus).toHaveBeenCalled();
  });

  it("focusTicket does nothing when no ref registered", () => {
    const { result } = renderHook(() => useTradingContext(), { wrapper });

    // Should not throw
    expect(() => {
      act(() => {
        result.current.focusTicket();
      });
    }).not.toThrow();
  });
});

describe("TradingProvider – error boundary", () => {
  it("throws when useTradingContext is used outside TradingProvider", () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useTradingContext())).toThrow(
      "useTradingContext must be used inside TradingProvider"
    );

    consoleSpy.mockRestore();
  });
});

describe("TradingProvider – ShortcutOverlay", () => {
  it("does not render the shortcut overlay by default", () => {
    render(
      <Provider store={makeStore()}>
        <TradingProvider>
          <div />
        </TradingProvider>
      </Provider>
    );
    expect(screen.queryByText(/Keyboard Shortcuts/i)).not.toBeInTheDocument();
  });

  it("renders and closes shortcut overlay when enabled in state", () => {
    const store = configureStore({
      reducer: {
        ui: uiSlice.reducer,
        windows: windowSlice.reducer,
      },
      preloadedState: {
        ui: {
          ...uiSlice.getInitialState(),
          showShortcuts: true,
        },
      },
    });

    render(
      <Provider store={store}>
        <TradingProvider>
          <div />
        </TradingProvider>
      </Provider>
    );

    expect(screen.getByText(/Keyboard Shortcuts/i)).toBeInTheDocument();
    act(() => {
      screen.getByLabelText("Close keyboard shortcuts overlay").click();
    });
    expect(screen.queryByText(/Keyboard Shortcuts/i)).not.toBeInTheDocument();
  });
});

describe("TradingProvider – open order ticket", () => {
  it("openOrderTicket calls openOrderTicketWindow with ui window size", () => {
    openOrderTicketWindow.mockReset();
    const store = configureStore({
      reducer: {
        ui: uiSlice.reducer,
        windows: windowSlice.reducer,
      },
      preloadedState: {
        ui: {
          ...uiSlice.getInitialState(),
          orderTicketWindowSize: { w: 640, h: 900 },
        },
      },
    });

    const localWrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>
        <TradingProvider>{children}</TradingProvider>
      </Provider>
    );

    const { result } = renderHook(() => useTradingContext(), { wrapper: localWrapper });

    act(() => {
      result.current.openOrderTicket();
    });

    expect(openOrderTicketWindow).toHaveBeenCalledWith({ w: 640, h: 900 });
  });
});

describe("TradingProvider – hotkeys", () => {
  it("hotkeys mutate ui state and trigger ticket open", () => {
    hotkeyHandlers.clear();
    openOrderTicketWindow.mockReset();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    const store = configureStore({
      reducer: {
        ui: uiSlice.reducer,
        windows: windowSlice.reducer,
      },
      preloadedState: {
        ui: {
          ...uiSlice.getInitialState(),
          orderTicketWindowSize: { w: 700, h: 800 },
        },
      },
    });

    render(
      <Provider store={store}>
        <TradingProvider>
          <div />
        </TradingProvider>
      </Provider>
    );

    act(() => {
      hotkeyHandlers.get("f,n")?.();
    });
    expect(openOrderTicketWindow).toHaveBeenCalledWith({ w: 700, h: 800 });

    act(() => {
      hotkeyHandlers.get("s")?.();
    });
    expect(store.getState().ui.activeSide).toBe("SELL");

    act(() => {
      hotkeyHandlers.get("b")?.();
    });
    expect(store.getState().ui.activeSide).toBe("BUY");

    act(() => {
      hotkeyHandlers.get("shift+?")?.();
    });
    expect(store.getState().ui.showShortcuts).toBe(true);

    act(() => {
      hotkeyHandlers.get("escape")?.();
    });
    expect(store.getState().ui.showShortcuts).toBe(false);

    act(() => {
      hotkeyHandlers.get("tab")?.();
    });
    expect(store.getState().ui.activeStrategy).toBe("POV");

    act(() => {
      hotkeyHandlers.get("tab")?.();
    });
    expect(store.getState().ui.activeStrategy).toBe("VWAP");

    fetchSpy.mockRestore();
  });
});
