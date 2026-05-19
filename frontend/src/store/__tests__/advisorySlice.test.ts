import {
  advisoryFailed,
  advisoryJobRunning,
  advisoryMarkedStale,
  advisoryNoteReceived,
  advisoryRequested,
  advisorySlice,
  MAX_ENTRIES,
  MAX_NOTE_AGE_MS,
  selectAdvisoryForSymbol,
} from "@veta/frontend/store/advisorySlice";
import { describe, expect, it } from "vitest";

const { reducer } = advisorySlice;

describe("advisorySlice", () => {
  it("creates an entry when advisory is requested", () => {
    const state = reducer(undefined, advisoryRequested({ symbol: "AAPL", jobId: "job-1" }));

    expect(state.bySymbol.AAPL.status).toBe("queued");
    expect(state.bySymbol.AAPL.jobId).toBe("job-1");
    expect(state.bySymbol.AAPL.errorMessage).toBeNull();
    expect(state.bySymbol.AAPL.requestedAt).not.toBeNull();
  });

  it("only marks a job running when the ids match", () => {
    let state = reducer(undefined, advisoryRequested({ symbol: "AAPL", jobId: "job-1" }));
    state = reducer(state, advisoryJobRunning({ symbol: "AAPL", jobId: "other" }));
    expect(state.bySymbol.AAPL.status).toBe("queued");

    state = reducer(state, advisoryJobRunning({ symbol: "AAPL", jobId: "job-1" }));
    expect(state.bySymbol.AAPL.status).toBe("running");
  });

  it("stores notes, failures, and stale transitions", () => {
    let state = reducer(
      undefined,
      advisoryNoteReceived({
        jobId: "job-2",
        symbol: "MSFT",
        noteId: "note-1",
        content: "Trim exposure.",
        provider: "openai",
        modelId: "gpt",
        createdAt: 123,
      })
    );

    expect(state.bySymbol.MSFT.status).toBe("ready");
    expect(state.bySymbol.MSFT.note?.content).toBe("Trim exposure.");

    state = reducer(state, advisoryMarkedStale({ symbol: "MSFT" }));
    expect(state.bySymbol.MSFT.status).toBe("stale");

    state = reducer(state, advisoryFailed({ symbol: "MSFT", error: "timeout" }));
    expect(state.bySymbol.MSFT.status).toBe("failed");
    expect(state.bySymbol.MSFT.errorMessage).toBe("timeout");
  });
});

describe("selectAdvisoryForSymbol", () => {
  it("returns a default not-requested entry when symbol is missing", () => {
    const entry = selectAdvisoryForSymbol({}, "NVDA", Date.now());

    expect(entry.status).toBe("not-requested");
    expect(entry.symbol).toBe("NVDA");
  });

  it("marks a ready note stale when it is older than the max age", () => {
    const now = Date.now();
    const entry = selectAdvisoryForSymbol(
      {
        AAPL: {
          symbol: "AAPL",
          status: "ready",
          jobId: "job-1",
          note: {
            id: "note-1",
            jobId: "job-1",
            symbol: "AAPL",
            content: "Reduce size.",
            provider: "openai",
            modelId: "gpt",
            promptTokens: 1,
            completionTokens: 1,
            latencyMs: 1,
            createdAt: now - MAX_NOTE_AGE_MS - 1,
          },
          errorMessage: null,
          requestedAt: now - MAX_NOTE_AGE_MS - 1,
          lastTouchedAt: now - MAX_NOTE_AGE_MS - 1,
        },
      },
      "AAPL",
      now
    );

    expect(entry.status).toBe("stale");
  });
});

describe("advisorySlice LRU cap", () => {
  it("evicts the least-recently-touched entry when over MAX_ENTRIES", () => {
    let state = reducer(undefined, advisoryRequested({ symbol: "SYM0", jobId: "j0" }));
    for (let i = 1; i <= MAX_ENTRIES; i++) {
      state = reducer(state, advisoryRequested({ symbol: `SYM${i}`, jobId: `j${i}` }));
    }
    expect(Object.keys(state.bySymbol).length).toBe(MAX_ENTRIES);
    expect(state.bySymbol.SYM0).toBeUndefined();
    expect(state.bySymbol[`SYM${MAX_ENTRIES}`]).toBeDefined();
  });

  it("touching an entry keeps it from being evicted", () => {
    let state = reducer(undefined, advisoryRequested({ symbol: "KEEP", jobId: "j-keep" }));
    for (let i = 0; i < 10; i++) {
      state = reducer(state, advisoryRequested({ symbol: `S${i}`, jobId: `j${i}` }));
    }
    state = reducer(state, advisoryJobRunning({ symbol: "KEEP", jobId: "j-keep" }));
    for (let i = 10; i < MAX_ENTRIES + 5; i++) {
      state = reducer(state, advisoryRequested({ symbol: `S${i}`, jobId: `j${i}` }));
    }
    expect(state.bySymbol.KEEP).toBeDefined();
  });
});
