import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { llmSubsystemSlice } from "../../store/llmSubsystemSlice";
import { LlmSubsystemPanel } from "../LlmSubsystemPanel";

const refetch = vi.fn();
const updateState = vi.fn();
const requestBrief = vi.fn();
const triggerWorker = vi.fn();

let serverState: {
  state: "disabled" | "armed" | "active" | "cooldown" | "error";
  policy: {
    enabled: boolean;
    workerEnabled: boolean;
    triggerMode: "disabled" | "manual" | "on-demand-ui" | "scheduled-batch" | "event-driven";
    minRefreshMinutes: number;
    workerIdleTimeoutSeconds: number;
    workerMaxJobsPerSession: number;
    maxConcurrentJobs: number;
  };
  pendingJobs: number;
  trackedSymbols: number;
  triggerMode: "disabled" | "manual" | "on-demand-ui" | "scheduled-batch" | "event-driven";
  workerEnabled: boolean;
  ts: number;
} | null;

vi.mock("../../store/advisoryApi.ts", () => ({
  useGetLlmSubsystemStateQuery: () => ({ data: serverState, refetch }),
  useUpdateLlmSubsystemStateMutation: () => [updateState, { isLoading: false }],
  useRequestWatchlistBriefMutation: () => [requestBrief, { isLoading: false }],
  useTriggerWorkerMutation: () => [triggerWorker, { isLoading: false }],
}));

function makeStatus(overrides: Partial<NonNullable<typeof serverState>> = {}) {
  return {
    state: "active" as const,
    policy: {
      enabled: true,
      workerEnabled: true,
      triggerMode: "manual" as const,
      minRefreshMinutes: 15,
      workerIdleTimeoutSeconds: 30,
      workerMaxJobsPerSession: 5,
      maxConcurrentJobs: 2,
    },
    pendingJobs: 3,
    trackedSymbols: 8,
    triggerMode: "manual" as const,
    workerEnabled: true,
    ts: Date.UTC(2026, 0, 1, 10, 0, 0),
    ...overrides,
  };
}

function renderPanel(liveStatus: NonNullable<typeof serverState> | null = null) {
  const store = configureStore({
    reducer: { llmSubsystem: llmSubsystemSlice.reducer },
    preloadedState: {
      llmSubsystem: {
        status: liveStatus,
        lastUpdated: null,
      },
    },
  });

  render(
    <Provider store={store}>
      <LlmSubsystemPanel />
    </Provider>
  );
}

describe("LlmSubsystemPanel", () => {
  beforeEach(() => {
    refetch.mockReset();
    updateState.mockReset();
    requestBrief.mockReset();
    triggerWorker.mockReset();
    serverState = makeStatus();

    updateState.mockReturnValue({
      unwrap: () => Promise.resolve({ status: "ok" }),
    });
    requestBrief.mockReturnValue({
      unwrap: () => Promise.resolve({ count: 2 }),
    });
    triggerWorker.mockReturnValue({
      unwrap: () => Promise.resolve({ status: "started" }),
    });
  });

  it("renders the server status and disables actions when policy blocks them", () => {
    serverState = makeStatus({
      state: "cooldown",
      policy: {
        enabled: false,
        workerEnabled: false,
        triggerMode: "manual",
        minRefreshMinutes: 15,
        workerIdleTimeoutSeconds: 30,
        workerMaxJobsPerSession: 5,
        maxConcurrentJobs: 2,
      },
      workerEnabled: false,
    });

    renderPanel();

    expect(screen.getByText(/Cooldown/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate watchlist brief/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Start LLM worker/i })).toBeDisabled();
  });

  it("prefers live store state and patches the trigger mode", async () => {
    serverState = makeStatus({ state: "disabled" });

    renderPanel(makeStatus({ state: "armed", triggerMode: "manual" }));

    expect(screen.getByText(/Armed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "event-driven" }));

    await waitFor(() => {
      expect(updateState).toHaveBeenCalledWith({ triggerMode: "event-driven" });
    });
    expect(refetch).toHaveBeenCalled();
    expect(await screen.findByText(/Updated/i)).toBeInTheDocument();
  });

  it("shows an error when the watchlist brief request fails", async () => {
    requestBrief.mockReturnValue({
      unwrap: () => Promise.reject(new Error("brief failed")),
    });

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Generate watchlist brief/i }));

    expect(await screen.findByText(/Failed to queue watchlist brief/i)).toBeInTheDocument();
  });

  it("starts the worker and shows a success message", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Start LLM worker/i }));

    await waitFor(() => {
      expect(triggerWorker).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(/Worker started/i)).toBeInTheDocument();
  });
});
