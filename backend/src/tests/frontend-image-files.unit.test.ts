import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const IMPORT_PATTERN = /from\s+["']((?:\.{1,2}\/|#veta\/)[^"']+)["']/g;

const subpathImports = (
  JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
    imports: Record<string, string>;
  }
).imports;

function resolveImport(fromFile: string, specifier: string): string {
  if (specifier.startsWith("#")) return resolve(REPO_ROOT, subpathImports[specifier]);
  return resolve(dirname(fromFile), specifier);
}

function localImportClosure(entry: string): Set<string> {
  const seen = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      pending.push(resolveImport(file, match[1]));
    }
  }
  return seen;
}

test("[frontend image] the Dockerfile copies every local module frontend-server imports", () => {
  const dockerfile = readFileSync(join(REPO_ROOT, "docker/frontend/Dockerfile"), "utf8");
  const copied = new Set(
    dockerfile
      .split("\n")
      .filter((line) => line.startsWith("COPY ") && !line.includes("--from"))
      .flatMap((line) => line.split(/\s+/).slice(1, -1))
  );
  const missing = [...localImportClosure(join(REPO_ROOT, "frontend-server.ts"))]
    .map((file) => relative(REPO_ROOT, file))
    .filter((file) => file !== "frontend-server.ts" && !copied.has(file));
  assertEquals(missing, []);
});
