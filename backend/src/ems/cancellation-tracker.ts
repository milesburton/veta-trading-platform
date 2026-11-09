const DEFAULT_TTL_MS = 6 * 60 * 60 * 1_000;
const MAX_ENTRIES = 50_000;

export interface CancellationTracker {
  record: (ids: ReadonlyArray<string | undefined>) => void;
  isCancelled: (ids: ReadonlyArray<string | undefined>) => boolean;
  size: () => number;
}

export function createCancellationTracker(
  now: () => number = Date.now,
  ttlMs: number = DEFAULT_TTL_MS
): CancellationTracker {
  const cancelled = new Map<string, number>();

  const prune = (): void => {
    const cutoff = now() - ttlMs;
    for (const [id, at] of cancelled) {
      if (at >= cutoff && cancelled.size <= MAX_ENTRIES) break;
      cancelled.delete(id);
    }
  };

  return {
    record: (ids) => {
      const at = now();
      for (const id of ids) {
        if (id) cancelled.set(id, at);
      }
      prune();
    },
    isCancelled: (ids) => ids.some((id) => id !== undefined && cancelled.has(id)),
    size: () => cancelled.size,
  };
}
