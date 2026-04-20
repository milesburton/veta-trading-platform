import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userApi } from "../userApi";

const NativeRequest = Request;

function installRelativeRequestSupport() {
  vi.stubGlobal(
    "Request",
    class RequestWithBase extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        if (typeof input === "string" && input.startsWith("/")) {
          super(`http://localhost${input}`, init);
          return;
        }
        super(input, init);
      }
    }
  );
}

function createStore() {
  return configureStore({
    reducer: {
      [userApi.reducerPath]: userApi.reducer,
    },
    middleware: (gdm) => gdm().concat(userApi.middleware),
  });
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method;
  if (typeof input === "string" || input instanceof URL) return "GET";
  return input.method;
}

describe("userApi", () => {
  beforeEach(() => {
    installRelativeRequestSupport();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls OAuth/session/user endpoints with expected urls and methods", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push({ url: urlOf(input), method: methodOf(input, init) });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const store = createStore();

    await store.dispatch(
      userApi.endpoints.authorizeOAuth.initiate({
        client_id: "c",
        username: "u",
        password: "p",
        redirect_uri: "r",
        response_type: "code",
        scope: "s",
        code_challenge: "x",
        code_challenge_method: "S256",
      })
    );
    await store.dispatch(
      userApi.endpoints.exchangeOAuthCode.initiate({
        client_id: "c",
        code: "code",
        grant_type: "authorization_code",
        redirect_uri: "r",
        code_verifier: "v",
      })
    );
    await store.dispatch(
      userApi.endpoints.registerOAuthUser.initiate({
        username: "x",
        name: "y",
        password: "z",
      })
    );
    await store.dispatch(userApi.endpoints.deleteSession.initiate());
    await store.dispatch(userApi.endpoints.getUsers.initiate());
    await store.dispatch(userApi.endpoints.getUserLimits.initiate("user/a b"));
    await store.dispatch(
      userApi.endpoints.updateUserLimits.initiate({
        userId: "user/a b",
        max_order_qty: 1,
        max_daily_notional: 2,
        allowed_strategies: ["TWAP"],
      })
    );
    await store.dispatch(userApi.endpoints.getDemoPersonas.initiate());

    expect(calls.some((c) => c.url.includes("/oauth/authorize") && c.method === "POST")).toBe(true);
    expect(calls.some((c) => c.url.includes("/oauth/token") && c.method === "POST")).toBe(true);
    expect(calls.some((c) => c.url.includes("/oauth/register") && c.method === "POST")).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/sessions") && c.method === "DELETE")).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/users") && c.method === "GET")).toBe(true);
    expect(
      calls.some((c) => c.url.includes("/users/user%2Fa%20b/limits") && c.method === "GET")
    ).toBe(true);
    expect(
      calls.some((c) => c.url.includes("/users/user%2Fa%20b/limits") && c.method === "PUT")
    ).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/personas") && c.method === "GET")).toBe(true);
  });
});
