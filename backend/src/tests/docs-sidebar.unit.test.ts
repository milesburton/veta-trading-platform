import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { walk } from "#veta/fs-walk";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";

const DOCS_ROOT = new URL("../../../docs/site/src/content/docs/", import.meta.url).pathname;
const ASTRO_CONFIG = readFileSync(
  new URL("../../../docs/site/astro.config.mjs", import.meta.url),
  "utf8"
);

const REACHED_FROM_INDEX_PREFIXES: readonly string[] = ["platform/decisions/"];

const KNOWN_UNLISTED: ReadonlySet<string> = new Set([
  "analytics",
  "development/components/asset-selector",
  "development/components/build-info",
  "development/components/context-menu",
  "development/components/service-row",
  "development/components/status-dot",
  "platform/observability/discord-welcome-bot",
  "platform/observability/ticketing",
  "status",
  "user-guide/positions-and-pnl",
  "ux",
  "ux/trading-styles",
]);

const SIDEBAR_SLUGS: ReadonlySet<string> = new Set(
  [...ASTRO_CONFIG.matchAll(/slug:\s*"([^"]+)"/g)].map((match) => match[1] ?? "")
);

const slugOf = (file: string): string =>
  relative(DOCS_ROOT, file)
    .replace(/\.mdx?$/, "")
    .replace(/(^|\/)index$/, "");

const pageSlugs = async (): Promise<string[]> =>
  (await Array.fromAsync(walk(DOCS_ROOT, { exts: [".md", ".mdx"], includeDirs: false })))
    .filter((entry) => /\.mdx?$/.test(entry.path))
    .map((entry) => slugOf(entry.path))
    .filter((slug) => slug !== "");

test("[sidebar] every docs page is in the sidebar or on the reviewed exemption list", async () => {
  const unlisted = (await pageSlugs()).filter(
    (slug) =>
      !SIDEBAR_SLUGS.has(slug) &&
      !KNOWN_UNLISTED.has(slug) &&
      !REACHED_FROM_INDEX_PREFIXES.some((prefix) => slug.startsWith(prefix))
  );
  assertEquals(
    unlisted,
    [],
    "Register the page in docs/site/astro.config.mjs so it appears in the navigation"
  );
});

test("[sidebar] the exemption list holds no page that is now listed or deleted", async () => {
  const slugs = new Set(await pageSlugs());
  const stale = [...KNOWN_UNLISTED].filter((slug) => !slugs.has(slug) || SIDEBAR_SLUGS.has(slug));
  assertEquals(stale, []);
});

test("[sidebar] every sidebar slug points at an existing page", async () => {
  const slugs = new Set(await pageSlugs());
  assertEquals(
    [...SIDEBAR_SLUGS].filter((slug) => !slugs.has(slug)),
    []
  );
});
