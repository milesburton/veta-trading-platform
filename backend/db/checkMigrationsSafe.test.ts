import { assertEquals } from "https://deno.land/std@0.210.0/assert/mod.ts";
import { scanSql } from "./checkMigrationsSafe.ts";

Deno.test("flags DROP TABLE", () => {
  const v = scanSql("m.sql", "DROP TABLE public.orders;");
  assertEquals(v.length, 1);
  assertEquals(v[0].rule, "drop-table");
});

Deno.test("flags DROP COLUMN", () => {
  const v = scanSql("m.sql", "ALTER TABLE orders DROP COLUMN legacy_field;");
  assertEquals(v.some((x) => x.rule === "drop-column"), true);
});

Deno.test("flags DELETE without WHERE", () => {
  const v = scanSql("m.sql", "DELETE FROM sessions;");
  assertEquals(v.some((x) => x.rule === "delete-without-where"), true);
});

Deno.test("allows DELETE with WHERE", () => {
  const v = scanSql("m.sql", "DELETE FROM sessions WHERE expired = true;");
  assertEquals(v.some((x) => x.rule === "delete-without-where"), false);
});

Deno.test("flags TRUNCATE", () => {
  const v = scanSql("m.sql", "TRUNCATE TABLE audit_log;");
  assertEquals(v.some((x) => x.rule === "truncate"), true);
});

Deno.test("flags RENAME COLUMN", () => {
  const v = scanSql("m.sql", "ALTER TABLE orders RENAME COLUMN qty TO quantity;");
  assertEquals(v.some((x) => x.rule === "rename-column"), true);
});

Deno.test("flags NOT NULL column without default", () => {
  const v = scanSql("m.sql", "ALTER TABLE orders ADD COLUMN venue TEXT NOT NULL;");
  assertEquals(v.some((x) => x.rule === "add-not-null-no-default"), true);
});

Deno.test("allows NOT NULL column with default", () => {
  const v = scanSql("m.sql", "ALTER TABLE orders ADD COLUMN venue TEXT NOT NULL DEFAULT 'XOFF';");
  assertEquals(v.some((x) => x.rule === "add-not-null-no-default"), false);
});

Deno.test("allows additive CREATE TABLE IF NOT EXISTS", () => {
  const sql = `CREATE TABLE IF NOT EXISTS public.widgets (
    id TEXT PRIMARY KEY,
    name TEXT
  );`;
  assertEquals(scanSql("m.sql", sql).length, 0);
});

Deno.test("ignores destructive keywords inside comments", () => {
  const sql = `-- this migration does NOT drop table orders
CREATE TABLE IF NOT EXISTS public.notes (id TEXT PRIMARY KEY);
/* historically we would DROP COLUMN here but no longer */`;
  assertEquals(scanSql("m.sql", sql).length, 0);
});
