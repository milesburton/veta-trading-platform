import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScenarioMatrixPanel } from "../ScenarioMatrixPanel";

const getScenario = vi.fn();

vi.mock("../../store/analyticsApi.ts", () => ({
  useGetScenarioMutation: () => [
    getScenario,
    { isLoading: false, error: null },
  ],
}));

vi.mock("../../store/selectors.ts", () => ({
  selectSymbols: () => ["AAPL", "MSFT"],
}));

vi.mock("../../store/hooks.ts", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => {
    const state = {
      market: {
        prices: {
          AAPL: 150,
          MSFT: 300,
        },
      },
    };
    return selector(state);
  },
}));

function makeCells() {
  const spot = [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2];
  const vol = [-0.2, -0.1, 0, 0.1, 0.2];
  return spot.map((s) =>
    vol.map((v) => ({
      spotPct: s,
      volPct: v,
      optionPrice: 10 + s + v,
      pnl: (s + v) * 10,
      pnlPct: s + v,
      p5: 8,
      p25: 9,
      mean: 10,
      p75: 11,
      p95: 12,
    })),
  );
}

describe("ScenarioMatrixPanel", () => {
  beforeEach(() => {
    getScenario.mockReset();
    getScenario.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          symbol: "AAPL",
          optionType: "call",
          strike: 150,
          expirySecs: 30 * 86400,
          spotPrice: 150,
          impliedVol: 0.25,
          baselinePrice: 10,
          spotShocks: [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2],
          volShocks: [-0.2, -0.1, 0, 0.1, 0.2],
          cells: makeCells(),
          computedAt: Date.now(),
        }),
    });
  });

  it("renders panel and action controls", () => {
    render(<ScenarioMatrixPanel />);

    expect(screen.getByTestId("scenario-matrix-panel")).toBeInTheDocument();
    expect(screen.getByText(/Scenario Matrix/i)).toBeInTheDocument();
    expect(screen.getByTestId("run-scenario-btn")).toBeInTheDocument();
  });

  it("submits scenario request with default shock grids", async () => {
    render(<ScenarioMatrixPanel />);

    fireEvent.click(screen.getByTestId("run-scenario-btn"));

    await waitFor(() => {
      expect(getScenario).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: "AAPL",
          optionType: "call",
          strike: 150,
          expirySecs: 30 * 86400,
          spotShocks: [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2],
          volShocks: [-0.2, -0.1, 0, 0.1, 0.2],
          paths: 1000,
        }),
      );
    });
  });

  it("renders heatmap matrix and metric selector after response", async () => {
    render(<ScenarioMatrixPanel />);
    fireEvent.click(screen.getByTestId("run-scenario-btn"));

    expect(await screen.findByTestId("scenario-table")).toBeInTheDocument();
    expect(screen.getByText(/P&L \(\$\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Gain/i)).toBeInTheDocument();
    expect(screen.getByText(/Loss/i)).toBeInTheDocument();
  });
});
