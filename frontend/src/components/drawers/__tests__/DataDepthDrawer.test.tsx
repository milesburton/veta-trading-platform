import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { servicesApi } from "../../../store/servicesApi";
import { DATA_DEPTH_DRAWER_ID, DataDepthDrawer } from "../DataDepthDrawer";
import { DrawersProvider, useDrawers } from "../DrawersContext";

const mockAddPanel = vi.fn();
const mockActivePanelIds = new Set<string>();

vi.mock("../../dashboard/DashboardContext.tsx", () => ({
  useDashboard: () => ({
    activePanelIds: mockActivePanelIds,
    addPanel: mockAddPanel,
  }),
}));

const sampleResponse = {
  totalSymbols: 3,
  avgDays: 4.5,
  minDays: 0.04,
  queriedAt: Date.now(),
  symbols: [
    { instrument: "AAPL", candleCount: 120, earliestMs: 0, latestMs: 0, spanDays: 7.5 },
    { instrument: "GOOGL", candleCount: 50, earliestMs: 0, latestMs: 0, spanDays: 2.1 },
    { instrument: "TSLA", candleCount: 1, earliestMs: 0, latestMs: 0, spanDays: 0.04 },
  ],
};

vi.mock("../../../store/servicesApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../store/servicesApi")>();
  return {
    ...original,
    useGetDataDepthQuery: () => ({
      data: sampleResponse,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
  };
});

function makeStore() {
  return configureStore({
    reducer: { [servicesApi.reducerPath]: servicesApi.reducer },
    middleware: (m) => m().concat(servicesApi.middleware),
  });
}

function Opener() {
  const { open } = useDrawers();
  useEffect(() => {
    open(DATA_DEPTH_DRAWER_ID);
  }, [open]);
  return null;
}

function renderOpen() {
  return render(
    <Provider store={makeStore()}>
      <DrawersProvider>
        <Opener />
        <DataDepthDrawer />
      </DrawersProvider>
    </Provider>
  );
}

describe("DataDepthDrawer", () => {
  it("renders the title and aggregate stats", () => {
    renderOpen();
    expect(screen.getByText("Market Data Depth")).toBeInTheDocument();
    expect(screen.getByText("Symbols")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("sorts symbols worst-first", () => {
    renderOpen();
    const rows = screen.getAllByTestId(/^data-depth-row-/);
    expect(rows[0]).toHaveAttribute("data-testid", "data-depth-row-TSLA");
    expect(rows[1]).toHaveAttribute("data-testid", "data-depth-row-GOOGL");
    expect(rows[2]).toHaveAttribute("data-testid", "data-depth-row-AAPL");
  });

  it("shows the limited-data warning when minDays < 7", () => {
    renderOpen();
    expect(
      screen.getByText(/Scenario analysis and volatility estimates are unreliable/i)
    ).toBeInTheDocument();
  });

  it("pin button adds the data-depth panel to the dashboard", () => {
    mockAddPanel.mockReset();
    mockActivePanelIds.clear();
    renderOpen();
    fireEvent.click(screen.getByTestId("data-depth-pin-btn"));
    expect(mockAddPanel).toHaveBeenCalledWith("data-depth");
  });
});
