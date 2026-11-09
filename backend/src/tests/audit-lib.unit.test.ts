import { vi } from "vitest";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { appendAudit, auditHead, firstBrokenSeq, listAudit } from "../lib/audit.ts";
import type { Pool } from "../lib/db.ts";

function fakePool(rows: unknown[] = []) {
  const queryArray = vi.fn().mockResolvedValue({ rows: [] });
  const queryObject = vi.fn().mockResolvedValue({ rows });
  const release = vi.fn();
  const pool = {
    connect: () => Promise.resolve({ queryArray, queryObject, release }),
  } as unknown as Pool;
  return { pool, queryArray, queryObject, release };
}

test("[audit] appends an event with defaults for the optional fields", async () => {
  const { pool, queryArray, release } = fakePool();
  await appendAudit(pool, { actorId: "u1", actorRole: "admin", action: "x" });
  assertEquals(queryArray.mock.calls[0][1], [null, "u1", "admin", "x", null, "{}"]);
  assertEquals(release.mock.calls.length, 1);
});

test("[audit] appends an event with an explicit timestamp, target and detail", async () => {
  const { pool, queryArray } = fakePool();
  await appendAudit(pool, {
    actorId: "u1",
    actorRole: "admin",
    action: "x",
    target: "/t",
    detail: { a: 1 },
    ts: 5,
  });
  assertEquals(queryArray.mock.calls[0][1], [5, "u1", "admin", "x", "/t", '{"a":1}']);
});

test("[audit] reports the first broken sequence, or null when the chain is intact", async () => {
  assertEquals(await firstBrokenSeq(fakePool([{ broken: 7n }]).pool), 7);
  assertEquals(await firstBrokenSeq(fakePool([{ broken: null }]).pool), null);
  assertEquals(await firstBrokenSeq(fakePool([]).pool), null);
});

test("[audit] lists records newest first and clamps the page size", async () => {
  const row = {
    seq: 3n,
    ts: new Date(1000),
    actor_id: "u1",
    actor_role: "admin",
    action: "a",
    target: null,
    detail: {},
    hash: "h",
  };
  const { pool, queryObject } = fakePool([row]);
  const records = await listAudit(pool, { limit: 9999, beforeSeq: 10, actorId: "u1" });
  assertEquals(records[0], {
    seq: 3,
    ts: 1000,
    actorId: "u1",
    actorRole: "admin",
    action: "a",
    target: null,
    detail: {},
    hash: "h",
  });
  assertEquals(queryObject.mock.calls[0][1], [10, "u1", 500]);

  await listAudit(pool);
  assertEquals(queryObject.mock.calls[1][1], [null, null, 100]);
  await listAudit(pool, { limit: 0 });
  assertEquals(queryObject.mock.calls[2][1], [null, null, 1]);
});

test("[audit] reads the head and the anchor at a requested sequence", async () => {
  const rows = [
    { seq: 9n, hash: "head" },
    { seq: 4n, hash: "old" },
  ];
  assertEquals(await auditHead(fakePool(rows).pool, 4), {
    head: { seq: 9, hash: "head" },
    at: { seq: 4, hash: "old" },
  });
  assertEquals(await auditHead(fakePool(rows).pool), { head: { seq: 9, hash: "head" }, at: null });
  assertEquals(await auditHead(fakePool([]).pool, 4), { head: null, at: null });
});
