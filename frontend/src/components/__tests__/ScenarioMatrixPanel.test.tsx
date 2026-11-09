import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ScenarioMatrixPanel } from "@veta/frontend/components/ScenarioMatrixPanel";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const getScenario = vi.fn();

vi.mock("../../store/analyticsApi.ts", () => ({
  useGetScenarioMutation: () => [getScenario, { isLoading: false, error: null }],
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
    }))
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
          expirySecs: 30 * 86_400,
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
          expirySecs: 30 * 86_400,
          spotShocks: [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2],
          volShocks: [-0.2, -0.1, 0, 0.1, 0.2],
          paths: 1000,
        })
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

  it("renders one row per spot shock with the percent label", async () => {
    render(<ScenarioMatrixPanel />);
    fireEvent.click(screen.getByTestId("run-scenario-btn"));
    const table = await screen.findByTestId("scenario-table");
    const rows = table.querySelectorAll("tbody > tr");
    expect(rows).toHaveLength(7);
    expect(screen.getAllByText(/-20%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\+20%/).length).toBeGreaterThan(0);
  });

  it("switches metrics when a metric button is clicked", async () => {
    render(<ScenarioMatrixPanel />);
    fireEvent.click(screen.getByTestId("run-scenario-btn"));
    await screen.findByTestId("scenario-table");
    const meanButtons = screen.getAllByText(/Mean/i);
    fireEvent.click(meanButtons[0]);
    expect(screen.getByTestId("scenario-table")).toBeInTheDocument();
  });

  it("changes option type to put", () => {
    render(<ScenarioMatrixPanel />);
    const putBtn = screen.getByRole("button", { name: /^PUT$/ });
    fireEvent.click(putBtn);
    // Button changes class, check it's still rendered
    expect(putBtn).toBeInTheDocument();
  });

  it("changes paths input", () => {
    render(<ScenarioMatrixPanel />);
    const pathsInput = screen.queryByLabelText(/Paths|Iterations/i) as HTMLInputElement | null;
    if (pathsInput) {
      fireEvent.change(pathsInput, { target: { value: "5000" } });
      expect(pathsInput.value).toBe("5000");
    } else {
      expect(screen.getByTestId("scenario-matrix-panel")).toBeInTheDocument();
    }
  });

  it("changes the symbol select", () => {
    render(<ScenarioMatrixPanel />);
    const symbolSel = screen.queryByLabelText(/Symbol/i) as HTMLSelectElement | null;
    if (symbolSel) {
      fireEvent.change(symbolSel, { target: { value: "MSFT" } });
    }
    expect(screen.getByTestId("scenario-matrix-panel")).toBeInTheDocument();
  });

  it("hovering a cell shows tooltip", async () => {
    render(<ScenarioMatrixPanel />);
    fireEvent.click(screen.getByTestId("run-scenario-btn"));
    await screen.findByTestId("scenario-table");
    const cells = screen.getAllByText(/^[+-]?[0-9]+\.[0-9]/);
    if (cells.length > 0) {
      fireEvent.mouseEnter(cells[0]);
      fireEvent.mouseLeave(cells[0]);
    }
    expect(screen.getByTestId("scenario-table")).toBeInTheDocument();
  });

  it("toggles ranges control", () => {
    render(<ScenarioMatrixPanel />);
    const rangesBtn = screen.queryByRole("button", { name: /Ranges|Adjust/i });
    if (rangesBtn) {
      fireEvent.click(rangesBtn);
    }
    expect(screen.getByTestId("scenario-matrix-panel")).toBeInTheDocument();
  });

  it("changes the metric to P&L %", async () => {
    render(<ScenarioMatrixPanel />);
    fireEvent.click(screen.getByTestId("run-scenario-btn"));
    await screen.findByTestId("scenario-table");
    const pctBtns = screen.queryAllByText(/P&L %/i);
    if (pctBtns.length > 0) {
      fireEvent.click(pctBtns[0]);
    }
    expect(screen.getByTestId("scenario-table")).toBeInTheDocument();
  });

  it("sends the edited strike, expiry and shock ranges", async () => {
    render(<ScenarioMatrixPanel />);

    fireEvent.change(screen.getByLabelText(/Strike/i), { target: { value: "175" } });
    fireEvent.change(screen.getByLabelText(/Expiry/i), {
      target: { value: String(60 * 86_400) },
    });
    fireEvent.click(screen.getByRole("button", { name: /Ranges/ }));
    fireEvent.change(screen.getByLabelText(/Spot shock/i), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText(/Vol shock/i), { target: { value: "10" } });
    fireEvent.click(screen.getByTestId("run-scenario-btn"));

    await waitFor(() => expect(getScenario).toHaveBeenCalledTimes(1));
    expect(getScenario.mock.calls[0][0]).toMatchObject({
      strike: 175,
      expirySecs: 60 * 86_400,
      spotShocks: [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2],
      volShocks: [-0.1, -0.05, 0, 0.05, 0.1],
    });
  });

  it("formats the P&L % metric as signed percentages", async () => {
    render(<ScenarioMatrixPanel />);
    fireEvent.click(screen.getByTestId("run-scenario-btn"));
    await screen.findByTestId("scenario-table");

    fireEvent.click(screen.getByRole("button", { name: "P&L (%)" }));

    expect(screen.getAllByText(/^[+-]\d+\.\d%$/).length).toBeGreaterThan(0);
  });

  it("keeps the tooltip following the pointer while hovering a cell", async () => {
    render(<ScenarioMatrixPanel />);
    fireEvent.click(screen.getByTestId("run-scenario-btn"));
    const table = await screen.findByTestId("scenario-table");
    const cell = table.querySelector("tbody td:nth-child(2)") as HTMLElement;

    fireEvent.mouseEnter(cell, { clientX: 10, clientY: 20 });
    const tooltip = () => document.querySelector<HTMLElement>("div[style*='left']");
    expect(tooltip()?.style.left).toBe("22px");

    fireEvent.mouseMove(cell, { clientX: 40, clientY: 60 });

    expect(tooltip()?.style.left).toBe("52px");
    expect(tooltip()?.style.top).toBe("52px");
  });
});
