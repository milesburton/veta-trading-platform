import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Scenario, type ScenarioRun, scenariosApi } from "../../store/scenariosApi";
import { ScenariosPanel } from "../ScenariosPanel";

const sampleScenarios: Scenario[] = [
  {
    id: "sc-1",
    userId: "alice",
    name: "AAPL TWAP baseline",
    description: null,
    spec: {
      seed: 42,
      symbol: "AAPL",
      side: "BUY",
      quantity: 100,
      limitPrice: 190,
      strategy: "TWAP",
    },
    expected: null,
    createdAt: "2026-05-06T10:00:00Z",
    updatedAt: "2026-05-06T10:00:00Z",
  },
];

const sampleRuns: ScenarioRun[] = [
  {
    id: "run-1",
    scenarioId: "sc-1",
    userId: "alice",
    triggeredAt: "2026-05-06T10:01:00Z",
    completedAt: "2026-05-06T10:01:12Z",
    parentOrderId: "ord-abc12345",
    actual: {
      fillCount: 4,
      totalFilled: 100,
      avgFillPrice: 190.05,
      avgFillPriceBps: 2.6,
      slippageBps: 1.4,
      childOrderIds: ["c1", "c2", "c3", "c4"],
      durationMs: 12_000,
    },
    diff: { matched: true, fields: {} },
    status: "completed",
    error: null,
  },
];

const runScenarioMock = vi.fn();
const deleteScenarioMock = vi.fn();
const createScenarioMock = vi.fn();

vi.mock("../../store/scenariosApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../store/scenariosApi")>();
  return {
    ...actual,
    useListScenariosQuery: () => ({ data: sampleScenarios, isLoading: false }),
    useListRunsQuery: () => ({ data: sampleRuns, isLoading: false }),
    useRunScenarioMutation: () => [runScenarioMock, { isLoading: false, originalArgs: undefined }],
    useDeleteScenarioMutation: () => [deleteScenarioMock, { isLoading: false }],
    useCreateScenarioMutation: () => [createScenarioMock, { isLoading: false }],
  };
});

function makeStore() {
  return configureStore({
    reducer: { [scenariosApi.reducerPath]: scenariosApi.reducer },
    middleware: (gdm) => gdm().concat(scenariosApi.middleware),
  });
}

