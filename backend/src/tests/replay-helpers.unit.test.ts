import { assertEquals } from "jsr:@std/assert@0.217";
import { clampLimit, isForeignKeyViolation, parseOffset } from "../replay/replay-helpers.ts";

// ── clampLimit ───────────────────────────────────────────────────────────────

Deno.test("[replay-helpers] defaults to 50 when no limit is given", () => {
  assertEquals(clampLimit(null), 50);
});

Deno.test("[replay-helpers] a requested limit under the cap is honored", () => {
  assertEquals(clampLimit("20"), 20);
});

Deno.test("[replay-helpers] a requested limit above 100 is clamped down to 100", () => {
  assertEquals(clampLimit("500"), 100);
});

Deno.test("[replay-helpers] exactly 100 is not reduced further", () => {
  assertEquals(clampLimit("100"), 100);
});

// ── parseOffset ──────────────────────────────────────────────────────────────

Deno.test("[replay-helpers] defaults to 0 when no offset is given", () => {
  assertEquals(parseOffset(null), 0);
});

Deno.test("[replay-helpers] a requested offset is parsed as a number", () => {
  assertEquals(parseOffset("150"), 150);
});

// ── isForeignKeyViolation ────────────────────────────────────────────────────

Deno.test("[replay-helpers] recognises a Postgres FK-constraint error message", () => {
  const err = new Error('update or delete on table "sessions" violates foreign key constraint "chunks_session_id_fkey"');
  assertEquals(isForeignKeyViolation(err), true);
});

Deno.test("[replay-helpers] does not flag an unrelated error", () => {
  assertEquals(isForeignKeyViolation(new Error("connection timeout")), false);
});

Deno.test("[replay-helpers] handles a non-Error thrown value", () => {
  assertEquals(isForeignKeyViolation("violates foreign key constraint"), true);
  assertEquals(isForeignKeyViolation("some other string"), false);
});
