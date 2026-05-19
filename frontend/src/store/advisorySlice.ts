import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import { isSafeKey } from "./safeKey.ts";

export type AdvisoryStatus = "not-requested" | "queued" | "running" | "ready" | "failed" | "stale";

export interface AdvisoryNoteData {
  id: string;
  jobId: string;
  symbol: string;
  content: string;
  provider: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  createdAt: number;
}

export interface AdvisoryEntry {
  symbol: string;
  status: AdvisoryStatus;
  jobId: string | null;
  note: AdvisoryNoteData | null;
  errorMessage: string | null;
  requestedAt: number | null;
  lastTouchedAt: number;
}

interface AdvisoryState {
  bySymbol: Record<string, AdvisoryEntry>;
}

const initialState: AdvisoryState = {
  bySymbol: {},
};

export const MAX_ENTRIES = 100;

let touchCounter = 0;
function nextTouch(): number {
  touchCounter += 1;
  return touchCounter;
}

function evictIfOverCap(state: AdvisoryState): void {
  const symbols = Object.keys(state.bySymbol);
  if (symbols.length <= MAX_ENTRIES) return;
  const sorted = symbols.sort(
    (a, b) => state.bySymbol[a].lastTouchedAt - state.bySymbol[b].lastTouchedAt
  );
  for (const sym of sorted.slice(0, symbols.length - MAX_ENTRIES)) {
    delete state.bySymbol[sym];
  }
}

function ensureEntry(state: AdvisoryState, symbol: string): AdvisoryEntry | null {
  if (!isSafeKey(symbol)) return null;
  const existing = state.bySymbol[symbol];
  if (existing) {
    existing.lastTouchedAt = nextTouch();
    return existing;
  }
  const fresh: AdvisoryEntry = {
    symbol,
    status: "not-requested",
    jobId: null,
    note: null,
    errorMessage: null,
    requestedAt: null,
    lastTouchedAt: nextTouch(),
  };
  state.bySymbol[symbol] = fresh;
  evictIfOverCap(state);
  return fresh;
}

export const advisorySlice = createSlice({
  name: "advisory",
  initialState,
  reducers: {
    advisoryRequested(state, action: PayloadAction<{ symbol: string; jobId: string }>) {
      const entry = ensureEntry(state, action.payload.symbol);
      if (!entry) return;
      entry.status = "queued";
      entry.jobId = action.payload.jobId;
      entry.errorMessage = null;
      entry.requestedAt = Date.now();
    },
    advisoryJobRunning(state, action: PayloadAction<{ symbol: string; jobId: string }>) {
      const entry = ensureEntry(state, action.payload.symbol);
      if (!entry) return;
      if (entry.jobId === action.payload.jobId) {
        entry.status = "running";
      }
    },
    advisoryNoteReceived(
      state,
      action: PayloadAction<{
        jobId: string;
        symbol: string;
        noteId: string;
        content: string;
        provider: string;
        modelId: string;
        createdAt: number;
      }>
    ) {
      const p = action.payload;
      const entry = ensureEntry(state, p.symbol);
      if (!entry) return;
      entry.status = "ready";
      entry.jobId = p.jobId;
      entry.note = {
        id: p.noteId,
        jobId: p.jobId,
        symbol: p.symbol,
        content: p.content,
        provider: p.provider,
        modelId: p.modelId,
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 0,
        createdAt: p.createdAt,
      };
      entry.errorMessage = null;
    },
    advisoryFailed(state, action: PayloadAction<{ symbol: string; error: string }>) {
      const entry = ensureEntry(state, action.payload.symbol);
      if (!entry) return;
      entry.status = "failed";
      entry.errorMessage = action.payload.error;
    },
    advisoryMarkedStale(state, action: PayloadAction<{ symbol: string }>) {
      if (!isSafeKey(action.payload.symbol)) return;
      const entry = state.bySymbol[action.payload.symbol];
      if (entry && entry.status === "ready") {
        entry.status = "stale";
      }
    },
  },
});

export const {
  advisoryRequested,
  advisoryJobRunning,
  advisoryNoteReceived,
  advisoryFailed,
  advisoryMarkedStale,
} = advisorySlice.actions;

export const MAX_NOTE_AGE_MS = 300_000;

export function selectAdvisoryForSymbol(
  bySymbol: Record<string, AdvisoryEntry>,
  symbol: string,
  now: number
): AdvisoryEntry {
  const entry = bySymbol[symbol] ?? {
    symbol,
    status: "not-requested" as AdvisoryStatus,
    jobId: null,
    note: null,
    errorMessage: null,
    requestedAt: null,
    lastTouchedAt: now,
  };
  if (
    entry.status === "ready" &&
    entry.note !== null &&
    now - entry.note.createdAt > MAX_NOTE_AGE_MS
  ) {
    return { ...entry, status: "stale" };
  }
  return entry;
}