beforeEach(() => {
  runScenarioMock.mockReset();
  deleteScenarioMock.mockReset();
  createScenarioMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ScenariosPanel", () => {
  it("loads and renders saved scenarios", async () => {
    render(
      <Provider store={makeStore()}>
        <ScenariosPanel />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText("AAPL TWAP baseline")).toBeInTheDocument();
    });
    expect(screen.getByText(/AAPL · BUY 100/)).toBeInTheDocument();
    expect(screen.getByText("seed 42")).toBeInTheDocument();
  });

  it("toggles the new-scenario form", async () => {
    render(
      <Provider store={makeStore()}>
        <ScenariosPanel />
      </Provider>
    );

    await waitFor(() => screen.getByText("AAPL TWAP baseline"));
    fireEvent.click(screen.getByTestId("scenario-new-btn"));
    expect(screen.getByTestId("scenario-name")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("scenario-new-btn"));
    expect(screen.queryByTestId("scenario-name")).not.toBeInTheDocument();
  });

  it("renders run history for the selected scenario", async () => {
    render(
      <Provider store={makeStore()}>
        <ScenariosPanel />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText("4/100")).toBeInTheDocument();
    });
    expect(screen.getByText("1.4 bps")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("triggers run mutation when Run is clicked", async () => {
    render(
      <Provider store={makeStore()}>
        <ScenariosPanel />
      </Provider>
    );

    await waitFor(() => screen.getByText("AAPL TWAP baseline"));
    fireEvent.click(screen.getByTestId("scenario-run-btn"));
    expect(runScenarioMock).toHaveBeenCalledWith("sc-1");
  });

  it("triggers delete mutation when ✕ is clicked", async () => {
    render(
      <Provider store={makeStore()}>
        <ScenariosPanel />
      </Provider>
    );

    await waitFor(() => screen.getByText("AAPL TWAP baseline"));
    fireEvent.click(screen.getByLabelText(/Delete scenario/));
    expect(deleteScenarioMock).toHaveBeenCalledWith("sc-1");
  });

  it("blocks empty-name submissions in the new-scenario form", async () => {
    createScenarioMock.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    render(
      <Provider store={makeStore()}>
        <ScenariosPanel />
      </Provider>
    );

    await waitFor(() => screen.getByText("AAPL TWAP baseline"));
    fireEvent.click(screen.getByTestId("scenario-new-btn"));
    fireEvent.click(screen.getByTestId("scenario-save-btn"));
    expect(createScenarioMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Name is required/)).toBeInTheDocument();
  });

  it("submits a new scenario with form values", async () => {
    createScenarioMock.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    render(
      <Provider store={makeStore()}>
        <ScenariosPanel />
      </Provider>
    );

    await waitFor(() => screen.getByText("AAPL TWAP baseline"));
    fireEvent.click(screen.getByTestId("scenario-new-btn"));
    fireEvent.input(screen.getByTestId("scenario-name"), {
      target: { value: "Test scenario" },
    });
    fireEvent.click(screen.getByTestId("scenario-save-btn"));

    await waitFor(() => {
      expect(createScenarioMock).toHaveBeenCalled();
    });
    const arg = createScenarioMock.mock.calls[0][0] as { name: string; spec: { seed: number } };
    expect(arg.name).toBe("Test scenario");
    expect(typeof arg.spec.seed).toBe("number");
  });

  it("surfaces server error message when create fails with structured payload", async () => {
    createScenarioMock.mockReturnValue({
      unwrap: () => Promise.reject({ data: { error: "Name already exists" } }),
    });
    render(
      <Provider store={makeStore()}>
        <ScenariosPanel />
      </Provider>
    );

    await waitFor(() => screen.getByText("AAPL TWAP baseline"));
    fireEvent.click(screen.getByTestId("scenario-new-btn"));
    fireEvent.input(screen.getByTestId("scenario-name"), {
      target: { value: "Dup" },
    });
    fireEvent.click(screen.getByTestId("scenario-save-btn"));

    await waitFor(() => {
      expect(screen.getByText(/Name already exists/)).toBeInTheDocument();
    });
  });

  it("falls back to a generic error when server payload is opaque", async () => {
    createScenarioMock.mockReturnValue({
      unwrap: () => Promise.reject(new Error("network")),
    });
    render(
      <Provider store={makeStore()}>
        <ScenariosPanel />
      </Provider>
    );

    await waitFor(() => screen.getByText("AAPL TWAP baseline"));
    fireEvent.click(screen.getByTestId("scenario-new-btn"));
    fireEvent.input(screen.getByTestId("scenario-name"), {
      target: { value: "X" },
    });
    fireEvent.click(screen.getByTestId("scenario-save-btn"));

    await waitFor(() => {
      expect(screen.getByText(/Save failed/)).toBeInTheDocument();
    });
  });

  it("changing form inputs updates the submitted spec", async () => {
    createScenarioMock.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    render(
      <Provider store={makeStore()}>
        <ScenariosPanel />
      </Provider>
    );

    await waitFor(() => screen.getByText("AAPL TWAP baseline"));
    fireEvent.click(screen.getByTestId("scenario-new-btn"));
    fireEvent.input(screen.getByTestId("scenario-name"), {
      target: { value: "Volatility test" },
    });

    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.input(inputs[0], { target: { value: "250" } });
    fireEvent.input(inputs[1], { target: { value: "200.5" } });
    fireEvent.input(inputs[2], { target: { value: "999" } });

    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "SELL" } });
    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "TWAP" } });

    fireEvent.click(screen.getByTestId("scenario-save-btn"));
    await waitFor(() => expect(createScenarioMock).toHaveBeenCalled());

    const arg = createScenarioMock.mock.calls[0][0] as {
      spec: { side: string; quantity: number; limitPrice: number; seed: number; strategy: string };
    };
    expect(arg.spec.side).toBe("SELL");
    expect(arg.spec.quantity).toBe(250);
    expect(arg.spec.limitPrice).toBe(200.5);
    expect(arg.spec.seed).toBe(999);
    expect(arg.spec.strategy).toBe("TWAP");
  });
});
