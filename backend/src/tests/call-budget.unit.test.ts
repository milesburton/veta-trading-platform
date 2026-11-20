import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { createCallBudget, parseDailyLimit, utcDay } from "../market-data/call-budget.ts";

const at = (iso: string) => () => new Date(iso).getTime();

test("[call-budget] allows calls up to the daily limit then refuses", () => {
  const budget = createCallBudget({ limit: 2, clock: at("2026-11-20T10:00:00Z") });
  assertEquals(budget.tryConsume(), true);
  assertEquals(budget.tryConsume(), true);
  assertEquals(budget.tryConsume(), false);
  assertEquals(budget.remaining(), 0);
});

test("[call-budget] the count resets at the UTC day boundary", () => {
  let now = new Date("2026-11-20T23:59:00Z").getTime();
  const budget = createCallBudget({ limit: 1, clock: () => now });
  assertEquals(budget.tryConsume(), true);
  assertEquals(budget.tryConsume(), false);
  now = new Date("2026-11-21T00:00:01Z").getTime();
  assertEquals(budget.tryConsume(), true);
});

test("[call-budget] a limit of zero means unlimited", () => {
  const budget = createCallBudget({ limit: 0, clock: at("2026-11-20T10:00:00Z") });
  for (let i = 0; i < 1000; i++) assert(budget.tryConsume());
  assertEquals(budget.minGapMs, 0);
  assertEquals(budget.remaining(), Number.POSITIVE_INFINITY);
});

test("[call-budget] spaces calls evenly across the day", () => {
  assertEquals(
    createCallBudget({ limit: 25, clock: at("2026-11-20T10:00:00Z") }).minGapMs,
    3_456_000
  );
});

test("[call-budget] resumes from persisted state and reports every change", () => {
  const seen: unknown[] = [];
  const budget = createCallBudget({
    limit: 3,
    clock: at("2026-11-20T10:00:00Z"),
    initial: { day: "2026-11-20", used: 2 },
    onChange: (s) => seen.push(s),
  });
  assertEquals(budget.tryConsume(), true);
  assertEquals(budget.tryConsume(), false);
  assertEquals(seen, [{ day: "2026-11-20", used: 3 }]);
});

test("[call-budget] ignores stale persisted state from an earlier day", () => {
  const budget = createCallBudget({
    limit: 1,
    clock: at("2026-11-21T01:00:00Z"),
    initial: { day: "2026-11-20", used: 1 },
  });
  assertEquals(budget.tryConsume(), true);
});

test("[call-budget] parses the configured limit and falls back on bad input", () => {
  assertEquals(parseDailyLimit(undefined, 25), 25);
  assertEquals(parseDailyLimit("", 25), 25);
  assertEquals(parseDailyLimit("0", 25), 0);
  assertEquals(parseDailyLimit("75", 25), 75);
  assertEquals(parseDailyLimit("abc", 25), 25);
  assertEquals(parseDailyLimit("-5", 25), 25);
  assertEquals(utcDay(Date.parse("2026-11-20T23:59:59Z")), "2026-11-20");
});
