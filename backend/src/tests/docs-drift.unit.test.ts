import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { walk } from "jsr:@std/fs@0.217/walk";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const DOCS_ROOT = `${REPO_ROOT}docs/site/src/content/docs`;
const SUPERVISORD_CONF = `${REPO_ROOT}supervisord.conf`;
const ALGO_DIR = `${REPO_ROOT}backend/src/algo`;
const BACKEND_TESTS_DIR = `${REPO_ROOT}backend/src/tests`;
const SCREENSHOTS_CANONICAL_DIR = `${REPO_ROOT}docs/screenshots`;
const PANEL_SCREENSHOTS_CANONICAL_DIR =
  `${REPO_ROOT}docs/panel-walkthrough/screenshots`;

const GRAFANA_SCREENSHOT_PREFIX = "/veta-trading-platform/screenshots/grafana/";
const KNOWN_PENDING_SCREENSHOTS = new Set([
  "ug-blotter-multiselect.png",
  "ug-symbol-search.png",
  "ug-trade-paste.png",
]);

async function readAllDocsMarkdown(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for await (
    const entry of walk(DOCS_ROOT, {
      includeDirs: false,
      exts: [".md", ".mdx"],
    })
  ) {
    out.set(entry.path, await Deno.readTextFile(entry.path));
  }
  return out;
}

async function listAlgoStrategyFiles(): Promise<Set<string>> {
  const out = new Set<string>();
  for await (const entry of Deno.readDir(ALGO_DIR)) {
    if (entry.isFile && entry.name.endsWith("-strategy.ts")) {
      out.add(entry.name.replace("-strategy.ts", ""));
    }
  }
  return out;
}

async function listBackendTestFiles(): Promise<Set<string>> {
  const out = new Set<string>();
  for await (
    const entry of walk(BACKEND_TESTS_DIR, {
      includeDirs: false,
      exts: [".ts"],
    })
  ) {
    out.add(entry.path.replace(REPO_ROOT, ""));
  }
  return out;
}

function parseSupervisordPrograms(conf: string): Set<string> {
  const programs = new Set<string>();
  for (const match of conf.matchAll(/^\[program:([^\]]+)\]/gm)) {
    programs.add(match[1]);
  }
  return programs;
}

Deno.test("[docs-drift] every backend test file referenced in docs exists on disk", async () => {
  const docs = await readAllDocsMarkdown();
  const existingTestFiles = await listBackendTestFiles();
  const pattern = /backend\/src\/tests\/[a-zA-Z0-9._-]+\.test\.ts/g;
  const PLACEHOLDER_TOKENS = ["my-feature", "your-feature", "<name>", "example"];
  const missing: { docPath: string; ref: string }[] = [];

  for (const [docPath, content] of docs) {
    for (const match of content.matchAll(pattern)) {
      const ref = match[0];
      if (PLACEHOLDER_TOKENS.some((t) => ref.includes(t))) continue;
      if (!existingTestFiles.has(ref)) {
        missing.push({ docPath: docPath.replace(REPO_ROOT, ""), ref });
      }
    }
  }

  assertEquals(
    missing,
    [],
    `Found references to backend test files in docs that do not exist on disk:\n` +
      missing.map((m) => `  ${m.docPath} -> ${m.ref}`).join("\n"),
  );
});

function resolveScreenshotRef(ref: string): string {
  const relative = ref.replace("/veta-trading-platform/screenshots/", "");
  if (relative.startsWith("panels/")) {
    return `${PANEL_SCREENSHOTS_CANONICAL_DIR}/${relative.slice("panels/".length)}`;
  }
  return `${SCREENSHOTS_CANONICAL_DIR}/${relative}`;
}

Deno.test("[docs-drift] every screenshot referenced in docs resolves to a file", async () => {
  const docs = await readAllDocsMarkdown();
  const pattern = /\/veta-trading-platform\/screenshots\/[a-zA-Z0-9/_.-]+\.(?:png|jpg|jpeg|svg)/g;
  const missing: { docPath: string; ref: string }[] = [];

  for (const [docPath, content] of docs) {
    for (const match of content.matchAll(pattern)) {
      const ref = match[0];
      if (ref.startsWith(GRAFANA_SCREENSHOT_PREFIX)) continue;
      const filename = ref.split("/").pop()!;
      if (KNOWN_PENDING_SCREENSHOTS.has(filename)) continue;
      const onDisk = resolveScreenshotRef(ref);
      try {
        await Deno.stat(onDisk);
      } catch {
        missing.push({ docPath: docPath.replace(REPO_ROOT, ""), ref });
      }
    }
  }

  assertEquals(
    missing,
    [],
    `Screenshot references in docs do not resolve to canonical source files. ` +
      `Top-level screenshots come from docs/screenshots/ and panel/* from ` +
      `docs/panel-walkthrough/screenshots/; both are committed to git and ` +
      `copied into docs/site/public/screenshots/ at Pages build time.\n` +
      missing.map((m) => `  ${m.docPath} -> ${m.ref}`).join("\n"),
  );
});

