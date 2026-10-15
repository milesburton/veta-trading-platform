import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { clampLimit, isForeignKeyViolation, parseOffset } from "../replay/replay-helpers.ts";

// ── clampLimit ───────────────────────────────────────────────────────────────

test("[replay-helpers] defaults to 50 when no limit is given", () => {
  assertEquals(clampLimit(null), 50);
});

test("[replay-helpers] a requested limit under the cap is honored", () => {
  assertEquals(clampLimit("20"), 20);
});

test("[replay-helpers] a requested limit above 100 is clamped down to 100", () => {
  assertEquals(clampLimit("500"), 100);
});

test("[replay-helpers] exactly 100 is not reduced further", () => {
  assertEquals(clampLimit("100"), 100);
});

// ── parseOffset ──────────────────────────────────────────────────────────────

test("[replay-helpers] defaults to 0 when no offset is given", () => {
  assertEquals(parseOffset(null), 0);
});

test("[replay-helpers] a requested offset is parsed as a number", () => {
  assertEquals(parseOffset("150"), 150);
});

// ── isForeignKeyViolation ────────────────────────────────────────────────────

test("[replay-helpers] recognises a Postgres FK-constraint error message", () => {
  const err = new Error(
    'update or delete on table "sessions" violates foreign key constraint "chunks_session_id_fkey"'
  );
  assertEquals(isForeignKeyViolation(err), true);
});

test("[replay-helpers] does not flag an unrelated error", () => {
  assertEquals(isForeignKeyViolation(new Error("connection timeout")), false);
});

test("[replay-helpers] handles a non-Error thrown value", () => {
  assertEquals(isForeignKeyViolation("violates foreign key constraint"), true);
  assertEquals(isForeignKeyViolation("some other string"), false);
});
