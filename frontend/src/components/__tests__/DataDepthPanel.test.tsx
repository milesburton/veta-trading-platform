import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { DataDepthPanel } from "@veta/frontend/components/DataDepthPanel";
import { servicesApi } from "@veta/frontend/store/servicesApi";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";

const sampleResponse = {
  totalSymbols: 2,
  avgDays: 5,
  minDays: 0.5,
  queriedAt: Date.now(),
  symbols: [
    { instrument: "AAPL", candleCount: 80, earliestMs: 0, latestMs: 0, spanDays: 5.0 },
    { instrument: "TSLA", candleCount: 12, earliestMs: 0, latestMs: 0, spanDays: 0.5 },
  ],
};

vi.mock("../../store/servicesApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../store/servicesApi")>();
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

function renderPanel() {
  return render(
    <Provider store={makeStore()}>
      <DataDepthPanel />
    </Provider>
  );
}

describe("DataDepthPanel", () => {
  it("renders the panel title and reuses the shared list", () => {
    renderPanel();
    expect(screen.getByTestId("data-depth-panel")).toBeInTheDocument();
    expect(screen.getByTestId("data-depth-list")).toBeInTheDocument();
    expect(screen.getByTestId("data-depth-row-AAPL")).toBeInTheDocument();
    expect(screen.getByTestId("data-depth-row-TSLA")).toBeInTheDocument();
  });

  it("does not render a backdrop or fixed-positioning chrome", () => {
    renderPanel();
    expect(screen.queryByTestId(`drawer-data-depth`)).not.toBeInTheDocument();
  });
});
