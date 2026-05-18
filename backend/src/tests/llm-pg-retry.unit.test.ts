import { assert, assertEquals, assertRejects } from "jsr:@std/assert@0.217";
import { isTransientPgError, withPgRetry } from "../llm-advisory/job-store.ts";

Deno.test("isTransientPgError — matches ConnectionReset variants", () => {
  assert(isTransientPgError(new Error("Connection reset by peer (os error 104)")));
  assert(isTransientPgError(Object.assign(new Error("x"), { name: "ConnectionReset" })));
  assert(isTransientPgError(new Error("ECONNRESET")));
  assert(isTransientPgError(new Error("ECONNREFUSED")));
  assert(isTransientPgError(new Error("connection closed before reply")));
  assert(isTransientPgError(new Error("Connection terminated unexpectedly")));
  assert(isTransientPgError(new Error("broken pipe")));
  assert(isTransientPgError(new Error("server closed the connection unexpectedly")));
});

Deno.test("isTransientPgError — does not match non-transient errors", () => {
  assert(!isTransientPgError(new Error("unique constraint violation")));
  assert(!isTransientPgError(new Error("syntax error at or near \"FROM\"")));
  assert(!isTransientPgError(new Error("permission denied for table jobs")));
  assert(!isTransientPgError("not an Error instance"));
  assert(!isTransientPgError(null));
  assert(!isTransientPgError(undefined));
});

Deno.test("withPgRetry — returns immediately on success", async () => {
  let calls = 0;
  const result = await withPgRetry(() => {
    calls += 1;
    return Promise.resolve(42);
  }, { label: "test" });
  assertEquals(result, 42);
  assertEquals(calls, 1);
});

Deno.test("withPgRetry — retries on transient error and succeeds", async () => {
  let calls = 0;
  const result = await withPgRetry(() => {
    calls += 1;
    if (calls < 3) return Promise.reject(new Error("Connection reset by peer"));
    return Promise.resolve("ok");
  }, { label: "test", baseDelayMs: 1 });
  assertEquals(result, "ok");
  assertEquals(calls, 3);
});

Deno.test("withPgRetry — does not retry non-transient errors", async () => {
  let calls = 0;
  await assertRejects(
    () =>
      withPgRetry(() => {
        calls += 1;
        return Promise.reject(new Error("unique violation"));
      }, { label: "test", baseDelayMs: 1 }),
    Error,
    "unique violation",
  );
  assertEquals(calls, 1);
});

Deno.test("withPgRetry — gives up after maxAttempts on persistent transient errors", async () => {
  let calls = 0;
  await assertRejects(
    () =>
      withPgRetry(() => {
        calls += 1;
        return Promise.reject(new Error("ECONNREFUSED"));
      }, { label: "test", maxAttempts: 3, baseDelayMs: 1 }),
    Error,
    "ECONNREFUSED",
  );
  assertEquals(calls, 3);
});
