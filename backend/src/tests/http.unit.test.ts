import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import {
  CORS_HEADERS,
  corsOptions,
  decodePathSegment,
  json,
  jsonError,
  parseBody,
  parseQuery,
  serveJsonService,
} from "../lib/http.ts";

test("json wraps data as a 200 JSON response with CORS headers by default", async () => {
  const res = json({ ok: true });
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  assertEquals(res.headers.get("Vary"), "Origin");
  assertEquals(await res.json(), { ok: true });
});

test("json accepts a custom status and extra headers", async () => {
  const res = json({ x: 1 }, 201, { "X-Custom": "yes" });
  assertEquals(res.status, 201);
  assertEquals(res.headers.get("X-Custom"), "yes");
});

test("jsonError wraps a message under { error } with the given status", async () => {
  const res = jsonError("nope", 404);
  assertEquals(res.status, 404);
  assertEquals(await res.json(), { error: "nope" });
});

test("jsonError defaults to 400", () => {
  const res = jsonError("bad request");
  assertEquals(res.status, 400);
});

test("corsOptions returns a 204 with no body and CORS headers", async () => {
  const res = corsOptions();
  assertEquals(res.status, 204);
  assertEquals(await res.text(), "");
  assertEquals(
    res.headers.get("Access-Control-Allow-Methods"),
    CORS_HEADERS["Access-Control-Allow-Methods"]
  );
});

const Schema = z.object({ name: z.string(), age: z.number() });

test("parseBody returns ok:true with the parsed data on a valid body", async () => {
  const req = new Request("http://x", {
    method: "POST",
    body: JSON.stringify({ name: "Ada", age: 30 }),
  });
  const result = await parseBody(req, Schema);
  assert(result.ok);
  if (result.ok) assertEquals(result.data, { name: "Ada", age: 30 });
});

test("parseBody returns a 400 invalid-json response when the body isn't JSON", async () => {
  const req = new Request("http://x", { method: "POST", body: "not json" });
  const result = await parseBody(req, Schema);
  assert(!result.ok);
  if (!result.ok) {
    assertEquals(result.res.status, 400);
    assertEquals((await result.res.json()).error, "invalid json");
  }
});

test("parseBody returns a 400 validation_failed response when the schema rejects it", async () => {
  const req = new Request("http://x", {
    method: "POST",
    body: JSON.stringify({ name: "Ada" }),
  });
  const result = await parseBody(req, Schema);
  assert(!result.ok);
  if (!result.ok) {
    assertEquals(result.res.status, 400);
    const body = await result.res.json();
    assertEquals(body.error, "validation_failed");
    assert(Array.isArray(body.issues));
  }
});

test("parseQuery returns ok:true with parsed query params", () => {
  const url = new URL("http://x?name=Ada&age=30");
  const NumSchema = z.object({ name: z.string(), age: z.coerce.number() });
  const result = parseQuery(url, NumSchema);
  assert(result.ok);
  if (result.ok) assertEquals(result.data, { name: "Ada", age: 30 });
});

test("parseQuery returns a 400 validation_failed response on invalid params", () => {
  const url = new URL("http://x?name=Ada");
  const result = parseQuery(url, Schema);
  assert(!result.ok);
  if (!result.ok) assertEquals(result.res.status, 400);
});

test("serveJsonService serves /health with service/version/status plus extra health fields", async () => {
  const controller = new AbortController();
  const server = serveJsonService({
    port: 0,
    service: "test-svc",
    version: "1.2.3",
    health: () => ({ extra: 42 }),
    handler: () => jsonError("not found", 404),
    signal: controller.signal,
  });
  try {
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();
    assertEquals(body.service, "test-svc");
    assertEquals(body.version, "1.2.3");
    assertEquals(body.status, "ok");
    assertEquals(body.extra, 42);
  } finally {
    controller.abort();
    await once(server, "close");
  }
});

test("serveJsonService responds to OPTIONS with corsOptions", async () => {
  const controller = new AbortController();
  const server = serveJsonService({
    port: 0,
    service: "test-svc",
    version: "1.2.3",
    health: () => ({}),
    handler: () => jsonError("not found", 404),
    signal: controller.signal,
  });
  try {
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/anything`, { method: "OPTIONS" });
    assertEquals(res.status, 204);
    await res.body?.cancel();
  } finally {
    controller.abort();
    await once(server, "close");
  }
});

test("serveJsonService delegates non-/health requests to the provided handler", async () => {
  const controller = new AbortController();
  let handlerCalledWith: { path: string; method: string } | null = null;
  const server = serveJsonService({
    port: 0,
    service: "test-svc",
    version: "1.2.3",
    health: () => ({}),
    handler: (req, _url, path) => {
      handlerCalledWith = { path, method: req.method };
      return json({ handled: true });
    },
    signal: controller.signal,
  });
  try {
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/custom-route`);
    const body = await res.json();
    assertEquals(body.handled, true);
    assertEquals(handlerCalledWith, { path: "/custom-route", method: "GET" });
  } finally {
    controller.abort();
    await once(server, "close");
  }
});

test("decodePathSegment decodes a percent-encoded segment", () => {
  assertEquals(decodePathSegment("BRK%2EB"), "BRK.B");
});

test("decodePathSegment returns null on malformed percent-encoding instead of throwing", () => {
  assertEquals(decodePathSegment("%E0%A4%A"), null);
  assertEquals(decodePathSegment("%"), null);
});
