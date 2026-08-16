/** Clamps a requested page size to the service's hard cap of 100, defaulting to 50 when unspecified or invalid. */
export function clampLimit(rawLimit: string | null): number {
  return Math.min(100, Number(rawLimit ?? "50"));
}

/** Parses a requested page offset, defaulting to 0 when unspecified or invalid. */
export function parseOffset(rawOffset: string | null): number {
  return Number(rawOffset ?? "0");
}

/**
 * True when a Postgres error message indicates a foreign-key-constraint
 * violation. Used to distinguish "this session still has chunks retained
 * for compliance" from other, unrelated failures when deleting a replay
 * session — the two need different HTTP status codes and messages.
 */
export function isForeignKeyViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("violates foreign key constraint");
}
