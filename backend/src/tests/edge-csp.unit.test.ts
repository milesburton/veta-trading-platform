import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { test } from "#veta/test";
import { assert } from "#veta/test-assert";

const ROOT = new URL("../../../", import.meta.url);

function read(path: string): string {
  return readFileSync(new URL(path, ROOT), "utf8");
}

function scriptSrc(): string {
  const doc = parse(read("edge/dynamic.yml")) as { "x-anchors"?: { csp?: string } };
  const csp = doc["x-anchors"]?.csp;
  assert(csp, "edge/dynamic.yml defines x-anchors.csp");
  const directive = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("script-src"));
  assert(directive, "edge CSP has a script-src directive");
  return directive;
}

test("edge CSP, script-src does not allow unsafe-inline", () => {
  assert(!scriptSrc().includes("unsafe-inline"), "script-src must not allow 'unsafe-inline'");
});

test("frontend index.html, has no inline script", () => {
  const inline = [...read("frontend/index.html").matchAll(/<script\b([^>]*)>/gi)].filter(
    (m) => !/\bsrc\s*=/i.test(m[1])
  );
  assert(inline.length === 0, "every <script> in index.html must load from src");
});
