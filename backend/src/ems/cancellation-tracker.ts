const DEFAULT_TTL_MS = 6 * 60 * 60 * 1_000;
const DEFAULT_MAX_ENTRIES = 50_000;

export const PRIVILEGED_CANCEL_ROLES: ReadonlySet<string> = new Set([
  "admin",
  "risk-manager",
  "desk-head",
]);

export interface Cancellation {
  at: number;
  ownerId?: string;
  issuedBy?: string;
  issuedByRole?: string;
}

export type CancellationDetails = Omit<Cancellation, "at">;

export interface CancellationTracker {
  record: (ids: ReadonlyArray<string | undefined>, details?: CancellationDetails) => void;
  lookup: (ids: ReadonlyArray<string | undefined>) => Cancellation | null;
  isCancelled: (ids: ReadonlyArray<string | undefined>) => boolean;
  size: () => number;
  overCapacity: () => boolean;
}

export function cancellationApplies(
  cancellation: Cancellation,
  child: { userId?: string }
): boolean {
  if (cancellation.ownerId !== undefined) return cancellation.ownerId === child.userId;
  if (
    cancellation.issuedByRole !== undefined &&
    PRIVILEGED_CANCEL_ROLES.has(cancellation.issuedByRole)
  ) {
    return true;
  }
  if (cancellation.issuedBy !== undefined) return cancellation.issuedBy === child.userId;
  return true;
}

export function createCancellationTracker(
  now: () => number = Date.now,
  ttlMs: number = DEFAULT_TTL_MS,
  maxEntries: number = DEFAULT_MAX_ENTRIES
): CancellationTracker {
  const cancelled = new Map<string, Cancellation>();

  const expired = (entry: Cancellation): boolean => now() - entry.at > ttlMs;

  const pruneExpired = (): void => {
    for (const [id, entry] of cancelled) {
      if (!expired(entry)) break;
      cancelled.delete(id);
    }
  };

  const lookup = (ids: ReadonlyArray<string | undefined>): Cancellation | null => {
    for (const id of ids) {
      if (id === undefined) continue;
      const entry = cancelled.get(id);
      if (!entry) continue;
      if (expired(entry)) {
        cancelled.delete(id);
        continue;
      }
      return entry;
    }
    return null;
  };

  return {
    record: (ids, details = {}) => {
      const entry: Cancellation = { ...details, at: now() };
      for (const id of ids) {
        if (!id) continue;
        cancelled.delete(id);
        cancelled.set(id, entry);
      }
      pruneExpired();
    },
    lookup,
    isCancelled: (ids) => lookup(ids) !== null,
    size: () => cancelled.size,
    overCapacity: () => cancelled.size > maxEntries,
  };
}
