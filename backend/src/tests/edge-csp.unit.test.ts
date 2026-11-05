import { readFileSync } from "node:fs";
import { test } from "#veta/test";
import { assert } from "#veta/test-assert";

const ROOT = new URL("../../../", import.meta.url);

function read(path: string): string {
  return readFileSync(new URL(path, ROOT), "utf8");
}

function scriptSrc(): string {
  const match = read("edge/dynamic.yml").match(/script-src ([^;"]*)/);
  assert(match, "edge CSP has a script-src directive");
  return match[1];
}

test("edge CSP, script-src does not allow unsafe-inline", () => {
  assert(!scriptSrc().includes("unsafe-inline"), "script-src must not allow 'unsafe-inline'");
});

test("frontend index.html, has no inline script", () => {
  const inline = [...read("frontend/index.html").matchAll(/<script\b([^>]*)>/g)].filter(
    (m) => !/\bsrc=/.test(m[1])
  );
  assert(inline.length === 0, "every <script> in index.html must load from src");
});
