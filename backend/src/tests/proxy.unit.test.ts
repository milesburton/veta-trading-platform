import { assertEquals } from "jsr:@std/assert@0.217";
import { isConnectionRefusedError, proxyGet, proxyPost, proxyPut } from "../gateway/proxy.ts";

const realFetch = globalThis.fetch;

Deno.test("[proxyPost] forwards the request body read from req when no presetBody is given", async () => {
  const seenBodies: string[] = [];
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    seenBodies.push(String(init?.body ?? ""));
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }) as typeof fetch;
  try {
    const req = new Request("http://localhost/api/oms/orders", {
      method: "POST",
      body: JSON.stringify({ orderId: "abc" }),
    });
    const res = await proxyPost("http://oms:5002/orders", req);
    assertEquals(res.status, 200);
    assertEquals(seenBodies, [JSON.stringify({ orderId: "abc" })]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("[proxyPost] uses presetBody instead of re-reading req.body when given", async () => {
  const seenBodies: string[] = [];
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    seenBodies.push(String(init?.body ?? ""));
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }) as typeof fetch;
  try {
    // A body already consumed once (as the gateway wake path does) — proxyPost
    // must not try to read req.text() again, since that would throw.
    const req = new Request("http://localhost/api/analytics/quote", {
      method: "POST",
      body: JSON.stringify({ symbol: "AAPL" }),
    });
    await req.text();

    const res = await proxyPost("http://analytics:5014/quote", req, JSON.stringify({ symbol: "AAPL" }));
    assertEquals(res.status, 200);
    assertEquals(seenBodies, [JSON.stringify({ symbol: "AAPL" })]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("[proxyPost] a retry with the same presetBody sends identical bodies both times", async () => {
  const seenBodies: string[] = [];
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    seenBodies.push(String(init?.body ?? ""));
    return Promise.resolve(new Response(null, { status: 502 }));
  }) as typeof fetch;
  try {
    const req = new Request("http://localhost/api/analytics/quote", {
      method: "POST",
      body: JSON.stringify({ symbol: "AAPL" }),
    });
    const presetBody = await req.text();

    await proxyPost("http://analytics:5014/quote", req, presetBody);
    await proxyPost("http://analytics:5014/quote", req, presetBody);

    assertEquals(seenBodies.length, 2);
    assertEquals(seenBodies[0], seenBodies[1], "retry must resend the same body, not an empty one");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("[proxyPut] uses presetBody instead of re-reading req.body when given", async () => {
  const seenBodies: string[] = [];
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    seenBodies.push(String(init?.body ?? ""));
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }) as typeof fetch;
  try {
    const req = new Request("http://localhost/api/scenario-engine/config", {
      method: "PUT",
      body: JSON.stringify({ enabled: true }),
    });
    await req.text();

    const res = await proxyPut(
      "http://scenario-engine:5020/config",
      req,
      JSON.stringify({ enabled: true })
    );
    assertEquals(res.status, 200);
    assertEquals(seenBodies, [JSON.stringify({ enabled: true })]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("[proxyGet] returns 502 with a JSON error body when fetch fails (connection refused)", async () => {
  globalThis.fetch = (() =>
    Promise.reject(new TypeError("error sending request: Connection refused"))) as typeof fetch;
  try {
    const req = new Request("http://localhost/api/analytics/quote");
    const res = await proxyGet("http://analytics:5014/quote", req);
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(typeof body.error, "string");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("[proxyPost] returns 502 with a JSON error body when fetch fails (connection refused)", async () => {
  globalThis.fetch = (() =>
    Promise.reject(new TypeError("error sending request: Connection refused"))) as typeof fetch;
  try {
    const req = new Request("http://localhost/api/analytics/quote", {
      method: "POST",
      body: "{}",
    });
    const res = await proxyPost("http://analytics:5014/quote", req);
    assertEquals(res.status, 502);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("[proxyGet] a genuine connection-refused failure sets connectionRefused:true", async () => {
  globalThis.fetch = (() =>
    Promise.reject(new TypeError("error sending request: Connection refused (os error 111)"))) as typeof fetch;
  try {
    const req = new Request("http://localhost/api/analytics/quote");
    const res = await proxyGet("http://analytics:5014/quote", req);
    const body = await res.json();
    assertEquals(body.connectionRefused, true);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("[proxyGet] a timeout failure does NOT set connectionRefused — the service may just be slow, not down", async () => {
  globalThis.fetch = (() => {
    const err = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    return Promise.reject(err);
  }) as typeof fetch;
  try {
    const req = new Request("http://localhost/api/analytics/quote");
    const res = await proxyGet("http://analytics:5014/quote", req);
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(body.connectionRefused, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("[isConnectionRefusedError] true only for a TypeError mentioning connection refused", () => {
  assertEquals(
    isConnectionRefusedError(new TypeError("error sending request: Connection refused (os error 111)")),
    true
  );
  assertEquals(isConnectionRefusedError(new TypeError("connection REFUSED")), true);
  assertEquals(
    isConnectionRefusedError(new DOMException("aborted due to timeout", "TimeoutError")),
    false
  );
  assertEquals(isConnectionRefusedError(new TypeError("DNS lookup failed")), false);
  assertEquals(isConnectionRefusedError(new Error("connection refused")), false, "must be a TypeError");
});
