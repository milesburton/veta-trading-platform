import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { DATA_DEPTH_DRAWER_ID } from "@veta/frontend/components/drawers/DataDepthDrawer";
import { DrawersProvider, useDrawers } from "@veta/frontend/components/drawers/DrawersContext";
import { DataDepthIndicator } from "@veta/frontend/components/StatusBar";
import { servicesApi } from "@veta/frontend/store/servicesApi";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";

const sampleData = {
  totalSymbols: 5,
  avgDays: 6,
  minDays: 2,
  queriedAt: Date.now(),
  symbols: [],
};

vi.mock("../../store/servicesApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../store/servicesApi")>();
  return {
    ...original,
    useGetDataDepthQuery: () => ({
      data: sampleData,
      isLoading: false,
    }),
  };
});

function makeStore() {
  return configureStore({
    reducer: { [servicesApi.reducerPath]: servicesApi.reducer },
    middleware: (m) => m().concat(servicesApi.middleware),
  });
}

function StateProbe() {
  const { isOpen } = useDrawers();
  return <div data-testid="probe">{String(isOpen(DATA_DEPTH_DRAWER_ID))}</div>;
}

function renderIndicator() {
  return render(
    <Provider store={makeStore()}>
      <DrawersProvider>
        <DataDepthIndicator />
        <StateProbe />
      </DrawersProvider>
    </Provider>
  );
}

describe("DataDepthIndicator", () => {
  it("renders summary text from the data depth response", () => {
    renderIndicator();
    expect(screen.getByText(/Market Data/)).toBeInTheDocument();
    expect(screen.getByText(/5 sym/)).toBeInTheDocument();
  });

  it("clicking the indicator toggles the data-depth drawer", () => {
    renderIndicator();
    expect(screen.getByTestId("probe").textContent).toBe("false");

    fireEvent.click(screen.getByTestId("data-depth"));
    expect(screen.getByTestId("probe").textContent).toBe("true");

    fireEvent.click(screen.getByTestId("data-depth"));
    expect(screen.getByTestId("probe").textContent).toBe("false");
  });

  it("sets aria-pressed when the drawer is open", () => {
    renderIndicator();
    const btn = screen.getByTestId("data-depth");
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });
});
