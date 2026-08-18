import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { clientIp, RateLimiter, rateLimitResponse } from "@veta/rate-limit";

Deno.test("RateLimiter: allows requests up to capacity, then blocks", () => {
  const limiter = new RateLimiter({ capacity: 3, refillPerSecond: 1 });
  const now = 1_000_000;
  assertEquals(limiter.consume("a", now).allowed, true);
  assertEquals(limiter.consume("a", now).allowed, true);
  assertEquals(limiter.consume("a", now).allowed, true);
  const blocked = limiter.consume("a", now);
  assertEquals(blocked.allowed, false);
  assert(blocked.retryAfterMs >= 1000, `retryAfterMs was ${blocked.retryAfterMs}`);
});

Deno.test("RateLimiter: refills tokens at the configured rate", () => {
  const limiter = new RateLimiter({ capacity: 2, refillPerSecond: 4 });
  const t0 = 1_000_000;
  limiter.consume("a", t0);
  limiter.consume("a", t0);
  assertEquals(limiter.consume("a", t0).allowed, false);
  const halfSecondLater = limiter.consume("a", t0 + 500);
  assertEquals(halfSecondLater.allowed, true);
});

Deno.test("RateLimiter: keys are independent buckets", () => {
  const limiter = new RateLimiter({ capacity: 1, refillPerSecond: 1 });
  const now = 1_000_000;
  assertEquals(limiter.consume("a", now).allowed, true);
  assertEquals(limiter.consume("a", now).allowed, false);
  assertEquals(limiter.consume("b", now).allowed, true);
});

Deno.test("RateLimiter: capacity is the burst ceiling, idle tokens cap out", () => {
  const limiter = new RateLimiter({ capacity: 5, refillPerSecond: 100 });
  const t0 = 1_000_000;
  limiter.consume("a", t0);
  const now = t0 + 60_000;
  const results = Array.from({ length: 100 }, () => limiter.consume("a", now));
  const consecutiveAllowed = results.findIndex((r) => !r.allowed);
  assertEquals(consecutiveAllowed, 5);
});

Deno.test("RateLimiter: stale buckets get swept", () => {
  const limiter = new RateLimiter({ capacity: 1, refillPerSecond: 1 });
  const t0 = 1_000_000;
  limiter.consume("a", t0);
  limiter.consume("b", t0);
  assertEquals(limiter.size(), 2);
  limiter.consume("c", t0 + 60_001 + 4 * 1_000 + 1);
  assert(limiter.size() <= 1, `expected stale buckets swept, got ${limiter.size()}`);
});

Deno.test("clientIp: prefers X-Forwarded-For, falls back to X-Real-IP, then unknown", () => {
  const r1 = new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } });
  assertEquals(clientIp(r1), "203.0.113.7");

  const r2 = new Request("http://x", { headers: { "x-real-ip": "203.0.113.8" } });
  assertEquals(clientIp(r2), "203.0.113.8");

  const r3 = new Request("http://x");
  assertEquals(clientIp(r3), "unknown");
});

Deno.test("rateLimitResponse returns a 429 with JSON body + Retry-After header", async () => {
  const res = rateLimitResponse(5_500);
  assertEquals(res.status, 429);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  assertEquals(res.headers.get("Retry-After"), "6");
  const body = await res.json();
  assertEquals(body.error, "rate_limited");
  assertEquals(body.retryAfterSeconds, 6);
});

Deno.test("rateLimitResponse clamps Retry-After to a minimum of 1 second", async () => {
  const res = rateLimitResponse(0);
  assertEquals(res.headers.get("Retry-After"), "1");
  const body = await res.json();
  assertEquals(body.retryAfterSeconds, 1);
});

Deno.test("rateLimitResponse rounds up sub-second remainders", () => {
  const res = rateLimitResponse(1_001);
  assertEquals(res.headers.get("Retry-After"), "2");
});
