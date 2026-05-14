export interface ThrottleEntry {
  lastEmitMs: number;
  suppressed: number;
}

export interface ThrottleDecision {
  shouldEmit: boolean;
  suppressedSince: number;
}

export function decideAccessLog(
  state: Map<string, ThrottleEntry>,
  key: string,
  nowMs: number,
  throttleMs: number,
): ThrottleDecision {
  const entry = state.get(key);
  if (entry && nowMs - entry.lastEmitMs < throttleMs) {
    entry.suppressed += 1;
    return { shouldEmit: false, suppressedSince: 0 };
  }
  const suppressedSince = entry?.suppressed ?? 0;
  state.set(key, { lastEmitMs: nowMs, suppressed: 0 });
  return { shouldEmit: true, suppressedSince };
}
