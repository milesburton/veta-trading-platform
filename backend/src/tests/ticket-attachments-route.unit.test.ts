import { assert, assertEquals } from "jsr:@std/assert@0.217";
import type { GatewayContext } from "../gateway/context.ts";
import { handleTicketAttachmentsRoute } from "../gateway/routes/ticket-attachments.ts";
import { makeGatewayAuthContext, makeGatewayUnauthContext } from "./test-helpers.ts";

const ENV_KEYS = ["MINIO_ENDPOINT", "MINIO_PUBLIC_URL", "MINIO_ROOT_USER", "MINIO_ROOT_PASSWORD"];
const saved = new Map(ENV_KEYS.map((k) => [k, Deno.env.get(k)]));

function setConfiguredEnv() {
  Deno.env.set("MINIO_ENDPOINT", "http://minio:9000");
  Deno.env.set("MINIO_PUBLIC_URL", "http://localhost:3000/attachments");
  Deno.env.set("MINIO_ROOT_USER", "veta");
  Deno.env.set("MINIO_ROOT_PASSWORD", "test-password-not-real");
}

function clearEnv() {
  for (const k of ENV_KEYS) Deno.env.delete(k);
}

function restoreEnv() {
  for (const k of ENV_KEYS) {
    const v = saved.get(k);
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
}

function makeContext(): GatewayContext {
  return makeGatewayAuthContext({ role: "trader", name: "Test User" });
}

function unauthContext(): GatewayContext {
  return makeGatewayUnauthContext();
}

function req(body: unknown): Request {
  return new Request("http://localhost/ticket-attachments/presign", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

Deno.test("ignores paths other than /ticket-attachments/presign", async () => {
  const res = await handleTicketAttachmentsRoute(
    new Request("http://localhost/other", { method: "POST" }),
    "/other",
    makeContext()
  );
  assertEquals(res, null);
});

Deno.test("ignores non-POST methods", async () => {
  const res = await handleTicketAttachmentsRoute(
    new Request("http://localhost/ticket-attachments/presign", { method: "GET" }),
    "/ticket-attachments/presign",
    makeContext()
  );
  assertEquals(res, null);
});

Deno.test("requires authentication", async () => {
  const res = await handleTicketAttachmentsRoute(
    req({ fileName: "a.png", contentType: "image/png", sizeBytes: 100 }),
    "/ticket-attachments/presign",
    unauthContext()
  );
  assertEquals(res?.status, 401);
});

Deno.test("returns 503 when MinIO is not configured", async () => {
  clearEnv();
  try {
    const res = await handleTicketAttachmentsRoute(
      req({ fileName: "a.png", contentType: "image/png", sizeBytes: 100 }),
      "/ticket-attachments/presign",
      makeContext()
    );
    assertEquals(res?.status, 503);
  } finally {
    restoreEnv();
  }
});

Deno.test("rejects an oversized file", async () => {
  setConfiguredEnv();
  try {
    const res = await handleTicketAttachmentsRoute(
      req({ fileName: "a.png", contentType: "image/png", sizeBytes: 11 * 1024 * 1024 }),
      "/ticket-attachments/presign",
      makeContext()
    );
    assertEquals(res?.status, 413);
  } finally {
    restoreEnv();
  }
});

Deno.test("rejects a disallowed content type", async () => {
  setConfiguredEnv();
  try {
    const res = await handleTicketAttachmentsRoute(
      req({ fileName: "a.pdf", contentType: "application/pdf", sizeBytes: 100 }),
      "/ticket-attachments/presign",
      makeContext()
    );
    assertEquals(res?.status, 400);
  } finally {
    restoreEnv();
  }
});

Deno.test("rejects malformed request bodies", async () => {
  setConfiguredEnv();
  try {
    const res = await handleTicketAttachmentsRoute(
      req({ fileName: "", contentType: "image/png", sizeBytes: -1 }),
      "/ticket-attachments/presign",
      makeContext()
    );
    assertEquals(res?.status, 400);
  } finally {
    restoreEnv();
  }
});

Deno.test("returns a well-formed presigned POST for a valid request", async () => {
  setConfiguredEnv();
  try {
    const res = await handleTicketAttachmentsRoute(
      req({ fileName: "screenshot.png", contentType: "image/png", sizeBytes: 12_345 }),
      "/ticket-attachments/presign",
      makeContext()
    );
    assertEquals(res?.status, 200);
    const body = await res?.json();
    assertEquals(body.postUrl, "http://minio:9000/ticket-attachments");
    assert(body.objectKey.startsWith("u-1/"));
    assert(body.objectKey.endsWith("-screenshot.png"));
    assertEquals(
      body.objectUrl,
      `http://localhost:3000/attachments/ticket-attachments/${body.objectKey}`
    );
    assertEquals(body.formFields.key, body.objectKey);
    assertEquals(body.formFields["Content-Type"], "image/png");
    assertEquals(body.formFields["x-amz-algorithm"], "AWS4-HMAC-SHA256");
    assert(typeof body.formFields.policy === "string" && body.formFields.policy.length > 0);
    assert(typeof body.formFields["x-amz-signature"] === "string");
    assert(/^[0-9a-f]{64}$/.test(body.formFields["x-amz-signature"]));
    assert(body.expiresAt > Date.now());
  } finally {
    restoreEnv();
  }
});

Deno.test("the signed policy pins the object key to an exact match, not a prefix", async () => {
  setConfiguredEnv();
  try {
    const res = await handleTicketAttachmentsRoute(
      req({ fileName: "screenshot.png", contentType: "image/png", sizeBytes: 12_345 }),
      "/ticket-attachments/presign",
      makeContext()
    );
    const body = await res?.json();
    const policy = JSON.parse(atob(body.formFields.policy));
    const keyCondition = policy.conditions.find(
      (c: unknown) => typeof c === "object" && c !== null && !Array.isArray(c) && "key" in c
    );
    assertEquals(keyCondition, { key: body.objectKey });
    const startsWithCondition = policy.conditions.find(
      (c: unknown) => Array.isArray(c) && c[0] === "starts-with" && c[1] === "$key"
    );
    assertEquals(startsWithCondition, undefined);
  } finally {
    restoreEnv();
  }
});

Deno.test("sanitises unsafe characters out of the file name", async () => {
  setConfiguredEnv();
  try {
    const res = await handleTicketAttachmentsRoute(
      req({ fileName: "../../etc/passwd", contentType: "image/png", sizeBytes: 100 }),
      "/ticket-attachments/presign",
      makeContext()
    );
    const body = await res?.json();
    assertEquals(body.objectKey.includes(".."), false);
    assertEquals(body.objectKey.includes("/etc/"), false);
  } finally {
    restoreEnv();
  }
});
