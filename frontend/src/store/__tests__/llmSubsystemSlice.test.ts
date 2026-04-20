import { describe, expect, it } from "vitest";
import { llmStateReceived, llmSubsystemSlice } from "../llmSubsystemSlice";
import type { LlmSubsystemStatus } from "../llmSubsystemSlice";

const { reducer } = llmSubsystemSlice;
const initialState = { status: null, lastUpdated: null };

function makeStatus(
  overrides: Partial<LlmSubsystemStatus> = {},
): LlmSubsystemStatus {
  return {
    state: "armed",
    policy: {
      enabled: true,
      workerEnabled: true,
      triggerMode: "manual",
      minRefreshMinutes: 5,
      workerIdleTimeoutSeconds: 60,
      workerMaxJobsPerSession: 10,
      maxConcurrentJobs: 2,
    },
    pendingJobs: 0,
    trackedSymbols: 3,
    triggerMode: "manual",
    workerEnabled: true,
    ts: 1000,
    ...overrides,
  };
}

describe("llmSubsystemSlice", () => {
  it("starts with null status", () => {
    expect(reducer(undefined, { type: "@@INIT" }).status).toBeNull();
    expect(reducer(undefined, { type: "@@INIT" }).lastUpdated).toBeNull();
  });

  it("updates status on llmStateReceived", () => {
    const status = makeStatus({ state: "active", pendingJobs: 2 });
    const state = reducer(initialState, llmStateReceived(status));
    expect(state.status?.state).toBe("active");
    expect(state.status?.pendingJobs).toBe(2);
  });

  it("records lastUpdated timestamp on llmStateReceived", () => {
    const before = Date.now();
    const state = reducer(initialState, llmStateReceived(makeStatus()));
    expect(state.lastUpdated).toBeGreaterThanOrEqual(before);
  });

  it("overwrites previous status on subsequent updates", () => {
    let state = reducer(
      initialState,
      llmStateReceived(makeStatus({ state: "armed" })),
    );
    state = reducer(state, llmStateReceived(makeStatus({ state: "cooldown" })));
    expect(state.status?.state).toBe("cooldown");
  });
});
