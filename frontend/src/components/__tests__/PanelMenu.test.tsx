import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelContext } from "../../contexts/ChannelContext";
import { windowSlice } from "../../store/windowSlice";
import { PanelMenu } from "../PanelMenu";

const removeTabById = vi.fn();

vi.mock("../DashboardLayout.tsx", () => ({
  useDashboard: () => ({
    storageKey: "dashboard-layout",
    removeTabById,
  }),
}));

function makeStore() {
  return configureStore({
    reducer: {
      windows: windowSlice.reducer,
    },
  });
}

function renderMenu(store = makeStore()) {
  render(
    <Provider store={store}>
      <ChannelContext.Provider
        value={{
          instanceId: "panel-123",
          panelType: "market-ladder",
          outgoing: null,
          incoming: null,
        }}
      >
        <PanelMenu />
      </ChannelContext.Provider>
    </Provider>,
  );
  return store;
}

describe("PanelMenu", () => {
  beforeEach(() => {
    removeTabById.mockReset();
  });

  it("opens actions menu and closes on Escape", () => {
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: /Panel actions/i }));
    expect(
      screen.getByRole("menu", { name: /Panel actions menu/i }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("menu", { name: /Panel actions menu/i }),
    ).not.toBeInTheDocument();
  });

  it("opens dialog from menu", async () => {
    const store = renderMenu();

    fireEvent.click(screen.getByRole("button", { name: /Panel actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Open in dialog/i }));

    await waitFor(() => {
      expect(store.getState().windows.dialogs["panel-123"]?.open).toBe(true);
      expect(store.getState().windows.dialogs["panel-123"]?.panelType).toBe(
        "market-ladder",
      );
    });
  });

  it("opens new window and removes tab when popup is created", async () => {
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue({ closed: false } as Window);
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: /Panel actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /New window/i }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining("panel=panel-123"),
        "panel-panel-123",
        expect.stringContaining("width=1200"),
      );
      expect(removeTabById).toHaveBeenCalledWith("panel-123");
    });
  });

  it("shows and handles close dialog action when already open", async () => {
    const store = makeStore();
    store.dispatch(
      windowSlice.actions.panelDialogOpened({
        panelId: "panel-123",
        panelType: "market-ladder",
      }),
    );

    renderMenu(store);
    fireEvent.click(screen.getByRole("button", { name: /Panel actions/i }));

    expect(
      screen.getByRole("menuitem", { name: /Close dialog/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Close dialog/i }));

    await waitFor(() => {
      expect(store.getState().windows.dialogs["panel-123"]?.open).toBe(false);
    });
  });
});
