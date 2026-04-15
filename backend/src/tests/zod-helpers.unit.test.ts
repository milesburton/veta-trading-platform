import {
  assert,
  assertEquals,
} from "jsr:@std/assert@0.217";
import { z } from "@veta/zod";

import { parseBody, parseQuery } from "../lib/http.ts";
import {
  OrderSideSchema,
  StrategySchema,
} from "../schemas/primitives.ts";

function bodyRequest(data: unknown): Request {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

function badJsonRequest(): Request {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ not json",
  });
}

const ExampleSchema = z.object({
  userId: z.string().min(1),
  side: OrderSideSchema,
  strategy: StrategySchema.optional(),
  quantity: z.number().positive(),
});

Deno.test("[parseBody] happy path returns parsed data", async () => {
  const result = await parseBody(
    bodyRequest({ userId: "u1", side: "BUY", quantity: 10 }),
    ExampleSchema,
  );
  assert(result.ok);
  if (!result.ok) return;
  assertEquals(result.data.userId, "u1");
  assertEquals(result.data.side, "BUY");
  assertEquals(result.data.quantity, 10);
});

Deno.test("[parseBody] invalid JSON returns 400 with 'invalid json'", async () => {
  const result = await parseBody(badJsonRequest(), ExampleSchema);
  assert(!result.ok);
  if (result.ok) return;
  assertEquals(result.res.status, 400);
  const body = await result.res.json();
  assertEquals(body.error, "invalid json");
});

Deno.test("[parseBody] schema failure returns 400 with validation_failed + issues", async () => {
  const result = await parseBody(
    bodyRequest({ userId: "u1", side: "WAT", quantity: -5 }),
    ExampleSchema,
  );
  assert(!result.ok);
  if (result.ok) return;
  assertEquals(result.res.status, 400);
  const body = await result.res.json();
  assertEquals(body.error, "validation_failed");
  assert(Array.isArray(body.issues));
  assert(body.issues.length >= 1);
});

Deno.test("[parseBody] missing required field produces issue with path", async () => {
  const result = await parseBody(
    bodyRequest({ side: "BUY", quantity: 10 }),
    ExampleSchema,
  );
  assert(!result.ok);
  if (result.ok) return;
  const body = await result.res.json();
  const paths = body.issues.map((i: { path: (string | number)[] }) => i.path.join("."));
  assert(paths.includes("userId"), `expected userId issue, got: ${JSON.stringify(paths)}`);
});

Deno.test("[parseBody] optional field omitted is allowed", async () => {
  const result = await parseBody(
    bodyRequest({ userId: "u1", side: "SELL", quantity: 1 }),
    ExampleSchema,
  );
  assert(result.ok);
  if (!result.ok) return;
  assertEquals(result.data.strategy, undefined);
});

Deno.test("[parseQuery] parses and coerces from URL search params", () => {
  const schema = z.object({
    symbol: z.string().min(1),
    limit: z.coerce.number().int().positive(),
  });
  const url = new URL("http://localhost/x?symbol=AAPL&limit=50");
  const result = parseQuery(url, schema);
  assert(result.ok);
  if (!result.ok) return;
  assertEquals(result.data.symbol, "AAPL");
  assertEquals(result.data.limit, 50);
});

Deno.test("[parseQuery] missing required param returns 400", () => {
  const schema = z.object({ symbol: z.string().min(1) });
  const url = new URL("http://localhost/x");
  const result = parseQuery(url, schema);
  assert(!result.ok);
});

Deno.test("[primitives] OrderSideSchema accepts BUY/SELL only", () => {
  assert(OrderSideSchema.safeParse("BUY").success);
  assert(OrderSideSchema.safeParse("SELL").success);
  assert(!OrderSideSchema.safeParse("buy").success);
  assert(!OrderSideSchema.safeParse("HOLD").success);
});

Deno.test("[primitives] StrategySchema rejects unknown algos", () => {
  assert(StrategySchema.safeParse("TWAP").success);
  assert(StrategySchema.safeParse("VWAP").success);
  assert(!StrategySchema.safeParse("UNKNOWN").success);
});