Deno.test("[docs-drift] every algo strategy named in docs prose exists in backend/src/algo", async () => {
  const existing = await listAlgoStrategyFiles();
  const docPath = `${DOCS_ROOT}/user-guide/algo-trading.md`;
  const content = await Deno.readTextFile(docPath);

  const tableRowPattern = /^\| (LIMIT|TWAP|VWAP|POV|ICEBERG|SNIPER|ARRIVAL_PRICE|IS|MOMENTUM)\b/gm;
  const namedInTable = new Set<string>();
  for (const match of content.matchAll(tableRowPattern)) {
    namedInTable.add(match[1].toLowerCase().replace("_", "-"));
  }

  const docNameToFile: Record<string, string> = {
    "limit": "limit",
    "twap": "twap",
    "vwap": "vwap",
    "pov": "pov",
    "iceberg": "iceberg",
    "sniper": "sniper",
    "arrival-price": "arrival-price",
    "is": "is",
    "momentum": "momentum",
  };

  for (const name of namedInTable) {
    const fileStem = docNameToFile[name];
    assert(
      fileStem !== undefined && existing.has(fileStem),
      `Docs mention algo '${name}' but no backend/src/algo/${name}-strategy.ts found. Existing: ${[...existing].sort().join(", ")}`,
    );
  }
  assertEquals(
    namedInTable.size > 0,
    true,
    "Expected to find at least one algo named in the user-guide/algo-trading.md table",
  );
});

Deno.test("[docs-drift] every service named in supervisord.conf comment of platform/services.md exists in supervisord", async () => {
  const services = parseSupervisordPrograms(
    await Deno.readTextFile(SUPERVISORD_CONF),
  );
  const servicesMd = await Deno.readTextFile(`${DOCS_ROOT}/platform/services.md`);

  const backtickedServices = [
    ...servicesMd.matchAll(/`([a-z][a-z0-9-]+)`/g),
  ].map((m) => m[1]);

  const referenced = backtickedServices.filter((name) => services.has(name));
  assert(
    referenced.length > 0,
    "Expected platform/services.md to mention at least one service from supervisord.conf",
  );

  const explicitlyClaimedAsService = backtickedServices.filter((name) =>
    /^[a-z]+(-[a-z0-9]+)*$/.test(name) && name.includes("-")
  );
  const missing = explicitlyClaimedAsService.filter(
    (name) =>
      !services.has(name) &&
      !["docker-compose", "deno-task", "deno-test"].includes(name),
  );

  assertEquals(
    missing.filter((name) => /algo|svc|gateway|engine|sim/.test(name)),
    [],
    `Names appearing in platform/services.md that look like services but are not in supervisord.conf: ${missing.join(", ")}`,
  );
});

Deno.test("[docs-drift] test-inventory.json exists and matches the deno.json test task file count", async () => {
  const inventoryPath = `${REPO_ROOT}docs/site/src/data/test-inventory.json`;
  let inventory: {
    backend: { unit: { files: number } };
  };
  try {
    const raw = await Deno.readTextFile(inventoryPath);
    inventory = JSON.parse(raw);
  } catch {
    throw new Error(
      `${inventoryPath} is missing. Run 'cd docs/site && npm run generate' to produce it.`,
    );
  }

  const denoJson = JSON.parse(
    await Deno.readTextFile(`${REPO_ROOT}deno.json`),
  );
  const testTaskCmd = denoJson.tasks?.test ?? "";
  const filesFromTask = new Set(
    (testTaskCmd as string).match(/backend\/src\/tests\/[^\s&]+\.ts/g) ?? [],
  );

  assertEquals(
    inventory.backend.unit.files,
    filesFromTask.size,
    `Inventory says ${inventory.backend.unit.files} backend unit files but the deno.json 'test' task lists ${filesFromTask.size}. Regenerate via 'cd docs/site && npm run generate'.`,
  );
});

