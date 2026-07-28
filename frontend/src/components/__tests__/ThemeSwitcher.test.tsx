import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeSwitcher } from "@veta/frontend/components/StatusBar";
import { themeSlice } from "@veta/frontend/store/themeSlice";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../store/themeSlice", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../store/themeSlice")>();
  return {
    ...original,
    saveTheme: () => () => {},
  };
});

function makeStore(initial: "dark" | "light" | "darker" | "high-contrast" = "dark") {
  return configureStore({
    reducer: { theme: themeSlice.reducer },
    preloadedState: { theme: { theme: initial } },
  });
}

describe("ThemeSwitcher", () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setItemSpy = vi.spyOn(Storage.prototype, "setItem");
  });
  afterEach(() => {
    setItemSpy.mockRestore();
  });

  it("renders the trigger button", () => {
    render(
      <Provider store={makeStore()}>
        <ThemeSwitcher />
      </Provider>
    );
    expect(screen.getByRole("button", { name: /Change theme/i })).toBeInTheDocument();
    expect(screen.getByText(/Theme: Dark/i)).toBeInTheDocument();
  });

  it("opens the menu on click and lists all theme options", () => {
    render(
      <Provider store={makeStore()}>
        <ThemeSwitcher />
      </Provider>
    );
    fireEvent.click(screen.getByRole("button", { name: /Change theme/i }));
    for (const label of ["Dark", "OLED", "Light", "High Contrast"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("selecting a theme dispatches setTheme and persists to localStorage", () => {
    const store = makeStore("dark");
    render(
      <Provider store={store}>
        <ThemeSwitcher />
      </Provider>
    );
    fireEvent.click(screen.getByRole("button", { name: /Change theme/i }));
    fireEvent.click(screen.getByText("OLED"));
    expect(store.getState().theme.theme).toBe("darker");
    expect(setItemSpy).toHaveBeenCalledWith("veta-theme", "darker");
  });

  it("clicking outside closes the menu", () => {
    render(
      <Provider store={makeStore()}>
        <ThemeSwitcher />
      </Provider>
    );
    fireEvent.click(screen.getByRole("button", { name: /Change theme/i }));
    expect(screen.getByText("OLED")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Close theme picker"));
    expect(screen.queryByText("OLED")).not.toBeInTheDocument();
  });
});
