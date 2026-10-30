import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { scanSql } from "./checkMigrationsSafe.ts";

test("flags DROP TABLE", () => {
  const v = scanSql("m.sql", "DROP TABLE public.orders;");
  assertEquals(v.length, 1);
  assertEquals(v[0].rule, "drop-table");
});

test("flags DROP COLUMN", () => {
  const v = scanSql("m.sql", "ALTER TABLE orders DROP COLUMN legacy_field;");
  assertEquals(
    v.some((x) => x.rule === "drop-column"),
    true
  );
});

test("flags DELETE without WHERE", () => {
  const v = scanSql("m.sql", "DELETE FROM sessions;");
  assertEquals(
    v.some((x) => x.rule === "delete-without-where"),
    true
  );
});

test("allows DELETE with WHERE", () => {
  const v = scanSql("m.sql", "DELETE FROM sessions WHERE expired = true;");
  assertEquals(
    v.some((x) => x.rule === "delete-without-where"),
    false
  );
});

test("flags TRUNCATE", () => {
  const v = scanSql("m.sql", "TRUNCATE TABLE audit_log;");
  assertEquals(
    v.some((x) => x.rule === "truncate"),
    true
  );
});

test("allows a trigger that guards a table against TRUNCATE", () => {
  const v = scanSql(
    "m.sql",
    "CREATE TRIGGER no_truncate BEFORE TRUNCATE ON audit.events FOR EACH STATEMENT EXECUTE FUNCTION f();"
  );
  assertEquals(
    v.some((x) => x.rule === "truncate"),
    false
  );
});

test("flags RENAME COLUMN", () => {
  const v = scanSql("m.sql", "ALTER TABLE orders RENAME COLUMN qty TO quantity;");
  assertEquals(
    v.some((x) => x.rule === "rename-column"),
    true
  );
});

test("flags NOT NULL column without default", () => {
  const v = scanSql("m.sql", "ALTER TABLE orders ADD COLUMN venue TEXT NOT NULL;");
  assertEquals(
    v.some((x) => x.rule === "add-not-null-no-default"),
    true
  );
});

test("allows NOT NULL column with default", () => {
  const v = scanSql("m.sql", "ALTER TABLE orders ADD COLUMN venue TEXT NOT NULL DEFAULT 'XOFF';");
  assertEquals(
    v.some((x) => x.rule === "add-not-null-no-default"),
    false
  );
});

test("allows additive CREATE TABLE IF NOT EXISTS", () => {
  const sql = `CREATE TABLE IF NOT EXISTS public.widgets (
    id TEXT PRIMARY KEY,
    name TEXT
  );`;
  assertEquals(scanSql("m.sql", sql).length, 0);
});

test("ignores destructive keywords inside comments", () => {
  const sql = `-- this migration does NOT drop table orders
CREATE TABLE IF NOT EXISTS public.notes (id TEXT PRIMARY KEY);
/* historically we would DROP COLUMN here but no longer */`;
  assertEquals(scanSql("m.sql", sql).length, 0);
});
