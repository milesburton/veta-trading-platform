import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const docsSiteRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(docsSiteRoot, "..", "..");
const outputPath = path.resolve(
  docsSiteRoot,
  "src/content/docs/reference/tech-stack.mdx",
);

const coreLinks = {
  deno: "https://deno.com/",
  typescript: "https://www.typescriptlang.org/",
  node: "https://nodejs.org/",
  docker: "https://www.docker.com/",
  react: "https://react.dev/",
  "react-dom": "https://react.dev/",
  "@reduxjs/toolkit": "https://redux-toolkit.js.org/",
  "react-redux": "https://react-redux.js.org/",
  vite: "https://vite.dev/",
  vitest: "https://vitest.dev/",
  playwright: "https://playwright.dev/",
  electron: "https://www.electronjs.org/",
  astro: "https://astro.build/",
  "@astrojs/starlight": "https://starlight.astro.build/",
  tailwindcss: "https://tailwindcss.com/",
  postcss: "https://postcss.org/",
  autoprefixer: "https://github.com/postcss/autoprefixer",
  kafkajs: "https://kafka.js.org/",
  zod: "https://zod.dev/",
  rrweb: "https://www.rrweb.io/",
  "rrweb-player": "https://www.rrweb.io/",
  "lightweight-charts": "https://tradingview.github.io/lightweight-charts/",
  recharts: "https://recharts.org/",
  "flexlayout-react": "https://github.com/caplin/FlexLayout",
  "react-grid-layout": "https://github.com/react-grid-layout/react-grid-layout",
  "react-resizable-panels": "https://github.com/bvaughn/react-resizable-panels",
  uuid: "https://www.npmjs.com/package/uuid",
  husky: "https://typicode.github.io/husky/",
  "lint-staged": "https://github.com/lint-staged/lint-staged",
  biome: "https://biomejs.dev/",
  postgresql: "https://www.postgresql.org/",
  redpanda: "https://redpanda.com/",
  grafana: "https://grafana.com/",
  prometheus: "https://prometheus.io/",
  loki: "https://grafana.com/oss/loki/",
  tempo: "https://grafana.com/oss/tempo/",
  traefik: "https://traefik.io/",
  ollama: "https://ollama.com/",
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function relToRepo(absPath) {
  return path.relative(repoRoot, absPath).replaceAll(path.sep, "/");
}

function npmLink(pkgName) {
  return `https://www.npmjs.com/package/${encodeURIComponent(pkgName)}`;
}

function dockerLink(imageName) {
  const noTag = imageName.split("@")[0].split(":")[0];
  const stripped = noTag.startsWith("docker.io/")
    ? noTag.slice("docker.io/".length)
    : noTag;

  const first = stripped.split("/")[0] || "";
  const hasRegistryPrefix = first.includes(".") || first.includes(":");

  if (stripped.startsWith("ghcr.io/")) {
    const parts = stripped.split("/");
    if (parts.length >= 3) {
      return `https://github.com/${parts[1]}/${parts[2]}`;
    }
    return "https://github.com/";
  }

  if (stripped.startsWith("quay.io/")) {
    return `https://quay.io/repository/${stripped.replace("quay.io/", "")}`;
  }

  if (hasRegistryPrefix) {
    const registry = first;
    return `https://${registry}/`;
  }

  if (!stripped.includes("/")) {
    return `https://hub.docker.com/_/${stripped}`;
  }

  return `https://hub.docker.com/r/${stripped}`;
}

function parseDenoImports(denoJsonPath) {
  const deno = readJson(denoJsonPath);
  const imports = deno.imports || {};
  const packages = new Map();

  for (const value of Object.values(imports)) {
    if (typeof value !== "string" || !value.startsWith("npm:")) {
      continue;
    }
    const spec = value.slice("npm:".length);
    const atIndex = spec.lastIndexOf("@");
    const name = atIndex > 0 ? spec.slice(0, atIndex) : spec;
    const version = atIndex > 0 ? spec.slice(atIndex + 1) : "";
    packages.set(name, version);
  }

  return packages;
}

function parsePackageDeps(packageJsonPath) {
  const json = readJson(packageJsonPath);
  const deps = new Map();

  const sections = ["dependencies", "devDependencies", "peerDependencies"];
  for (const section of sections) {
    const entries = json[section] || {};
    for (const [name, version] of Object.entries(entries)) {
      deps.set(name, String(version));
    }
  }

  return deps;
}

function parseComposeImages(composePath) {
  const text = fs.readFileSync(composePath, "utf8");
  const images = new Set();
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("image:")) {
      continue;
    }
    const raw = trimmed.slice("image:".length).trim();
    const cleaned = raw.replace(/^['\"]|['\"]$/g, "");
    if (cleaned) {
      images.add(cleaned);
    }
  }

  return images;
}

function toSortedRows(mapOrSet) {
  return Array.from(mapOrSet).sort((a, b) => {
    const left = Array.isArray(a) ? a[0] : a;
    const right = Array.isArray(b) ? b[0] : b;
    return left.localeCompare(right);
  });
}

function renderPackageTable(title, sourcePath, packageMap) {
  const entries = toSortedRows(Array.from(packageMap.entries()));
  if (entries.length === 0) {
    return `## ${title}\n\nNo packages found.\n`;
  }

  const rows = entries
    .map(([name, version]) => {
      const explicit =
        coreLinks[name] || coreLinks[name.replace(/^@[^/]+\//, "")];
      const link = explicit || npmLink(name);
      return `| [${name}](${link}) | \`${version}\` |`;
    })
    .join("\n");

  return [
    `## ${title}`,
    "",
    `Source: \`${sourcePath}\`.`,
    "",
    "| Technology | Version specifier |",
    "|---|---|",
    rows,
    "",
  ].join("\n");
}

function renderImageTable(imageSet, sourcePaths) {
  const entries = toSortedRows(imageSet);
  if (entries.length === 0) {
    return "## Container images\n\nNo container images found.\n";
  }

  const rows = entries
    .map((image) => `| [${image}](${dockerLink(image)}) |`)
    .join("\n");

  return [
    "## Container images",
    "",
    `Sources: ${sourcePaths.map((p) => `\`${p}\``).join(", ")}.`,
    "",
    "| Image |",
    "|---|",
    rows,
    "",
  ].join("\n");
}

function renderCoreTechnologies() {
  const core = [
    ["Deno", coreLinks.deno],
    ["TypeScript", coreLinks.typescript],
    ["Node.js", coreLinks.node],
    ["Docker", coreLinks.docker],
    ["PostgreSQL", coreLinks.postgresql],
    ["Redpanda", coreLinks.redpanda],
    ["Traefik", coreLinks.traefik],
    ["Prometheus", coreLinks.prometheus],
    ["Grafana", coreLinks.grafana],
    ["Loki", coreLinks.loki],
    ["Tempo", coreLinks.tempo],
    ["Ollama", coreLinks.ollama],
  ];

  const rows = core.map(([name, link]) => `- [${name}](${link})`).join("\n");
  return ["## Core platform technologies", "", rows, ""].join("\n");
}

function generate() {
  const denoJsonPath = path.resolve(repoRoot, "deno.json");
  const rootPackagePath = path.resolve(repoRoot, "package.json");
  const frontendPackagePath = path.resolve(repoRoot, "frontend/package.json");
  const docsPackagePath = path.resolve(docsSiteRoot, "package.json");

  const composePaths = [
    path.resolve(repoRoot, "compose.yml"),
    path.resolve(repoRoot, "compose.prod.yml"),
    path.resolve(repoRoot, "observability/docker-compose.lgtm.yml"),
  ].filter((p) => fs.existsSync(p));

  const denoPackages = parseDenoImports(denoJsonPath);
  const rootPackages = parsePackageDeps(rootPackagePath);
  const frontendPackages = parsePackageDeps(frontendPackagePath);
  const docsPackages = parsePackageDeps(docsPackagePath);

  const imageSet = new Set();
  for (const composePath of composePaths) {
    const images = parseComposeImages(composePath);
    for (const image of images) {
      imageSet.add(image);
    }
  }

  const content = [
    "---",
    "title: Tech Stack",
    "description: Auto-generated technology inventory derived at build time from repository manifests.",
    "---",
    "",
    "This page is generated automatically during docs build and should not be edited manually.",
    "",
    renderCoreTechnologies(),
    renderPackageTable(
      "Backend and workspace packages",
      relToRepo(rootPackagePath),
      rootPackages,
    ),
    renderPackageTable(
      "Frontend packages",
      relToRepo(frontendPackagePath),
      frontendPackages,
    ),
    renderPackageTable(
      "Docs site packages",
      relToRepo(docsPackagePath),
      docsPackages,
    ),
    renderPackageTable(
      "Deno npm imports",
      relToRepo(denoJsonPath),
      denoPackages,
    ),
    renderImageTable(imageSet, composePaths.map(relToRepo)),
  ].join("\n");

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content);
  console.log(`Generated ${path.relative(repoRoot, outputPath)}`);
}

generate();
