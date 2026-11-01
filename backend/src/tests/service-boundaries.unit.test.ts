import { readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { walk } from "#veta/fs-walk";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const SRC_ROOT = `${REPO_ROOT}backend/src`;

const PLATFORM_DIRS: ReadonlySet<string> = new Set([
  "lib",
  "schemas",
  "types",
  "shared",
  "notifications",
  "test-support",
]);

const EXEMPT_SOURCE_DIRS: ReadonlySet<string> = new Set(["tests", "test-support"]);

const KNOWN_EXCEPTIONS: readonly string[] = [
  "gateway -> scenarios",
  "scenario-engine -> signal-engine",
  "signal-engine -> feature-engine",
  "signal-engine -> market-data-adapters",
];

const IMPORT_SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g;

type AliasTargets = Readonly<Record<string, string>>;

function topLevelDir(absolutePath: string): string | null {
  const rel = relative(SRC_ROOT, absolutePath);
  if (rel.startsWith("..") || rel === "") return null;
  return rel.split(sep)[0] ?? null;
}

function resolveSpecifier(
  specifier: string,
  importerPath: string,
  aliases: AliasTargets
): string | null {
  if (specifier.startsWith(".")) return resolve(dirname(importerPath), specifier);
  const aliased = aliases[specifier];
  return aliased === undefined ? null : resolve(REPO_ROOT, aliased);
}

function crossServiceEdges(importerPath: string, source: string, aliases: AliasTargets): string[] {
  const from = topLevelDir(importerPath);
  if (from === null || EXEMPT_SOURCE_DIRS.has(from)) return [];
  const edges = [...source.matchAll(IMPORT_SPECIFIER)]
    .map((match) => resolveSpecifier(match[1] ?? "", importerPath, aliases))
    .map((target) => (target === null ? null : topLevelDir(target)))
    .filter((to): to is string => to !== null && to !== from && !PLATFORM_DIRS.has(to))
    .map((to) => `${from} -> ${to}`);
  return [...new Set(edges)];
}

async function loadAliases(): Promise<AliasTargets> {
  const pkg = JSON.parse(await readFile(`${REPO_ROOT}package.json`, "utf8")) as {
    imports?: Record<string, string>;
  };
  return pkg.imports ?? {};
}

async function repositoryEdges(): Promise<string[]> {
  const aliases = await loadAliases();
  const edges: string[] = [];
  for await (const entry of walk(SRC_ROOT, { includeDirs: false, exts: [".ts"] })) {
    if (entry.name.includes(".test.") || entry.path.includes(`${sep}testcontainers${sep}`)) {
      continue;
    }
    edges.push(...crossServiceEdges(entry.path, await readFile(entry.path, "utf8"), aliases));
  }
  return [...new Set(edges)].sort();
}

test("[service-boundaries] no service imports another service's directory", async () => {
  const actual = await repositoryEdges();
  const unexpected = actual.filter((edge) => !KNOWN_EXCEPTIONS.includes(edge));
  assertEquals(unexpected, []);
});

test("[service-boundaries] every known exception is still in use", async () => {
  const actual = await repositoryEdges();
  const stale = KNOWN_EXCEPTIONS.filter((edge) => !actual.includes(edge));
  assertEquals(stale, []);
});

const ALIASES: AliasTargets = {
  "#veta/logger": "./backend/src/lib/logger.ts",
  "#veta/market-hours": "./backend/src/market-sim/market-hours.ts",
};

const OMS_FILE = `${SRC_ROOT}/oms/oms-server.ts`;

test("[service-boundaries] detector flags a relative import into another service", () => {
  assertEquals(crossServiceEdges(OMS_FILE, `import { x } from "../gateway/context.ts";`, ALIASES), [
    "oms -> gateway",
  ]);
});

test("[service-boundaries] detector flags a re-export, a side-effect import and a dynamic import", () => {
  const source = [
    `export { a } from "../ems/a.ts";`,
    `import "../risk-engine/b.ts";`,
    `const c = await import("../journal/c.ts");`,
  ].join("\n");
  assertEquals(crossServiceEdges(OMS_FILE, source, ALIASES), [
    "oms -> ems",
    "oms -> risk-engine",
    "oms -> journal",
  ]);
});

test("[service-boundaries] detector flags an alias that resolves into another service", () => {
  assertEquals(crossServiceEdges(OMS_FILE, `import { h } from "#veta/market-hours";`, ALIASES), [
    "oms -> market-sim",
  ]);
});

test("[service-boundaries] detector allows platform directories, own directory and packages", () => {
  const source = [
    `import { l } from "../lib/process.ts";`,
    `import { s } from "../schemas/orders.ts";`,
    `import { n } from "../notifications/ticketing.ts";`,
    `import { own } from "./helpers.ts";`,
    `import { logger } from "#veta/logger";`,
    `import { z } from "zod";`,
  ].join("\n");
  assertEquals(crossServiceEdges(OMS_FILE, source, ALIASES), []);
});

test("[service-boundaries] detector ignores tests and test support", () => {
  const source = `import { x } from "../gateway/context.ts";`;
  assertEquals(crossServiceEdges(`${SRC_ROOT}/tests/helpers.ts`, source, ALIASES), []);
  assertEquals(crossServiceEdges(`${SRC_ROOT}/test-support/helpers.ts`, source, ALIASES), []);
});

test("[service-boundaries] detector flags a platform directory importing a service", () => {
  assertEquals(
    crossServiceEdges(
      `${SRC_ROOT}/lib/thing.ts`,
      `import { x } from "../gateway/context.ts";`,
      ALIASES
    ),
    ["lib -> gateway"]
  );
});
