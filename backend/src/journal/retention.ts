export interface RetentionPolicy {
  hotDays: number;
  regulatoryYears: number;
  dryRun: boolean;
}

export function hotRetentionMs(days: number): number {
  return days * 24 * 60 * 60 * 1_000;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function resolveRetention(env: Record<string, string | undefined>): RetentionPolicy {
  return {
    hotDays: Number(env.JOURNAL_RETENTION_DAYS) || 90,
    regulatoryYears: 5,
    dryRun: parseBoolean(env.JOURNAL_RETENTION_DRY_RUN, false),
  };
}

export interface PruneClient {
  queryArray: (
    sql: string,
    params?: unknown[]
  ) => Promise<{
    rowCount?: number | null;
    rows?: unknown[][];
  }>;
}

function toCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function pruneJournalEvents(
  client: PruneClient,
  retentionMs: number,
  options: { dryRun?: boolean } = {}
): Promise<number> {
  if (options.dryRun) {
    const result = await client.queryArray(
      "SELECT COUNT(*)::bigint FROM journal.events WHERE ts < now() - ($1 || ' milliseconds')::interval",
      [retentionMs]
    );
    return toCount(result.rows?.[0]?.[0]);
  }

  const result = await client.queryArray(
    "DELETE FROM journal.events WHERE ts < now() - ($1 || ' milliseconds')::interval",
    [retentionMs]
  );
  return result.rowCount ?? 0;
}
