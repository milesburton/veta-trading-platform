export interface RetentionPolicy {
  hotDays: number;
  regulatoryYears: number;
}

export function hotRetentionMs(days: number): number {
  return days * 24 * 60 * 60 * 1_000;
}

export function resolveRetention(env: Record<string, string | undefined>): RetentionPolicy {
  return {
    hotDays: Number(env.JOURNAL_RETENTION_DAYS) || 90,
    regulatoryYears: 5,
  };
}

export interface PruneClient {
  queryArray: (sql: string, params?: unknown[]) => Promise<{ rowCount?: number | null }>;
}

export async function pruneJournalEvents(
  client: PruneClient,
  retentionMs: number
): Promise<number> {
  const result = await client.queryArray(
    "DELETE FROM journal.events WHERE ts < now() - ($1 || ' milliseconds')::interval",
    [retentionMs]
  );
  return result.rowCount ?? 0;
}