Deno.test("[docs-drift] every <Term name='...'> in docs references a real glossary id", async () => {
  const docs = await readAllDocsMarkdown();
  const glossarySource = await Deno.readTextFile(
    `${REPO_ROOT}docs/site/src/data/glossary.ts`,
  );
  const knownIds = new Set<string>();
  for (const match of glossarySource.matchAll(/^\s*id:\s*"([a-z0-9-]+)"/gm)) {
    knownIds.add(match[1]);
  }
  if (knownIds.size === 0) {
    throw new Error(
      "Could not parse any term ids from docs/site/src/data/glossary.ts. " +
        "If the file format has changed, update this test.",
    );
  }

  const pattern = /<Term[^>]*\bname=["']([^"']+)["']/g;
  const missing: { docPath: string; ref: string }[] = [];

  for (const [docPath, content] of docs) {
    for (const match of content.matchAll(pattern)) {
      const ref = match[1];
      if (!knownIds.has(ref)) {
        missing.push({ docPath: docPath.replace(REPO_ROOT, ""), ref });
      }
    }
  }

  assertEquals(
    missing,
    [],
    `<Term name="..."> references glossary ids that do not exist in docs/site/src/data/glossary.ts:\n` +
      missing.map((m) => `  ${m.docPath} -> name="${m.ref}"`).join("\n"),
  );
});

const DOCS_BASE = "/veta-trading-platform";

/**
 * Convert a slug like "platform/observability/lgtm" or "platform/observability"
 * into the on-disk content path we'd expect Astro to serve from.
 * Returns the resolved file path if it exists, or null if no such file exists.
 */
async function resolveSlugToFile(slug: string): Promise<string | null> {
  const cleaned = slug.replace(/^\/+|\/+$/g, "");
  if (!cleaned) return `${DOCS_ROOT}/index.mdx`;
  const candidates = [
    `${DOCS_ROOT}/${cleaned}.mdx`,
    `${DOCS_ROOT}/${cleaned}.md`,
    `${DOCS_ROOT}/${cleaned}/index.mdx`,
    `${DOCS_ROOT}/${cleaned}/index.md`,
  ];
  for (const c of candidates) {
    try {
      await Deno.stat(c);
      return c;
    } catch {
      // continue
    }
  }
  return null;
}

/** Slugify heading text the way Starlight / GitHub do. Lowercase, alnum + hyphens. */
function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Extract all heading anchors from a markdown/mdx file. */
async function extractAnchors(filePath: string): Promise<Set<string>> {
  const content = await Deno.readTextFile(filePath);
  const anchors = new Set<string>();
  // ATX headings: `# Heading`, `## Heading`, etc.
  for (const match of content.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
    anchors.add(slugifyHeading(match[1]));
  }
  // Explicit `<h1 id="x">` / `<h2 id="x">` in MDX
  for (const match of content.matchAll(/<h[1-6][^>]*\bid=["']([^"']+)["']/g)) {
    anchors.add(match[1]);
  }
  return anchors;
}

