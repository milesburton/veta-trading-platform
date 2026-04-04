import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";
import { JOURNAL_URL, timeout as t } from "./test-helpers.ts";

Deno.test("[journal/http] GET /health returns ok with retentionDays", async () => {
  const res = await fetch(`${JOURNAL_URL}/health`, { signal: t(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json() as {
    status: string;
    retentionDays: number;
    version: string;
  };
  assertEquals(body.status, "ok");
  assert(typeof body.retentionDays === "number" && body.retentionDays > 0);
  assertExists(body.version);
});

Deno.test("[journal/http] GET /candles requires instrument param", async () => {
  const res = await fetch(`${JOURNAL_URL}/candles`, { signal: t(5_000) });
  assertEquals(res.status, 400);
  const body = await res.json() as { error: string };
  assert(body.error.includes("instrument"));
});

Deno.test("[journal/http] GET /candles?instrument=AAPL&interval=1m returns array", async () => {
  const res = await fetch(
    `${JOURNAL_URL}/candles?instrument=AAPL&interval=1m&limit=10`,
    { signal: t(8_000) },
  );
  assertEquals(res.status, 200);
  const body = await res.json() as unknown[];
  assert(Array.isArray(body));
});

Deno.test("[journal/http] GET /candles?interval=invalid returns 400", async () => {
  const res = await fetch(
    `${JOURNAL_URL}/candles?instrument=AAPL&interval=2h`,
    { signal: t(5_000) },
  );
  assertEquals(res.status, 400);
  res.body?.cancel();
});

Deno.test("[journal/http] GET /candles candle shape has required OHLCV fields", async () => {
  const res = await fetch(
    `${JOURNAL_URL}/candles?instrument=AAPL&interval=1m&limit=5`,
    { signal: t(8_000) },
  );
  assertEquals(res.status, 200);
  const candles = await res.json() as Record<string, unknown>[];
  if (candles.length === 0) return;
  const c = candles[0];
  for (const field of ["time", "open", "high", "low", "close", "volume"]) {
    assertExists(c[field], `Missing field: ${field}`);
  }
});

Deno.test("[journal/http] GET /orders returns array with required fields", async () => {
  const res = await fetch(`${JOURNAL_URL}/orders?limit=10`, {
    signal: t(8_000),
  });
  assertEquals(res.status, 200);
  const body = await res.json() as Record<string, unknown>[];
  assert(Array.isArray(body));
  if (body.length === 0) return;
  const o = body[0];
  for (
    const field of ["id", "asset", "side", "quantity", "status", "strategy"]
  ) {
    assertExists(o[field], `Missing field: ${field}`);
  }
});

Deno.test("[journal/http] POST /grid/query orderBlotter returns rows + total + evalMs", async () => {
  const res = await fetch(`${JOURNAL_URL}/grid/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gridId: "orderBlotter",
      filterExpr: { kind: "group", id: "root", join: "AND", rules: [] },
      sortField: null,
      sortDir: null,
      offset: 0,
      limit: 5,
    }),
    signal: t(10_000),
  });
  assertEquals(res.status, 200);
  const body = await res.json() as {
    rows: unknown[];
    total: number;
    evalMs: number;
  };
  assert(Array.isArray(body.rows));
  assert(typeof body.total === "number" && body.total >= 0);
  assert(typeof body.evalMs === "number" && body.evalMs >= 0);
});

Deno.test("[journal/http] POST /grid/query executions grid returns child-level rows", async () => {
  const res = await fetch(`${JOURNAL_URL}/grid/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gridId: "executions",
      filterExpr: { kind: "group", id: "root", join: "AND", rules: [] },
      sortField: null,
      sortDir: null,
      offset: 0,
      limit: 10,
    }),
    signal: t(10_000),
  });
  assertEquals(res.status, 200);
  const body = await res.json() as { rows: unknown[]; total: number };
  assert(Array.isArray(body.rows));
  assert(typeof body.total === "number");
});

Deno.test("[journal/http] POST /grid/query filter by asset returns matching rows only", async () => {
  const res = await fetch(`${JOURNAL_URL}/grid/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gridId: "orderBlotter",
      filterExpr: {
        kind: "group",
        id: "root",
        join: "AND",
        rules: [{
          kind: "rule",
          id: "r1",
          field: "asset",
          op: "=",
          value: "AAPL",
        }],
      },
      sortField: null,
      sortDir: null,
      offset: 0,
      limit: 20,
    }),
    signal: t(10_000),
  });
  assertEquals(res.status, 200);
  const body = await res.json() as { rows: Record<string, unknown>[] };
  for (const row of body.rows) {
    assertEquals(row.asset, "AAPL", `Row asset "${row.asset}" should be AAPL`);
  }
});

Deno.test("[journal/http] POST /grid/query sort by quantity desc: first row ≥ last row", async () => {
  const res = await fetch(`${JOURNAL_URL}/grid/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gridId: "orderBlotter",
      filterExpr: { kind: "group", id: "root", join: "AND", rules: [] },
      sortField: "quantity",
      sortDir: "desc",
      offset: 0,
      limit: 20,
    }),
    signal: t(10_000),
  });
  assertEquals(res.status, 200);
  const body = await res.json() as { rows: { quantity: number }[] };
  if (body.rows.length < 2) return;
  assert(
    body.rows[0].quantity >= body.rows[body.rows.length - 1].quantity,
    `Expected descending quantity: first=${body.rows[0].quantity} last=${
      body.rows[body.rows.length - 1].quantity
    }`,
  );
});

Deno.test("[journal/http] POST /grid/query missing gridId returns 400", async () => {
  const res = await fetch(`${JOURNAL_URL}/grid/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filterExpr: { kind: "group", id: "root", join: "AND", rules: [] },
    }),
    signal: t(5_000),
  });
  assertEquals(res.status, 400);
  res.body?.cancel();
});

Deno.test("[journal/http] POST /grid/query invalid JSON returns 400", async () => {
  const res = await fetch(`${JOURNAL_URL}/grid/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ not valid json",
    signal: t(5_000),
  });
  assertEquals(res.status, 400);
  res.body?.cancel();
});

Deno.test("[journal/http] POST /grid/query pagination: offset advances cursor", async () => {
  const fetchPage = (offset: number) =>
    fetch(`${JOURNAL_URL}/grid/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gridId: "orderBlotter",
        filterExpr: { kind: "group", id: "root", join: "AND", rules: [] },
        sortField: "id",
        sortDir: "asc",
        offset,
        limit: 3,
      }),
      signal: t(10_000),
    }).then((r) =>
      r.json() as Promise<{ rows: { id: string }[]; total: number }>
    );

  const page0 = await fetchPage(0);
  const page1 = await fetchPage(3);

  if (page0.rows.length < 3 || page1.rows.length === 0) return;
  const ids0 = page0.rows.map((r) => r.id);
  const ids1 = page1.rows.map((r) => r.id);
  for (const id of ids1) {
    assert(!ids0.includes(id), `id ${id} appeared on both page 0 and page 1`);
  }
});
