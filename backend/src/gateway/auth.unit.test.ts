import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { makeValidateToken } from "./auth.ts";
import type { AuthResult } from "./context.ts";

const realFetch = globalThis.fetch;

const baseAuthResult: AuthResult = {
  user: { id: "u1", name: "Test User", role: "trader", avatar_emoji: ":)" },
  limits: {
    max_order_qty: 100,
    max_daily_notional: 10_000,
    allowed_strategies: ["twap"],
  },
};

let nowMs = 1_700_000_000_000;

beforeEach(() => {
  nowMs = 1_700_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => nowMs);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

test("[gateway-auth] caches successful validation for the positive TTL", async () => {
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const result: AuthResult = {
      ...baseAuthResult,
      user: { ...baseAuthResult.user, id: String(body.token ?? "u1") },
    };
    return Promise.resolve(new Response(JSON.stringify(result), { status: 200 }));
  });
  globalThis.fetch = fetchMock as typeof fetch;

  const validate = makeValidateToken("http://user-service:5008");
  const token = "tok-success-123456";

  assertEquals(await validate(token), {
    ...baseAuthResult,
    user: { ...baseAuthResult.user, id: token },
  });
  assertEquals(await validate(token), {
    ...baseAuthResult,
    user: { ...baseAuthResult.user, id: token },
  });
  assertEquals(fetchMock.mock.calls.length, 1);
  assertEquals(String(fetchMock.mock.calls[0][0]), "http://user-service:5008/sessions/validate");
  assertEquals((fetchMock.mock.calls[0][1] as RequestInit).method, "POST");

  nowMs += 60_001;
  assertEquals(await validate(token), {
    ...baseAuthResult,
    user: { ...baseAuthResult.user, id: token },
  });
  assertEquals(fetchMock.mock.calls.length, 2);
});

test("[gateway-auth] caches denied responses for the negative TTL", async () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response("denied", { status: 401 })));
  globalThis.fetch = fetchMock as typeof fetch;

  const validate = makeValidateToken("http://user-service:5008");
  const token = "tok-denied-123456";

  assertEquals(await validate(token), null);
  assertEquals(await validate(token), null);
  assertEquals(fetchMock.mock.calls.length, 1);

  nowMs += 10_001;
  assertEquals(await validate(token), null);
  assertEquals(fetchMock.mock.calls.length, 2);
});

test("[gateway-auth] fetch errors return null and are not cached as denied", async () => {
  const fetchMock = vi.fn(() => Promise.reject(new Error("network down")));
  globalThis.fetch = fetchMock as typeof fetch;

  const validate = makeValidateToken("http://user-service:5008");
  const token = "tok-error-123456";

  assertEquals(await validate(token), null);
  assertEquals(await validate(token), null);
  assertEquals(fetchMock.mock.calls.length, 2);
});