Deno.test("[docs-drift] rbac-roles.json matches AUTH_ROLES in frontend/src/auth/rbac.ts", async () => {
  const rbacSrc = await Deno.readTextFile(
    `${REPO_ROOT}frontend/src/auth/rbac.ts`,
  );
  const arrMatch = rbacSrc.match(
    /export const AUTH_ROLES\s*=\s*\[([\s\S]*?)\]/,
  );
  assert(arrMatch, "Could not find AUTH_ROLES in frontend/src/auth/rbac.ts");
  const sourceRoles = arrMatch[1]
    .split(",")
    .map((s) => s.trim().replace(/^["'`]|["'`]$/g, ""))
    .filter((s) => s.length > 0 && !s.startsWith("//"));

  let generated: { roles: { id: string; canTrade: boolean }[] };
  try {
    generated = JSON.parse(
      await Deno.readTextFile(
        `${REPO_ROOT}docs/site/src/data/rbac-roles.json`,
      ),
    );
  } catch {
    throw new Error(
      "docs/site/src/data/rbac-roles.json is missing. Run 'cd docs/site && npm run generate' to produce it.",
    );
  }

  assertEquals(
    generated.roles.map((r) => r.id),
    sourceRoles,
    "rbac-roles.json is stale; regenerate via 'cd docs/site && npm run generate'.",
  );

  const tableSrc = await Deno.readTextFile(
    `${REPO_ROOT}docs/site/src/components/RbacTable.astro`,
  );
  const notesMatch = tableSrc.match(/ACCESS_NOTES[^=]*=\s*\{([\s\S]*?)\};/);
  assert(
    notesMatch,
    "Could not find ACCESS_NOTES in docs/site/src/components/RbacTable.astro",
  );
  const notesKeys = new Set<string>();
  for (const m of notesMatch[1].matchAll(/^\s*["']?([\w-]+)["']?\s*:/gm)) {
    notesKeys.add(m[1]);
  }
  const missing = sourceRoles.filter((r) => !notesKeys.has(r));
  assertEquals(
    missing,
    [],
    `RbacTable.astro ACCESS_NOTES is missing entries for roles: ${missing.join(", ")}. ` +
      `Add admin/access policy notes for each role declared in rbac.ts.`,
  );
});

Deno.test("[docs-drift] every cross-page heading anchor link resolves to a real heading", async () => {
  // Focused test: catches the failure mode we hit three times in the recent
  // docs reorgs: a heading moves to a new sub-page, but a link from another
  // page still references the old #anchor. Build doesn't warn; the link
  // silently 404s on the anchor.
  //
  // Scoped to anchored absolute links (basepath-prefixed) for now, which is
  // the unambiguous case. Relative links across docs have Astro/Starlight
  // URL-resolution semantics (trailing-slash directory-style) that need
  // careful modelling to test reliably; that's a follow-up.
  const docs = await readAllDocsMarkdown();
  // Markdown link syntax `[text](url)` and JSX/HTML href attributes.
  const mdLinkPattern = /(?<!!)\[([^\]\n]*?)\]\(([^)\n\s]+?)\)/g;
  const hrefPattern = /\bhref=["']([^"']+)["']/g;
  const anchorCache = new Map<string, Set<string>>();
  const broken: { docPath: string; link: string; reason: string }[] = [];

  const PUBLIC_DOCS_HOST = "https://milesburton.github.io/veta-trading-platform";

  function* extractLinks(content: string): Generator<string> {
    for (const m of content.matchAll(mdLinkPattern)) yield m[2];
    for (const m of content.matchAll(hrefPattern)) yield m[1];
  }

  for (const [docPath, content] of docs) {
    for (const url of extractLinks(content)) {
      if (!url.includes("#")) continue;

      // Two flavours of in-site link we can resolve unambiguously:
      // 1. /veta-trading-platform/... (basepath-prefixed)
      // 2. https://milesburton.github.io/veta-trading-platform/... (the deployed docs URL)
      let inSitePath: string | null = null;
      if (url.startsWith(`${DOCS_BASE}/`)) {
        inSitePath = url.slice(DOCS_BASE.length);
      } else if (url.startsWith(`${PUBLIC_DOCS_HOST}/`)) {
        inSitePath = url.slice(PUBLIC_DOCS_HOST.length);
      } else if (url === DOCS_BASE || url === PUBLIC_DOCS_HOST) {
        // Root with a fragment is unusual but valid.
        inSitePath = "/";
      }
      if (inSitePath === null) continue;

      const [pathPart, fragment] = inSitePath.split("#", 2);
      const targetSlug = pathPart.replace(/^\/+|\/+$/g, "");

      const resolved = await resolveSlugToFile(targetSlug);
      if (!resolved) {
        broken.push({
          docPath: docPath.replace(REPO_ROOT, ""),
          link: url,
          reason: `target page "${targetSlug}" does not exist`,
        });
        continue;
      }

      let anchors = anchorCache.get(resolved);
      if (!anchors) {
        anchors = await extractAnchors(resolved);
        anchorCache.set(resolved, anchors);
      }
      if (!anchors.has(fragment)) {
        const sample = [...anchors].slice(0, 5).join(", ");
        broken.push({
          docPath: docPath.replace(REPO_ROOT, ""),
          link: url,
          reason: `anchor #${fragment} not found in ${resolved.replace(REPO_ROOT, "")} (have: ${sample}${anchors.size > 5 ? ", ..." : ""})`,
        });
      }
    }
  }

  assertEquals(
    broken,
    [],
    `Cross-page heading anchor links in docs do not resolve:\n` +
      broken
        .map((b) => `  ${b.docPath} -> ${b.link}\n      (${b.reason})`)
        .join("\n"),
  );
});
