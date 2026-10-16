import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsSiteRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(docsSiteRoot, "..", "..");
const outputPath = path.resolve(docsSiteRoot, "src/data/test-inventory.json");

const unitExcludes = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "vitest.exclude.json"), "utf8"),
);
const integrationConfig = fs.readFileSync(
  path.join(repoRoot, "vitest.integration.config.ts"),
  "utf8",
);

function extractFilesFromTask(taskCmd) {
  if (!taskCmd) return [];
  const matches = taskCmd.match(/backend\/src\/tests\/[^\s&]+\.ts/g) ?? [];
  return [...new Set(matches)];
}

function ignoredBasenameMatchers(globs) {
  return globs
    .map((glob) => {
      const base = glob.replace(/^\*\*\//, "");
      if (base.includes("/")) {
        throw new Error(`Unsupported exclude pattern in vitest.exclude.json: ${glob}`);
      }
      const body = base
        .split("*")
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*");
      return new RegExp(`^${body}$`);
    });
}

function walkBackendTests(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : walkBackendTests(full);
    }
    return entry.isFile() && entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

function countBackendTests(absPath) {
  if (!fs.existsSync(absPath)) return 0;
  const content = fs.readFileSync(absPath, "utf8");
  const testCalls = (content.match(/(?<![\w.$])test\s*\(/g) ?? []).length;
  const tStep = (content.match(/\bt\.step\s*\(/g) ?? []).length;
  return testCalls + tStep;
}

function walkFrontendTests(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFrontendTests(full));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) &&
      full.includes(`${path.sep}__tests__${path.sep}`)
    ) {
      out.push(full);
    }
  }
  return out;
}

function countVitestCases(absPath) {
  const content = fs.readFileSync(absPath, "utf8");
  const itCalls = (content.match(/(?<![A-Za-z0-9_$])it\s*\(/g) ?? []).length;
  const testCalls = (content.match(/(?<![A-Za-z0-9_$])test\s*\(/g) ?? []).length;
  return itCalls + testCalls;
}

function countPlaywrightSpecs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".spec.ts"))
    .map((d) => d.name);
}

function backendSuite(taskCmd) {
  const files = extractFilesFromTask(taskCmd);
  let cases = 0;
  const perFile = {};
  for (const rel of files) {
    const c = countBackendTests(path.join(repoRoot, rel));
    cases += c;
    perFile[path.basename(rel)] = c;
  }
  return { files: files.length, cases, perFile };
}

function backendUnitSuite(excludeGlobs) {
  const ignored = ignoredBasenameMatchers(excludeGlobs);
  const counted = walkBackendTests(path.join(repoRoot, "backend"))
    .filter((full) => !ignored.some((re) => re.test(path.basename(full))))
    .sort()
    .map((full) => [path.basename(full), countBackendTests(full)]);
  return {
    files: counted.length,
    cases: counted.reduce((sum, [, c]) => sum + c, 0),
    perFile: Object.fromEntries(counted),
  };
}

const backendUnit = backendUnitSuite(unitExcludes);
const backendIntegration = backendSuite(integrationConfig);
const backendSmoke = backendSuite(undefined);
const backendTestcontainers = backendSuite(
  walkBackendTests(path.join(repoRoot, "backend/src/tests"))
    .filter((full) => /\.tc\.test\.ts$|testcontainers\.[^/]*\.test\.ts$/.test(full))
    .map((full) => path.relative(repoRoot, full))
    .join(" "),
);

const frontendTestRoot = path.join(repoRoot, "frontend/src");
const frontendTestFiles = walkFrontendTests(frontendTestRoot);
const frontendUnitCases = frontendTestFiles.reduce(
  (sum, f) => sum + countVitestCases(f),
  0,
);

const playwrightSpecs = countPlaywrightSpecs(
  path.join(repoRoot, "frontend/tests"),
);
const electronSpecs = countPlaywrightSpecs(
  path.join(repoRoot, "frontend/tests-electron"),
);
const gateSmokeFile = path.join(
  repoRoot,
  "frontend/tests/gate/smoke.spec.ts",
);
const gateSmokeCases = fs.existsSync(gateSmokeFile)
  ? countVitestCases(gateSmokeFile)
  : 0;

const supervisordConf = fs.readFileSync(
  path.join(repoRoot, "supervisord.conf"),
  "utf8",
);
const supervisordServiceCount = (
  supervisordConf.match(/^\[program:[^\]]+\]/gm) ?? []
).length;

const inventory = {
  backend: {
    unit: backendUnit,
    integration: backendIntegration,
    smoke: backendSmoke,
    testcontainers: backendTestcontainers,
  },
  frontend: {
    unit: { files: frontendTestFiles.length, cases: frontendUnitCases },
    playwright: { files: playwrightSpecs.length, specs: playwrightSpecs.sort() },
    electron: { files: electronSpecs.length, specs: electronSpecs.sort() },
    gateSmoke: { cases: gateSmokeCases },
  },
  platform: {
    supervisordServices: supervisordServiceCount,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(inventory, null, 2) + "\n");

console.log(
  `Generated ${path.relative(repoRoot, outputPath)} ` +
    `(backend unit ${backendUnit.files}/${backendUnit.cases}, ` +
    `frontend unit ${frontendTestFiles.length}/${frontendUnitCases}, ` +
    `playwright ${playwrightSpecs.length}, electron ${electronSpecs.length})`,
);
