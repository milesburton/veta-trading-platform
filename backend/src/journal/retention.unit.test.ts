import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { hotRetentionMs, pruneJournalEvents, resolveRetention } from "./retention.ts";

test("[retention] defaults to 90 hot days and 5 regulatory years", () => {
  assertEquals(resolveRetention({}), { hotDays: 90, regulatoryYears: 5 });
  assertEquals(resolveRetention({ JOURNAL_RETENTION_DAYS: "30" }).hotDays, 30);
});

test("[retention] converts days to milliseconds", () => {
  assertEquals(hotRetentionMs(1), 86_400_000);
});

test("[retention] prune deletes only from the hot journal and reports the count", async () => {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const removed = await pruneJournalEvents(
    {
      queryArray: async (sql, params) => {
        calls.push({ sql, params });
        return { rowCount: 7 };
      },
    },
    5000
  );
  assertEquals(removed, 7);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].sql.includes("journal.events"), true);
  assertEquals(calls[0].sql.includes("regulatory"), false);
});
