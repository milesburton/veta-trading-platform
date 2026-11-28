import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { forgetUserSessions, handleSessionEvent, makeValidateToken } from "./auth.ts";
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

function sessionsFor(userId: string) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ ...baseAuthResult, user: { ...baseAuthResult.user, id: userId } }),
        { status: 200 }
      )
    )
  );
  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

for (const event of ["logout", "revoked"]) {
  test(`[gateway-auth] a ${event} event stops the cached session being accepted`, async () => {
    const userId = `user-${event}`;
    sessionsFor(userId);
    const validate = makeValidateToken("http://user-service:5008");
    const token = `tok-${event}-123456`;
    assertEquals((await validate(token))?.user.id, userId);

    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response("denied", { status: 401 }))
    ) as typeof fetch;
    handleSessionEvent({ event, userId, ts: nowMs });

    assertEquals(await validate(token), null);
  });
}

test("[gateway-auth] revoking one user keeps other users cached", async () => {
  const fetchMock = sessionsFor("user-kept");
  const validate = makeValidateToken("http://user-service:5008");
  await validate("tok-kept-123456");

  forgetUserSessions("someone-else");
  await validate("tok-kept-123456");

  assertEquals(fetchMock.mock.calls.length, 1);
});

test("[gateway-auth] login events and malformed events revoke nothing", async () => {
  const fetchMock = sessionsFor("user-login");
  const validate = makeValidateToken("http://user-service:5008");
  await validate("tok-login-123456");

  for (const value of [{ event: "login", userId: "user-login" }, { event: "logout" }, null, "x"]) {
    handleSessionEvent(value);
  }
  await validate("tok-login-123456");

  assertEquals(fetchMock.mock.calls.length, 1);
});

test("[gateway-auth] a validation that raced a revocation is not cached", async () => {
  const userId = "user-race";
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fetchMock = vi.fn(async () => {
    await gate;
    return new Response(
      JSON.stringify({ ...baseAuthResult, user: { ...baseAuthResult.user, id: userId } }),
      { status: 200 }
    );
  });
  globalThis.fetch = fetchMock as typeof fetch;
  const validate = makeValidateToken("http://user-service:5008");

  const inFlight = validate("tok-race-123456");
  forgetUserSessions(userId);
  release();
  await inFlight;
  await validate("tok-race-123456");

  assertEquals(fetchMock.mock.calls.length, 2);
});
