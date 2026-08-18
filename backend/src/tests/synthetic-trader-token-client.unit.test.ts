import { assertEquals, assertRejects } from "jsr:@std/assert@0.217";
import { TokenClient } from "../synthetic-trader/token-client.ts";

const realFetch = globalThis.fetch;

Deno.test("[synthetic-trader-token-client] acquire performs authorize then token exchange and returns access_token", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    calls.push({ url: String(url), body });
    if (String(url).endsWith("/oauth/authorize")) {
      return new Response(JSON.stringify({ code: "test-code" }), { status: 200 });
    }
    if (String(url).endsWith("/oauth/token")) {
      return new Response(JSON.stringify({ access_token: "test-token" }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const client = new TokenClient({
      userServiceUrl: "http://user-service:5008",
      clientId: "veta-automation",
      username: "synthetic-trader-1",
      password: "secret",
    });
    const token = await client.acquire();
    assertEquals(token, "test-token");
    assertEquals(calls.length, 2);
    assertEquals(calls[0].url, "http://user-service:5008/oauth/authorize");
    assertEquals(calls[0].body.client_id, "veta-automation");
    assertEquals(calls[0].body.username, "synthetic-trader-1");
    assertEquals(calls[0].body.code_challenge_method, "S256");
    assertEquals(calls[1].url, "http://user-service:5008/oauth/token");
    assertEquals(calls[1].body.code, "test-code");
    assertEquals(calls[1].body.grant_type, "authorization_code");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("[synthetic-trader-token-client] acquire throws when authorize fails", async () => {
  globalThis.fetch = (() =>
    Promise.resolve(new Response("bad request", { status: 400 }))) as typeof fetch;
  try {
    const client = new TokenClient({
      userServiceUrl: "http://user-service:5008",
      clientId: "veta-automation",
      username: "synthetic-trader-1",
      password: "secret",
    });
    await assertRejects(() => client.acquire());
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("[synthetic-trader-token-client] acquire throws when token exchange returns no access_token", async () => {
  globalThis.fetch = (async (url: string | URL) => {
    if (String(url).endsWith("/oauth/authorize")) {
      return new Response(JSON.stringify({ code: "test-code" }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;
  try {
    const client = new TokenClient({
      userServiceUrl: "http://user-service:5008",
      clientId: "veta-automation",
      username: "synthetic-trader-1",
      password: "secret",
    });
    await assertRejects(() => client.acquire());
  } finally {
    globalThis.fetch = realFetch;
  }
});
