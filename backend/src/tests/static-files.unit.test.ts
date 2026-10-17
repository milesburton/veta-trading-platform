import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { serveDir } from "../lib/static-files.ts";

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "static-files-"));
  await writeFile(join(root, "index.html"), "<h1>home</h1>");
  await writeFile(join(root, "app.js"), "export {};");
  await writeFile(join(root, "data.unknown"), "raw");
  await mkdir(join(root, "docs"));
  await writeFile(join(root, "docs", "index.html"), "<h1>docs</h1>");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function request(path: string, method = "GET"): Request {
  return new Request(`http://localhost${path}`, { method });
}

test("[static-files] serves a file with its content type and length", async () => {
  const res = await serveDir(request("/app.js"), { fsRoot: root });
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "text/javascript; charset=utf-8");
  assertEquals(res.headers.get("content-length"), "10");
  assertEquals(await res.text(), "export {};");
});

test("[static-files] a directory resolves to its index.html", async () => {
  const rootRes = await serveDir(request("/"), { fsRoot: root });
  assertEquals(await rootRes.text(), "<h1>home</h1>");
  const nested = await serveDir(request("/docs"), { fsRoot: root });
  assertEquals(await nested.text(), "<h1>docs</h1>");
});

test("[static-files] unknown extensions fall back to octet-stream", async () => {
  const res = await serveDir(request("/data.unknown"), { fsRoot: root });
  assertEquals(res.headers.get("content-type"), "application/octet-stream");
});

test("[static-files] HEAD returns headers without a body", async () => {
  const res = await serveDir(request("/app.js", "HEAD"), { fsRoot: root });
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-length"), "10");
  assertEquals(await res.text(), "");
});

test("[static-files] other methods are rejected", async () => {
  const res = await serveDir(request("/app.js", "POST"), { fsRoot: root });
  assertEquals(res.status, 405);
});

test("[static-files] missing files, traversal attempts and bad encodings are refused", async () => {
  assertEquals((await serveDir(request("/missing.html"), { fsRoot: root })).status, 404);
  assertEquals((await serveDir(request("/..%2F..%2Fetc%2Fpasswd"), { fsRoot: root })).status, 404);
  assertEquals((await serveDir(request("/%E0%A4%A"), { fsRoot: root })).status, 400);
});
