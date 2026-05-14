import { assertEquals } from "jsr:@std/assert@0.217";
import { decideAccessLog, type ThrottleEntry } from "../gateway/accessLogThrottle.ts";

Deno.test("decideAccessLog: first event for a key always emits", () => {
  const state = new Map<string, ThrottleEntry>();
  const decision = decideAccessLog(state, "auth_failure:bad_token", 1_000, 1_000);
  assertEquals(decision.shouldEmit, true);
  assertEquals(decision.suppressedSince, 0);
});

Deno.test("decideAccessLog: events within throttle window are suppressed", () => {
  const state = new Map<string, ThrottleEntry>();
  decideAccessLog(state, "auth_failure:bad_token", 1_000, 1_000);
  const second = decideAccessLog(state, "auth_failure:bad_token", 1_500, 1_000);
  const third = decideAccessLog(state, "auth_failure:bad_token", 1_900, 1_000);
  assertEquals(second.shouldEmit, false);
  assertEquals(third.shouldEmit, false);
});

Deno.test("decideAccessLog: next emit after throttle reports suppressed count", () => {
  const state = new Map<string, ThrottleEntry>();
  decideAccessLog(state, "auth_failure:bad_token", 0, 1_000);
  decideAccessLog(state, "auth_failure:bad_token", 100, 1_000);
  decideAccessLog(state, "auth_failure:bad_token", 500, 1_000);
  decideAccessLog(state, "auth_failure:bad_token", 900, 1_000);
  const afterWindow = decideAccessLog(state, "auth_failure:bad_token", 1_500, 1_000);
  assertEquals(afterWindow.shouldEmit, true);
  assertEquals(afterWindow.suppressedSince, 3);
});

Deno.test("decideAccessLog: independent keys throttle independently", () => {
  const state = new Map<string, ThrottleEntry>();
  decideAccessLog(state, "auth_failure:bad_token", 0, 1_000);
  const otherFirst = decideAccessLog(state, "auth_failure:csrf", 100, 1_000);
  const sameKey = decideAccessLog(state, "auth_failure:bad_token", 100, 1_000);
  assertEquals(otherFirst.shouldEmit, true);
  assertEquals(sameKey.shouldEmit, false);
});

Deno.test("decideAccessLog: resets suppressed counter after an emit", () => {
  const state = new Map<string, ThrottleEntry>();
  decideAccessLog(state, "auth_failure:bad_token", 0, 1_000);
  decideAccessLog(state, "auth_failure:bad_token", 100, 1_000);
  decideAccessLog(state, "auth_failure:bad_token", 200, 1_000);
  const flush = decideAccessLog(state, "auth_failure:bad_token", 1_500, 1_000);
  assertEquals(flush.suppressedSince, 2);
  const nextWindow = decideAccessLog(state, "auth_failure:bad_token", 3_000, 1_000);
  assertEquals(nextWindow.suppressedSince, 0);
});
