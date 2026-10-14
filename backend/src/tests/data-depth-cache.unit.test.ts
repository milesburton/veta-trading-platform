import { assertEquals, assertRejects } from "jsr:@std/assert@0.217";
import { createSingleFlightCache } from "../journal/data-depth-cache.ts";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (err: Error) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

Deno.test("[data-depth-cache] concurrent callers share one in-flight load", async () => {
  const pending = deferred<number>();
  let loads = 0;
  const cache = createSingleFlightCache(() => {
    loads++;
    return pending.promise;
  }, 60_000);

  const first = cache.get();
  const second = cache.get();
  pending.resolve(42);

  assertEquals(await first, 42);
  assertEquals(await second, 42);
  assertEquals(loads, 1);
});

Deno.test("[data-depth-cache] serves the cached value until the ttl expires", async () => {
  let clock = 0;
  let loads = 0;
  const cache = createSingleFlightCache(() => Promise.resolve(++loads), 1_000, () => clock);

  assertEquals(await cache.get(), 1);
  clock = 999;
  assertEquals(await cache.get(), 1);
  clock = 1_000;
  assertEquals(await cache.get(), 2);
});

Deno.test("[data-depth-cache] a failed load is not cached and the next call retries", async () => {
  let loads = 0;
  const cache = createSingleFlightCache(() => {
    loads++;
    return loads === 1 ? Promise.reject(new Error("db down")) : Promise.resolve("ok");
  }, 60_000);

  await assertRejects(() => cache.get(), Error, "db down");
  assertEquals(await cache.get(), "ok");
  assertEquals(loads, 2);
});
